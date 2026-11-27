import {boxFor} from './responsive.mjs';
import {isGradient,paintFallback} from './paint.mjs';
import {paintForeground,paintBorder,paintShadows,paintGlyphEffects,disposePaints,resetForeground} from './paint-runtime.mjs';
import {textValues,textFallback,textRich} from './text.mjs';
import {renderRichText} from './rich-text.mjs';
import {shapeShadowCss} from './shape.mjs';
import {ensureTextFont,runtimeFontFamily} from './text-fonts.mjs';
import {syncTextMarkup} from './dom.mjs';
const sides=['top','right','bottom','left'];
const geo=(element,device)=>boxFor(element,device);
const font=value=>value==='inherit'?'Arial, sans-serif':`"${runtimeFontFamily(value)}", ${['Georgia','Times New Roman'].includes(value)?'serif':'sans-serif'}`;
/** Owner typography is separate from administrative UI tokens. */
export function applyTextStyles(target,body,element,device='desktop',options={}){
 const box=geo(element,device),scale=box.scale||1,v=textValues(element.content,device,textFallback(element,device));
 ensureTextFont(v.fontFamily,false,options.apiBase);if(textRich(element.content).blocks.some(block=>block.runs.some(run=>run.italic&&!run.fontFamily)))ensureTextFont(v.fontFamily,true,options.apiBase);
 target.dataset.textScale=String(scale);
 Object.assign(target.style,{boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:{top:'flex-start',middle:'center',bottom:'flex-end'}[v.verticalAlign],color:v.color,fontFamily:font(v.fontFamily),fontSize:`${v.fontSize*scale}px`,fontWeight:String(v.fontWeight),textAlign:v.align,lineHeight:v.lineHeightUnit==='px'?`${v.lineHeight*scale}px`:String(v.lineHeight),letterSpacing:`${v.letterSpacing*scale}px`,textTransform:v.letterCase,background:v.background,padding:sides.map(key=>`${v.padding[key]*scale}px`).join(' '),borderStyle:v.border.style,borderColor:v.border.color,borderWidth:sides.map(key=>`${v.border.widths[key]*scale}px`).join(' '),borderRadius:['topLeft','topRight','bottomRight','bottomLeft'].map(key=>`${v.corners[key]*scale}px`).join(' '),boxShadow:shapeShadowCss(v.shadows,scale),opacity:String(v.opacity/100),width:`${box.width}px`,height:v.fit==='auto-height'||v.fit==='auto-width'||v.fit==='single-line'?'auto':`${box.height}px`,transformOrigin:'center',transform:options.measurement?'none':`rotate(${v.rotation}deg)`,minWidth:'16px',minHeight:'16px',overflow:'visible'});
 Object.assign(body.style,{boxSizing:'border-box',width:'100%',minWidth:'0',flexShrink:'0',outline:options.editing?'':'none',whiteSpace:v.fit==='auto-width'||v.fit==='single-line'?'pre':'pre-wrap',overflowWrap:v.fit==='auto-width'||v.fit==='single-line'?'normal':'anywhere',wordBreak:'normal',transform:options.measurement?'none':`scale(${v.flipX?-1:1},${v.flipY?-1:1})`,textShadow:shapeShadowCss(v.textShadows.map(s=>({...s,spread:0})),scale).replace(/ (?:-?[\d.]+)px (?=rgba)/g,' '),webkitTextStroke:v.stroke.width?`${v.stroke.width*scale}px ${isGradient(v.stroke.color)?'transparent':paintFallback(v.stroke.color)}`:'',paintOrder:'stroke fill',overflow:v.fit==='single-line'&&!options.editing?'hidden':'visible',textOverflow:v.fit==='single-line'&&!options.editing?'ellipsis':'clip',display:'block',webkitLineClamp:'',webkitBoxOrient:'',maxHeight:''});
 paintBorder(target,v.border.color);paintShadows(target,v.shadows,scale);paintForeground(body,v.color);paintGlyphEffects(body,v,scale);
 if(v.fit==='auto-width'){target.style.width='max-content';body.style.width='max-content';}
 if(!options.editing&&v.truncate.type==='lines'){Object.assign(body.style,{display:'-webkit-box',webkitLineClamp:String(v.truncate.value),webkitBoxOrient:'vertical',overflow:'hidden'});}
 if(v.fit==='fixed'&&!options.editing)target.style.overflow='hidden';
 return v;
}
function displayValue(content,values,editing=false){
 const rich=structuredClone(textRich(content));if(editing)return rich;if(values.fit==='single-line'){const runs=[];for(const [at,block]of rich.blocks.entries()){if(at)runs.push({text:' '});runs.push(...block.runs.map(run=>({...run,text:run.text.replace(/\n/g,' ')})));}rich.blocks=[{runs}];}if(values.truncate.type!=='characters')return rich;
 let remaining=values.truncate.value,cut=false;
 for(const block of rich.blocks)for(const run of block.runs){const chars=Array.from(run.text);if(chars.length>remaining){run.text=chars.slice(0,remaining).join('');if(!cut)run.text+='…';cut=true;}else if(remaining===0)run.text='';remaining=Math.max(0,remaining-chars.length);}
 return rich;
}
export function mountTextContent(target,element,options={}){
 const body=document.createElement('div');body.className='kk-text-body';target.replaceChildren(body);let device=options.device||'desktop',contentKey='';
 function draw(){const values=applyTextStyles(target,body,element,device,options),value=displayValue(element.content,values),settings={maxLength:1000000,interactive:options.mode!=='editor'&&element.role==='decorative',scale:geo(element,device).scale||1,apiBase:options.apiBase},key=JSON.stringify([value,settings.interactive,settings.scale]);if(key!==contentKey){contentKey=key;if(options.mode==='editor'){const fresh=document.createElement('div');renderRichText(fresh,value,settings);disposePaints(body);for(const node of [body,...body.querySelectorAll('*')])resetForeground(node);syncTextMarkup(body,fresh);}else renderRichText(body,value,settings);if(options.mode==='preview')body.querySelectorAll('a').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();options.onNotice?.('У прев’ю перехід вимкнено');}));}paintForeground(body,values.color);paintGlyphEffects(body,values,geo(element,device).scale||1);if(body.firstElementChild)body.firstElementChild.style.display=values.fit==='single-line'?'inline':'';}
 draw();return {body,layout(next){device=next;draw();},destroy(){disposePaints(target);}};
}
/** Browser DOM metrics, using the exact content/styles above and no camera transforms. */
export function measureTextContent(element,device='desktop'){
 const box=geo(element,device);if(typeof document==='undefined')return {width:box.width,height:box.height};
 const target=document.createElement('div'),body=document.createElement('div');target.append(body);target.style.position='fixed';target.style.left='-100000px';target.style.top='0';target.style.visibility='hidden';target.style.pointerEvents='none';target.style.contain='layout style';
 const v=applyTextStyles(target,body,element,device,{measurement:true});renderRichText(body,displayValue(element.content,v),{maxLength:1000000,interactive:element.role==='decorative',scale:box.scale||1});
 if(v.fit==='single-line'&&body.firstElementChild)body.firstElementChild.style.display='inline';
 document.body.append(target);let width=box.width,height=box.height;
 try{const rect=target.getBoundingClientRect();if(v.fit==='auto-width')width=Math.max(16,Math.ceil(rect.width));if(v.fit!=='fixed')height=Math.max(16,Math.ceil(rect.height));}finally{disposePaints(target);target.remove();}
 return {width,height};
}
