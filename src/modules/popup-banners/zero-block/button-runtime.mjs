import {boxFor} from './responsive.mjs';
import {paintForeground,paintBorder,paintShadows,bindPaintStates} from './paint-runtime.mjs';
import {paintFallback} from './paint.mjs';
import {buttonValues,buttonFallback} from './button.mjs';
import {shapeShadowCss} from './shape.mjs';
import {ensureTextFont,runtimeFontFamily} from './text-fonts.mjs';
import {paintZeroIcon} from './zero-form-runtime.mjs';
import {createSvgIcon} from './svg-icon.mjs';
export const buttonCss=`
.kk-styled-button{background:var(--kb-background);color:var(--kb-color);border-color:var(--kb-border);transition:background-color var(--kb-duration),color var(--kb-duration),border-color var(--kb-duration)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within){background:var(--kb-hover-background);color:var(--kb-hover-color);border-color:var(--kb-hover-border)}
.kk-element.kk-styled-button[data-type=button] .kk-action{box-sizing:border-box;display:block;width:100%;height:100%;min-width:0}
.kk-element.kk-styled-button[data-type=button]:has(>.kk-action:focus-visible){outline:3px solid #826324;outline-offset:2px}
.kk-element.kk-styled-button[data-type=button]>.kk-action:focus-visible{outline:none}
.kk-button-content{display:flex;align-items:center;min-width:0;min-height:0;width:100%;box-sizing:border-box}
.kk-button-caption{display:block;min-width:0;flex:0 1 auto;max-width:100%;box-sizing:border-box}
.kk-button-icon-slot{position:relative;display:inline-flex;flex:none;align-items:center;justify-content:center;line-height:1;transition:transform var(--kb-duration),opacity var(--kb-duration)}
.kk-button-icon{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;line-height:1;transition:opacity var(--kb-duration);pointer-events:none}
.kk-button-icon img,.kk-button-icon svg{display:block;width:100%;height:100%;object-fit:contain}
.kk-button-icon-hover{opacity:0}
.kk-styled-button[data-hover-icon][data-button-interactive]:is(:hover,:focus-within) .kk-button-icon-normal{opacity:0}
.kk-styled-button[data-hover-icon][data-button-interactive]:is(:hover,:focus-within) .kk-button-icon-hover{opacity:1}
.kk-styled-button [data-icon-effect=opacity100]{opacity:.5}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=rotate15]{transform:rotate(15deg)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=rotate360]{transform:rotate(360deg)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=scale]{transform:scale(1.2)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=scaleX]{transform:scaleX(1.2)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=scaleY]{transform:scaleY(1.2)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=moveX]{transform:translateX(5px)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=moveY]{transform:translateY(-5px)}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=opacity50]{opacity:.5}
.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) [data-icon-effect=opacity100]{opacity:1}
.kk-styled-button [hidden]{display:none!important}
@media(prefers-reduced-motion:reduce){.kk-styled-button,.kk-styled-button .kk-button-icon,.kk-styled-button .kk-button-icon-slot{transition:none!important}.kk-styled-button[data-button-interactive]:is(:hover,:focus-within) .kk-button-icon-slot{transform:none!important}}
`;
const sides=['top','right','bottom','left'],corners=['topLeft','topRight','bottomRight','bottomLeft'];
const geo=(element,device)=>boxFor(element,device);
const hasIcon=icon=>icon.kind!=='none'&&(icon.kind!=='image'||!!icon.resourceId)&&(icon.kind!=='emoji'||!!icon.emoji);
const weight={light:300,regular:400,semibold:600,bold:700};
function paintIcon(node,icon,value,options){
 if(icon.kind==='svg'){const key=JSON.stringify(icon.svg);node.hidden=false;if(node.dataset.paintKey!==key){node.replaceChildren(createSvgIcon(icon.svg));node.dataset.paintKey=key;}}
 else paintZeroIcon(node,{iconKind:icon.kind,iconGlyph:icon.glyph,iconEmoji:icon.emoji,iconResourceId:icon.resourceId},'icon',options.apiBase);
 node.style.fontWeight=String(weight[value.iconWeight]);if(icon.kind==='icon')node.querySelector('svg')?.setAttribute('stroke-width',String({light:1,regular:1.7,semibold:2.2,bold:2.8}[value.iconWeight]));
}
export function mountButtonContent(target,initial,options={}){
 const body=document.createElement('div'),caption=document.createElement('div'),slot=document.createElement('span'),normal=document.createElement('span'),hover=document.createElement('span');
 body.className='kk-button-content';caption.className='kk-button-caption';slot.className='kk-button-icon-slot';normal.className='kk-button-icon kk-button-icon-normal';hover.className='kk-button-icon kk-button-icon-hover';slot.setAttribute('aria-hidden','true');slot.append(normal,hover);body.append(slot,caption);target.replaceChildren(body);target.classList.add('kk-styled-button');
 let element=initial,device=options.device||'desktop',painted=false;
 function effects(){const v=buttonValues(element.content,device,buttonFallback(element,device)),active=target.hasAttribute('data-button-interactive')&&target.matches(':hover,:focus-within');paintForeground(caption,active?v.hoverColor||v.color:v.color);paintForeground(slot,active?v.hoverColor||v.color:v.color);paintBorder(target,active?v.hoverBorderColor||v.border.color:v.border.color);}
 const stopPaint=bindPaintStates(target,effects);
 function draw(){
  const box=geo(element,device),scale=box.scale||1,v=buttonValues(element.content,device,buttonFallback(element,device));ensureTextFont(v.fontFamily,false,options.apiBase);
  const font=`"${runtimeFontFamily(v.fontFamily)}",${['Georgia','Times New Roman'].includes(v.fontFamily)?'serif':'sans-serif'}`;
  for(const [key,value]of Object.entries({background:v.background,color:v.color,border:v.border.color,'hover-background':v.hoverBackground||v.background,'hover-color':v.hoverColor||v.color,'hover-border':v.hoverBorderColor||v.border.color,duration:`${v.hoverDuration}s`}))target.style.setProperty(`--kb-${key}`,['color','border','hover-color','hover-border'].includes(key)?paintFallback(value):value);
  Object.assign(target.style,{boxSizing:'border-box',display:'block',background:'',color:'',borderColor:'',fontFamily:font,fontSize:`${v.fontSize*scale}px`,fontWeight:String(v.fontWeight),textAlign:v.align,lineHeight:v.lineHeightUnit==='px'?`${v.lineHeight*scale}px`:String(v.lineHeight),letterSpacing:`${v.letterSpacing*scale}px`,textTransform:v.letterCase,padding:sides.map(key=>`${v.padding[key]*scale}px`).join(' '),borderStyle:v.border.style,borderWidth:sides.map(key=>`${v.border.widths[key]*scale}px`).join(' '),borderRadius:corners.map(key=>`${v.corners[key]*scale}px`).join(' '),boxShadow:shapeShadowCss(v.shadows,scale),opacity:String(v.opacity/100),width:v.fit==='auto-width'?'max-content':`${box.width}px`,height:v.fit==='fixed'?`${box.height}px`:'auto',minWidth:'16px',minHeight:'16px',transformOrigin:'center',transform:options.measurement?'none':`rotate(${v.rotation}deg)`,overflow:options.editing?'visible':'hidden'});
  if(options.mode!=='editor'&&!options.measurement)target.dataset.buttonInteractive='';else delete target.dataset.buttonInteractive;
  if(hasIcon(v.hoverIcon))target.dataset.hoverIcon='';else delete target.dataset.hoverIcon;
  const shown=hasIcon(v.icon)||hasIcon(v.hoverIcon);slot.hidden=!shown;slot.dataset.iconEffect=v.iconAnimation;Object.assign(slot.style,{width:`${v.iconSize*scale}px`,height:`${v.iconSize*scale}px`,fontSize:`${v.iconSize*scale}px`,order:v.iconPosition==='after'?'1':'-1'});paintIcon(normal,v.icon,v,options);paintIcon(hover,v.hoverIcon,v,options);
  Object.assign(body.style,{height:v.fit==='fixed'?'100%':'auto',justifyContent:{left:'flex-start',center:'center',right:'flex-end'}[v.align],gap:shown&&element.content.text?`${v.iconGap*scale}px`:'0',transform:options.measurement?'none':`scale(${v.flipX?-1:1},${v.flipY?-1:1})`});
  Object.assign(caption.style,{whiteSpace:v.fit==='auto-width'||v.fit==='single-line'?'pre':'pre-wrap',overflowWrap:v.fit==='auto-width'||v.fit==='single-line'?'normal':'anywhere',overflow:options.editing?'visible':'hidden',textOverflow:v.fit==='single-line'&&!options.editing?'ellipsis':'clip',maxHeight:v.fit==='fixed'&&!options.editing?'100%':'none',flex:v.fit==='auto-width'?'none':'0 1 auto',outline:options.editing?'':'none'});
  const text=v.fit==='single-line'&&!options.editing?element.content.text.replace(/\r?\n/g,' '):element.content.text;if((!options.editing||!painted)&&caption.textContent!==text)caption.textContent=text;painted=true;effects();paintShadows(target,v.shadows,scale);
 }
 draw();return {body,caption,layout(next,nextElement=element){device=next;element=nextElement;draw();},destroy(){stopPaint();}};
}
/** Actual customer DOM, isolated offscreen and independent of the editor camera. */
export function measureStyledButton(element,device='desktop'){
 const box=geo(element,device),scale=box.scale||1,v=buttonValues(element.content,device,buttonFallback(element,device)),border=v.border.style==='none'?{top:0,right:0,bottom:0,left:0}:v.border.widths,minimum={width:Math.max(16,(v.padding.left+v.padding.right+border.left+border.right)*scale+1),height:Math.max(16,(v.padding.top+v.padding.bottom+border.top+border.bottom)*scale+1)};if(v.fit==='fixed')return minimum;if(typeof document==='undefined')return {width:v.fit==='auto-width'?box.width:minimum.width,height:box.height};
 const root=document.createElement('div'),style=document.createElement('style'),target=document.createElement('div');style.textContent=buttonCss;root.style.cssText='position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;contain:layout style';root.append(style,target);const mounted=mountButtonContent(target,element,{device,measurement:true});document.body.append(root);
 try{const rect=target.getBoundingClientRect();return {width:v.fit==='auto-width'?Math.max(16,Math.ceil(rect.width)):minimum.width,height:Math.max(16,Math.ceil(rect.height))};}finally{mounted.destroy();root.remove();}
}
