import {boxFor} from './responsive.mjs';
import {timerValues,timerParts,remainingTimerSeconds,createTimerSession} from './timer.mjs';
import {ensureTextFont,runtimeFontFamily} from './text-fonts.mjs';
import {paintAccessibilityCss,paintForeground,paintBorder,paintShadows,disposePaints} from './paint-runtime.mjs';
import {paintFallback} from './paint.mjs';

export const timerCss=paintAccessibilityCss+`
.kk-timer,.kk-timer *{box-sizing:border-box}.kk-timer{position:relative;overflow:visible!important;background:transparent!important;border:0!important;padding:0!important;white-space:normal!important;line-height:1.2!important}
.kk-timer-content{position:absolute;left:50%;top:50%;display:flex;flex-direction:column;align-items:center;width:max-content;max-width:none;transform-origin:center;gap:8px}
.kk-timer-row{display:flex;align-items:flex-start;width:max-content}.kk-timer-block{position:relative;display:flex;flex-direction:column;align-items:center;flex:none;min-width:0}
.kk-timer-number{position:relative;display:block;white-space:pre;font-variant-numeric:tabular-nums;font-feature-settings:'tnum';text-align:center;line-height:1.2}
.kk-timer-label{position:relative;display:block;white-space:pre;text-align:center;line-height:1.3;font-weight:400}.kk-timer-separator{display:block;flex:none;line-height:1.2;white-space:pre}
.kk-timer-message{position:relative;max-width:100%;text-align:center;white-space:normal;overflow-wrap:anywhere;line-height:1.3;font-weight:400}.kk-timer [hidden]{display:none!important}
@media(forced-colors:active){.kk-timer-block{border:1px solid CanvasText!important}}
`;
const create=(tag,name)=>{const node=document.createElement(tag);node.className=name;return node;};
let browserSession;
function storefrontSession(){if(!browserSession){let storage;try{storage=globalThis.localStorage;}catch{/* Page-memory fallback. */}browserSession=createTimerSession(storage);}return browserSession;}

/** Persistent UUID nodes; a tick changes only text, never the document or neighboring controls. */
export function mountTimerContent(target,initial,options={}){
 const content=create('div','kk-timer-content'),row=create('div','kk-timer-row'),message=create('div','kk-timer-message');
 content.append(row,message);target.classList.add('kk-timer');target.replaceChildren(content);target.setAttribute('role','timer');target.setAttribute('aria-live','off');message.setAttribute('role','status');
 let element=initial,device=options.device||'desktop',dead=false,started=false,closed=false,expired=!!options.timerExpired,endAt=null,timeout,frame,signature='',unitsKey='',slots=[],lastSeconds=undefined;
 const mode=options.mode||'storefront',session=options.timerSession||(mode==='storefront'?storefrontSession():createTimerSession());
 const identity=()=>({shopId:options.shopId||'preview',widgetId:options.widgetId||'preview',elementId:element.id||'preview'});
 function config(){return element.content.timer;}
 function sample(){return config().mode==='duration'?config().durationSeconds:2*86400+14*3600+35*60+8;}
 function resolve(){endAt=session.resolve(identity(),config());}
 function schedule(){clearTimeout(timeout);if(dead||mode==='editor'||document.hidden||!started)return;timeout=setTimeout(tick,1000-Date.now()%1000+5);}
 function activate(){
  if(dead||mode==='editor')return;
  if(!target.isConnected||mode==='storefront'&&config().mode==='duration'&&(!target.getClientRects().length||getComputedStyle(target).visibility!=='visible')){frame=requestAnimationFrame(activate);return;}
  if(document.hidden)return;
  if(!started){started=true;resolve();renderTime();fit();}schedule();
 }
 function tick(){if(dead)return;if(!started){activate();return;}renderTime();schedule();}
 function seconds(){return mode==='editor'?sample():expired?0:endAt===null?null:remainingTimerSeconds(endAt);}
 function renderTime(){
  const t=config(),left=seconds(),done=mode!=='editor'&&left===0;
  if(left===lastSeconds)return;lastSeconds=left;target.dataset.timerState=left===null?'empty':done?'expired':'running';
  target.style.visibility=done&&t.finish==='hide'?'hidden':'';
  const parts=timerParts(left??sample(),t.units);
  for(let i=0;i<slots.length;i++){const value=String(parts[i].value).padStart(2,'0');if(slots[i].number.textContent!==value)slots[i].number.textContent=value;}
  const notice=left===null?'Оберіть дату завершення':done&&t.finish==='message'?t.finishText:'';
  message.hidden=!notice;if(message.textContent!==notice){message.textContent=notice;fit();}
  target.setAttribute('aria-label',left===null?'Таймер: дату не обрано':done?'Час вичерпано':`Залишилось: ${parts.map(p=>`${p.value} ${t.labels[p.unit]||p.unit}`).join(', ')}`);
  if(done&&t.finish==='close'&&!closed){closed=true;queueMicrotask(()=>{if(!dead)options.onClose?.();});}
 }
 function fit(){
  if(dead)return;const box=boxFor(element,device),width=content.offsetWidth,height=content.offsetHeight;
  const scale=width&&height?Math.min(1,box.width/width,box.height/height):1;
  content.style.transform=`translate(-50%,-50%) scale(${scale})`;
 }
 function draw(){
  const t=config(),box=boxFor(element,device),s=box.scale||1,v=timerValues(element.content,device),cards=v.appearance==='cards';
  target.dataset.timerAppearance=v.appearance;ensureTextFont(v.fontFamily,false,options.apiBase);
  Object.assign(target.style,{width:`${box.width}px`,height:`${box.height}px`,fontFamily:`"${runtimeFontFamily(v.fontFamily)}",Arial,sans-serif`,fontSize:`${v.fontSize*s}px`,fontWeight:String(v.fontWeight),color:v.color,transform:'none'});
  Object.assign(content.style,{gap:`${8*s}px`});row.style.gap=`${v.gap*s}px`;
  const key=JSON.stringify([t.units,t.separator]);
  if(unitsKey!==key){
   unitsKey=key;for(const slot of slots)disposePaints(slot.block);slots=[];row.replaceChildren();
   for(const [index,unit]of t.units.entries()){
    if(index&&t.separator){const separator=create('span','kk-timer-separator');separator.textContent=t.separator;separator.setAttribute('aria-hidden','true');row.append(separator);}
    const block=create('div','kk-timer-block'),number=create('span','kk-timer-number'),label=create('span','kk-timer-label');block.append(number,label);row.append(block);slots.push({unit,block,number,label});
   }
  }
  const largest=timerParts(Math.max(sample(),endAt===null?0:remainingTimerSeconds(endAt)),t.units)[0].value,digits=Math.max(2,String(largest).length),divisors={days:86400,hours:3600,minutes:60,seconds:1};
  for(const [index,slot]of slots.entries()){
   const {block,number,label,unit}=slot;label.textContent=t.labels[unit];label.hidden=!t.showLabels||!t.labels[unit];
   Object.assign(block.style,{padding:`${(cards?v.padding:0)*s}px`,gap:`${v.labelGap*s}px`,background:cards?v.background:'transparent',border:`${(cards?v.borderWidth:0)*s}px solid ${paintFallback(v.borderColor)}`,borderRadius:`${v.radius*s}px`});
   const reserved=index===0?digits:Math.max(2,String(divisors[t.units[index-1]]/divisors[unit]-1).length);
   number.style.minWidth=`${reserved}ch`;Object.assign(label.style,{fontSize:`${v.labelSize*s}px`,color:v.labelColor});
   paintForeground(number,v.color);paintForeground(label,v.labelColor);paintBorder(block,cards?v.borderColor:'#00000000');paintShadows(block,cards&&v.shadowBlur?[{color:v.shadowColor,x:0,y:v.shadowY,blur:v.shadowBlur,spread:0}]:[],s);
  }
  for(const separator of row.querySelectorAll('.kk-timer-separator')){separator.style.paddingTop=`${(cards?v.padding+v.borderWidth:0)*s}px`;paintForeground(separator,v.color);}
  Object.assign(message.style,{fontSize:`${v.labelSize*s}px`,width:`${Math.max(box.width,160)}px`});paintForeground(message,v.labelColor);
  lastSeconds=undefined;renderTime();fit();
 }
 function configure(){
  const t=config(),key=JSON.stringify([t.mode,t.endAt,t.durationSeconds]);
  if(key!==signature){signature=key;closed=false;if(started)resolve();else endAt=t.mode==='deadline'?t.endAt:null;}
  draw();
 }
 function visibility(){if(!document.hidden){if(started){renderTime();fit();schedule();}else activate();}else clearTimeout(timeout);}
 function storage(){if(started&&config().mode==='duration'){resolve();renderTime();}}
 function fontReady(){draw();}
 document.addEventListener('visibilitychange',visibility);if(mode==='storefront')window.addEventListener('storage',storage);window.addEventListener('kramkin:text-font-ready',fontReady);
 configure();if(mode!=='editor')frame=requestAnimationFrame(activate);
 return {node:target,update(next){element=next;configure();},layout(nextDevice){device=nextDevice;draw();},setExpired(value){expired=value;lastSeconds=undefined;renderTime();fit();},destroy(){dead=true;clearTimeout(timeout);cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('storage',storage);window.removeEventListener('kramkin:text-font-ready',fontReady);for(const slot of slots)disposePaints(slot.block);disposePaints(target);}};
}
