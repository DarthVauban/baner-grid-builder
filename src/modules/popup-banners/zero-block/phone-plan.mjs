/** Bounded digit-pattern NFA for trusted numbering metadata, not user-supplied regular expressions. */
export function compilePhonePlan(types, limit) {
  const states=[];
  const state=()=>{states.push({epsilon:[],edges:[],accept:0});return states.length-1;};
  const start=state();
  function parse(pattern) {
    let at=0;
    function alternate(){const choices=[sequence()];while(pattern[at]==='|'){at++;choices.push(sequence());}return choices.length===1?choices[0]:['alt',choices];}
    function sequence(){const parts=[];while(at<pattern.length&&![')', '|'].includes(pattern[at]))parts.push(term());return ['seq',parts];}
    function term(){
      let node;const token=pattern[at++];
      if(token==='('){if(pattern.slice(at,at+2)==='?:')at+=2;node=alternate();if(pattern[at++]!==')')throw new Error('Unclosed phone pattern group');}
      else if(token==='['){const end=pattern.indexOf(']',at);if(end<0)throw new Error('Unclosed phone pattern class');const re=new RegExp(`^[${pattern.slice(at,end)}]$`);let mask=0;for(let digit=0;digit<10;digit++)if(re.test(String(digit)))mask|=1<<digit;node=['digit',mask];at=end+1;}
      else if(token==='\\'&&pattern[at++]==='d')node=['digit',1023];
      else if(/[0-9]/.test(token||''))node=['digit',1<<Number(token)];
      else throw new Error('Unsupported phone pattern token');
      const quantifier=pattern[at];let min,max;
      if(quantifier==='?'){min=0;max=1;at++;}
      else if(quantifier==='*'||quantifier==='+'){min=quantifier==='*'?0:1;max=limit;at++;}
      else if(quantifier==='{'){const match=/^\{(\d+)(?:,(\d*))?\}/.exec(pattern.slice(at));if(!match)throw new Error('Invalid phone pattern repetition');min=Number(match[1]);max=match[2]===undefined?min:match[2]===''?limit:Number(match[2]);at+=match[0].length;}
      return min===undefined?node:['repeat',node,min,Math.min(max,limit)];
    }
    const result=alternate();if(at!==pattern.length)throw new Error('Unexpected phone pattern suffix');return result;
  }
  function connect(node,from,to){
    const [kind,value,min,max]=node;
    if(kind==='digit')states[from].edges.push([value,to]);
    else if(kind==='alt')for(const choice of value)connect(choice,from,to);
    else if(kind==='seq'){
      if(!value.length)states[from].epsilon.push(to);
      let current=from;for(let i=0;i<value.length;i++){const next=i===value.length-1?to:state();connect(value[i],current,next);current=next;}
    }else if(kind==='repeat'){
      if(max<min)return;
      let current=from;
      for(let i=0;i<max;i++){if(i>=min)states[current].epsilon.push(to);const next=i===max-1?to:state();connect(value,current,next);current=next;}
      if(min===0&&max===0)states[from].epsilon.push(to);
    }
  }
  for(const {pattern,lengths} of types){
    const allowed=lengths.filter(length=>length<=limit);if(!allowed.length)continue;
    const end=state();connect(parse(pattern),start,end);states[end].accept=allowed.reduce((bits,length)=>bits|(1<<length),0);
  }
  function closure(initial){const result=new Set(initial),queue=[...result];while(queue.length){const current=queue.pop();for(const next of states[current].epsilon)if(!result.has(next)){result.add(next);queue.push(next);}}return result;}
  function advance(active,digit){const next=new Set();for(const current of active)for(const [mask,target] of states[current].edges)if(digit===undefined||mask&(1<<digit))next.add(target);return closure(next);}
  function completions(active,used){const result=[];for(let count=used;count<=limit&&active.size;count++){if([...active].some(current=>states[current].accept&(1<<count)))result.push(count);active=advance(active);}return result;}
  const initial=closure([start]),all=completions(initial,0);
  return {
    lengths(prefix='',fallback=true,defaultLengths=all){
      const path=[initial];let active=initial;
      for(const digit of prefix){active=advance(active,Number(digit));if(!active.size)break;path.push(active);}
      const exact=path.length===prefix.length+1?completions(active,prefix.length):[];
      if(exact.length||!fallback)return exact;
      // A digit beyond the valid pattern retains that prefix's cap, rather than widening to a service-number cap.
      for(let used=path.length-1;used>0;used--){const lengths=completions(path[used],used);if(lengths.length)return lengths;}
      return defaultLengths;
    }
  };
}
