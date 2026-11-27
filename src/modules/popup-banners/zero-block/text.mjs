import {boxFor} from './responsive.mjs';
import {styleLayer,responsiveValues,styleFor} from './responsive.mjs';
import {isPaint} from './paint.mjs';
import {richTextFromPlain,richTextPlain,validateRichText,RICH_FONTS} from './rich-text.mjs';
import {validateShapeContent} from './shape.mjs';

export const TEXT_GROUPS=['Типографіка','Розмір і розміщення','Оформлення літер','Фон і відступи','Контур','Тіні','Посилання'];
export const TEXT_FITS=[['auto-height','Авто висота'],['auto-width','Авто ширина'],['fixed','Фіксований розмір'],['single-line','Один рядок']];
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=(v,names)=>Object.keys(v).every(key=>names.includes(key));
const number=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
const hex=isPaint;
const fail=message=>{throw new Error(message||'Некоректне оформлення тексту');};
export function textData(content){return {version:1,base:content.typography?{}:{fit:'fixed'},...content.typography};}
export function textRich(content){return content.richText||richTextFromPlain(content.text||'');}
export function textGroups(device='desktop'){return TEXT_GROUPS.filter(name=>name!=='Посилання'||device==='desktop');}
export function textLocked(element){return element.type==='text'&&element.content.typography?.locked===true;}
export function textValues(content,device='desktop',fallback={}){
 const scale=fallback.scale||1;
 return {fontFamily:'Arial',fontSize:(fallback.fontSize??24)/scale,fontWeight:fallback.fontWeight??500,color:fallback.color||'#25231F',align:fallback.textAlign||'left',lineHeight:1.35,lineHeightUnit:'em',letterSpacing:0,letterCase:'none',fit:content.typography?'auto-height':'fixed',verticalAlign:'top',opacity:100,rotation:0,flipX:false,flipY:false,background:fallback.background||'#FFFFFF00',padding:{top:0,right:0,bottom:0,left:0},corners:Object.fromEntries(['topLeft','topRight','bottomRight','bottomLeft'].map(key=>[key,(fallback.radius||0)/scale])),border:{color:'#25231F',style:'solid',widths:{top:0,right:0,bottom:0,left:0}},shadows:[],textShadows:[],stroke:{color:'#25231F',width:0},truncate:{type:'none',value:1},...responsiveValues(content.typography,device)};
}
export function textFallback(element,device='desktop'){
 const box=boxFor(element,device);
 return {...element.style,fontSize:styleFor(element,device).fontSize,radius:styleFor(element,device).radius,scale:box.scale||1};
}
export function validateTextContent(content){
 if(!object(content)||!keys(content,['text','richText','typography'])||typeof content.text!=='string'||content.text.length>5000||/[\u0000-\u0008\u000e-\u001f]/.test(content.text))fail('Текст — до 5000 символів');
 if(content.richText!==undefined){validateRichText(content.richText);if(richTextPlain(content.richText)!==content.text)fail('Текст і форматування мають збігатися');}
 const config=content.typography;if(config===undefined)return content;
 if(!object(config)||!keys(config,['version','base','mobile','laptop','tablet','mobileLandscape','locked','nofollow'])||config.version!==1||['locked','nofollow'].some(key=>config[key]!==undefined&&typeof config[key]!=='boolean'))fail();
 for(const layer of ['base','mobile','laptop','tablet','mobileLandscape']){
  const v=config[layer];if(v===undefined)continue;
  if(!object(v)||!keys(v,['fontFamily','fontSize','fontWeight','color','align','lineHeight','lineHeightUnit','letterSpacing','letterCase','fit','verticalAlign','opacity','rotation','flipX','flipY','background','padding','corners','border','shadows','textShadows','stroke','truncate']))fail('Невідомий параметр тексту');
  for(const [key,min,max]of [['fontSize',8,300],['fontWeight',100,900],['lineHeight',.5,500],['letterSpacing',-10,100],['opacity',0,100],['rotation',-360,360]])if(v[key]!==undefined&&!number(v[key],min,max))fail();
  if(v.fontWeight!==undefined&&!Number.isInteger(v.fontWeight))fail();
  for(const key of ['color','background'])if(v[key]!==undefined&&!hex(v[key]))fail('Некоректний колір тексту');
  if(v.fontFamily!==undefined&&!RICH_FONTS.includes(v.fontFamily)||v.align!==undefined&&!['left','center','right','justify'].includes(v.align)||v.lineHeightUnit!==undefined&&!['em','px'].includes(v.lineHeightUnit)||v.letterCase!==undefined&&!['none','uppercase','capitalize','lowercase'].includes(v.letterCase)||v.fit!==undefined&&!TEXT_FITS.some(([key])=>key===v.fit)||v.verticalAlign!==undefined&&!['top','middle','bottom'].includes(v.verticalAlign))fail();
  for(const key of ['flipX','flipY'])if(v[key]!==undefined&&typeof v[key]!=='boolean')fail();
  if(v.padding!==undefined&&(!object(v.padding)||!keys(v.padding,['top','right','bottom','left'])||!['top','right','bottom','left'].every(key=>number(v.padding[key],0,500))))fail('Некоректні відступи тексту');
  if(v.stroke!==undefined&&(!object(v.stroke)||!keys(v.stroke,['color','width'])||!hex(v.stroke.color)||!number(v.stroke.width,0,10)))fail('Некоректне обведення літер');
  if(v.truncate!==undefined&&(!object(v.truncate)||!keys(v.truncate,['type','value'])||!['none','lines','characters'].includes(v.truncate.type)||!Number.isInteger(v.truncate.value)||!number(v.truncate.value,1,5000)))fail('Некоректне обмеження тексту');
  const shape={};for(const key of ['corners','border','shadows'])if(v[key]!==undefined)shape[key]=v[key];
  if(v.textShadows!==undefined)shape.hoverShadows=v.textShadows;
  validateShapeContent({accessibleName:'',shape:{version:1,kind:'rectangle',base:shape}});
 }
 return content;
}
export function updateTextStyle(content,device,patch){const next=structuredClone(content);next.typography=textData(next);const key=styleLayer(device);next.typography[key]||={};for(const [name,value]of Object.entries(patch)){if(value===undefined)delete next.typography[key][name];else next.typography[key][name]=value;}return validateTextContent(next);}
export function updateTextGlobal(content,patch){const next=structuredClone(content);next.typography={...textData(next),...patch};return validateTextContent(next);}
export function updateTextRich(content,value){validateRichText(value);const next={...content,text:richTextPlain(value)};if(value.blocks.every(block=>Object.keys(block).length===1&&block.runs.every(run=>Object.keys(run).length===1)))delete next.richText;else next.richText=value;return validateTextContent(next);}
/** @returns {import('../ui/editor-controls').ResizeHandle[]|undefined} */
export function textHandles(content,device='desktop'){const fit=textValues(content,device).fit;return fit==='auto-height'||fit==='single-line'?['w','e']:fit==='auto-width'?[]:undefined;}
/** Local, deterministic typography correction. Does not send text to a provider. */
export function proofreadText(value){const next=structuredClone(value);for(const block of next.blocks)for(const run of block.runs)run.text=run.text.replace(/\.\.\./g,'…').replace(/(^|\s)--(?=\s|$)/g,'$1—').replace(/\b([AIai]|[Ii]s|[Tt]o|[Oo]f|[Ii]n|[Aa]s|[Bb]e) +(?=\S)/g,'$1\u00a0').replace(/(^|[\s(])([іІйЙуУвВзЗаАяЯ]|та|Та|до|До|на|На|не|Не|за|За|по|По|із|Із|зі|Зі) +(?=\S)/gu,'$1$2\u00a0');return next;}
