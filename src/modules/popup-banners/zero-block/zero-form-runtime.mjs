import {activeStyleLayers} from './responsive.mjs';
import {paintForeground,paintBorder,paintShadows,bindPaintStates} from './paint-runtime.mjs';
import {isGradient,paintFallback} from './paint.mjs';
import {zeroFormValues,visibleFormFields,singleCheckbox,ZERO_ICON_GLYPHS,ZERO_ICON_VECTORS} from './zero-form.mjs';
import {renderRichText,richTextPlain} from './rich-text.mjs';
import {syncChildren} from './dom.mjs';

export const zeroFormCss=`
.kk-form.kk-zero-form{height:auto;overflow:visible;padding:0;gap:0;font:13px/1.5 'Segoe UI',Arial,sans-serif;color:#25231f;min-width:0}
.kk-zero-inputs{display:flex;flex-wrap:wrap;align-items:flex-start;min-width:0;row-gap:0}
.kk-zero-form .kk-form-field{gap:0;min-width:0;min-inline-size:0;max-width:100%;margin:0 0 var(--zf-fieldGap);padding:0;border:0}
.kk-zero-form .kk-form-label{font-family:var(--zf-labelFontFamily);font-size:var(--zf-labelFontSize);font-weight:var(--zf-labelFontWeight);line-height:1.2;color:var(--zf-labelColor);margin:0 0 var(--zf-labelGap);padding:0;overflow-wrap:anywhere;width:100%}
.kk-zero-form .kk-form-field>label.kk-form-label{margin:0 0 var(--zf-labelGap)}
.kk-zero-form .kk-required{display:none}
.kk-zero-form .kk-form-help{display:block;font-family:var(--zf-labelFontFamily);font-size:calc(var(--zf-labelFontSize)*.875);line-height:1.5;color:var(--zf-labelColor);opacity:.65;margin:0 0 10px}
.kk-zero-form .kk-form-control{height:var(--zf-inputHeight);min-height:0;padding:0 13px;border:var(--zf-inputBorderWidth) solid var(--zf-inputBorderColor);border-radius:var(--zf-inputRadius);font-family:var(--zf-inputFontFamily);font-size:var(--zf-inputFontSize);font-weight:var(--zf-inputFontWeight);line-height:1.5;color:var(--zf-inputColor);background:var(--zf-inputBackground);box-shadow:inset 0 1px 2px rgb(30 25 20 / 2%)}
.kk-zero-form textarea.kk-form-control{padding:12px 13px;min-height:var(--zf-inputHeight);resize:vertical}
.kk-zero-form .kk-form-control::placeholder{color:var(--zf-placeholder-color);opacity:var(--zf-placeholder-opacity)}
.kk-zero-form[data-placeholder=focus] .kk-form-control::placeholder{opacity:0}
.kk-zero-form[data-placeholder=focus] .kk-form-control:focus::placeholder{opacity:var(--zf-placeholder-opacity)}
.kk-zero-form[data-field-style=underline] .kk-form-control,.kk-zero-form[data-field-style=underline] .kk-phone,.kk-zero-form[data-field-style=underline] .kk-number-wrap{border-top:0;border-right:0;border-left:0;border-radius:0}
.kk-zero-form .kk-phone,.kk-zero-form .kk-number-wrap{height:var(--zf-inputHeight);border:var(--zf-inputBorderWidth) solid var(--zf-inputBorderColor);border-radius:var(--zf-inputRadius);background:var(--zf-inputBackground);color:var(--zf-inputColor);font-family:var(--zf-inputFontFamily);font-size:var(--zf-inputFontSize);font-weight:var(--zf-inputFontWeight);box-shadow:inset 0 1px 2px rgb(30 25 20 / 2%)}
.kk-zero-form .kk-phone input,.kk-zero-form .kk-number-wrap input{height:100%;border:0;border-radius:inherit;background:transparent;box-shadow:none}
.kk-zero-form .kk-phone-trigger{border:0;border-radius:0;color:inherit;font:inherit;max-width:60%;padding:0 10px;gap:6px}
.kk-zero-form .kk-number-wrap input{text-align:center;padding-inline:4px;appearance:textfield;-moz-appearance:textfield}
.kk-zero-form .kk-number-wrap input::-webkit-inner-spin-button,.kk-zero-form .kk-number-wrap input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.kk-zero-form .kk-stepper{flex:none;width:var(--zf-inputHeight);max-width:30%;padding:0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
.kk-zero-form .kk-choice-options{display:grid;gap:10px;min-width:0}
.kk-zero-form .kk-form-choice{font-family:var(--zf-choiceFontFamily);font-size:var(--zf-choiceFontSize);font-weight:var(--zf-choiceFontWeight);color:var(--zf-choiceColor);line-height:1.55;gap:10px;min-width:0}
.kk-zero-form .kk-form-choice input{appearance:none;-webkit-appearance:none;position:relative;display:grid;place-content:center;width:var(--zf-indicatorSize);height:var(--zf-indicatorSize);border:var(--zf-indicatorBorderWidth) solid var(--zf-indicatorBorderColor);border-radius:var(--zf-checkboxRadius);background:transparent;color:var(--zf-indicatorBorderColor);margin:0;cursor:pointer;flex:none}
.kk-zero-form .kk-form-choice input[type=radio]{border-radius:50%}
.kk-zero-form .kk-form-choice input:checked{border-color:var(--zf-indicator-fill);color:var(--zf-indicator-fill)}
.kk-zero-form .kk-form-choice input:checked::before{content:'';display:block;width:calc(var(--zf-indicatorSize)*.45);height:calc(var(--zf-indicatorSize)*.45);background:var(--zf-indicator-paint,currentColor)}
.kk-zero-form .kk-form-choice input[type=checkbox]:checked{background:var(--zf-indicator-fill);color:#fff}
.kk-zero-form .kk-form-choice input[type=checkbox]:checked::before{width:calc(var(--zf-indicatorSize)*.25);height:calc(var(--zf-indicatorSize)*.45);border:2px solid currentColor;border-top:0;border-left:0;background:transparent;transform:translateY(-1px) rotate(45deg)}
.kk-zero-form .kk-form-choice input[type=radio]:checked::before{border-radius:50%}
.kk-zero-form .kk-form-choice input:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.kk-zero-form .kk-form-choice input:disabled{opacity:.5}
.kk-zero-form .kk-custom-answer{margin-top:10px;min-width:0}
.kk-zero-form .kk-custom-answer .kk-form-control{width:100%}
.kk-zero-submit{min-width:0;max-width:100%;padding-top:var(--zf-buttonGap);margin:0}
.kk-zero-form .kk-form-submit{width:var(--zf-buttonWidth);min-width:max-content;height:var(--zf-buttonHeight);min-height:0;max-width:none;padding:0 21px;border:var(--zf-buttonBorderWidth) solid var(--zf-buttonBorderColor);border-radius:var(--zf-buttonRadius);font-family:var(--zf-buttonFontFamily);font-size:var(--zf-buttonFontSize);font-weight:var(--zf-buttonFontWeight);line-height:1.2;color:var(--zf-buttonColor);background:var(--zf-buttonBackground);background-image:var(--zf-button-surface);white-space:nowrap;box-shadow:var(--zf-shadow);gap:var(--zf-buttonIconGap);transition:background-color .14s,color .14s,border-color .14s,box-shadow .14s;display:flex;align-items:center;justify-content:center}
.kk-zero-form .kk-form-submit>span:not(.kk-decoration):not(.kk-spinner){overflow-wrap:normal}
.kk-zero-form .kk-form-submit:hover,.kk-zero-form .kk-form-submit:focus-visible{color:var(--zf-hover-color);background:var(--zf-hover-background);background-image:var(--zf-hover-surface);border-color:var(--zf-hover-border);box-shadow:var(--zf-hover-shadow)}
.kk-zero-form .kk-button-decoration{width:var(--zf-buttonIconSize);height:var(--zf-buttonIconSize);font-size:var(--zf-buttonIconSize);line-height:1;display:inline-flex;flex:none;align-items:center;justify-content:center;transition:transform .3s,opacity .3s;order:var(--zf-icon-order)}
.kk-zero-form .kk-button-decoration img,.kk-zero-form .kk-button-decoration svg{display:block;width:100%;height:100%;object-fit:contain}
.kk-zero-form [data-icon-effect=opacity100]{opacity:.5}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=rotate15]{transform:rotate(15deg)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=rotate360]{transform:rotate(360deg)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=scale]{transform:scale(1.2)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=scaleX]{transform:scaleX(1.2)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=scaleY]{transform:scaleY(1.2)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=moveX]{transform:translateX(5px)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=moveY]{transform:translateY(-5px)}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=opacity50]{opacity:.5}
.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) [data-icon-effect=opacity100]{opacity:1}
.kk-zero-below,.kk-zero-footer{width:100%;min-width:0}
.kk-zero-below:not(:empty){margin-top:10px}.kk-zero-below .kk-form-field{margin-bottom:0}
.kk-zero-footer{margin-top:16px;font:12px/1.5 'Segoe UI',Arial,sans-serif;color:#6d6962}
.kk-zero-form .kk-form-status{margin-top:16px;padding:12px 16px;border-radius:10px;display:block;width:100%;font:13px/1.5 'Segoe UI',Arial,sans-serif;background:#fcefeb;color:#a4322c}
.kk-zero-form[data-success=true] .kk-form-status{background:#edf4e8;color:#37642d}
.kk-zero-form .kk-form-error{margin-top:8px;display:block;font:12px/1.4 'Segoe UI',Arial,sans-serif;color:#a4322c}
.kk-zero-form :is(.kk-form-control,button):focus-visible{outline:3px solid #826324;outline-offset:3px}
.kk-zero-form .kk-form-choice input:focus-visible{outline-color:#826324}
.kk-zero-form a{color:inherit;text-decoration:underline}
.kk-zero-form [aria-invalid=true],.kk-zero-form .kk-form-field[data-error=true] .kk-phone,.kk-zero-form .kk-form-field[data-error=true] .kk-number-wrap{border-color:#a4322c}
.kk-zero-form[data-orientation=horizontal] .kk-zero-inputs{align-items:flex-end;row-gap:15px}
.kk-zero-form[data-orientation=horizontal] .kk-form-field{flex:1 1 0;min-width:min(80px,100%);margin-bottom:0;padding-right:var(--zf-fieldGap)}
.kk-zero-form[data-orientation=horizontal] .kk-zero-submit{flex:0 0 auto;padding-top:0}
.kk-zero-form [hidden]{display:none!important}
@media(prefers-reduced-motion:reduce){.kk-zero-form .kk-form-submit,.kk-zero-form .kk-button-decoration{transition:none!important;animation:none!important}.kk-zero-form .kk-form-submit:is(:hover,:focus-visible) .kk-button-decoration{transform:none!important}}
`;
const caches=new WeakMap();
export function invalidateZeroForm(form){const state=caches.get(form);if(state){state.styleKey=null;state.layoutKey=null;}}
const pxKeys=/(?:FontSize|BorderWidth|Radius|Height|Width|Gap|Size)$/;
function shadow(values,prefix){const color=paintFallback(values[prefix+'ShadowColor']),opacity=values[prefix+'ShadowOpacity']/100*(color.length===9?parseInt(color.slice(7,9),16)/255:1),rgb=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16));return `${values[prefix+'ShadowX']}px ${values[prefix+'ShadowY']}px ${values[prefix+'ShadowBlur']}px ${values[prefix+'ShadowSpread']}px rgba(${rgb.join(',')},${opacity})`;}
export function paintZeroIcon(node,values,prefix,apiBase=''){
  const kind=values[prefix+'Kind'],glyph=values[prefix+'Glyph'],emoji=values[prefix+'Emoji'],resource=values[prefix+'ResourceId'],key=JSON.stringify([kind,glyph,emoji,resource]);
  node.hidden=kind==='none'||kind==='image'&&!resource||kind==='emoji'&&!emoji;if(node.dataset.paintKey===key)return;node.dataset.paintKey=key;node.replaceChildren();
  if(kind==='image'&&resource){const img=document.createElement('img');img.alt='';img.src=`${apiBase}/api/public/popup-banners/zero-block/media/${encodeURIComponent(resource)}`;node.append(img);}
  else if(kind==='emoji')node.textContent=emoji;
  else if(kind==='icon'&&ZERO_ICON_VECTORS[glyph]){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value]of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'}))svg.setAttribute(key,value);for(const d of ZERO_ICON_VECTORS[glyph]){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}node.append(svg);}
  else if(kind!=='none')node.textContent=ZERO_ICON_GLYPHS[glyph]||'→';
}
/** Paints the same customer controls; does not create a second form or submission path. */
export function paintZeroForm({form,content,device,parts,button,buttonIcon,inputsBox,submitBox,belowBox,footer,readAll,apiBase='',stepFieldIds,pending=false,measureAllFields=false}){
  const values=zeroFormValues(content,device),active=(measureAllFields?content.fields.filter(field=>!field.disabled):visibleFormFields(content.fields,readAll())).filter(field=>!stepFieldIds||stepFieldIds.includes(field.id)),activeIds=new Set(active.map(field=>field.id));
  let state=caches.get(form);if(!state){state={};caches.set(form,state);}
  const styleKey=JSON.stringify([device,content.design]);
  if(state.styleKey!==styleKey){
    state.styleKey=styleKey;
    for(const [key,value]of Object.entries(values))form.style.setProperty('--zf-'+key,typeof value==='number'&&pxKeys.test(key)?`${value}px`:String(/Color$/.test(key)&&value?paintFallback(value):value));
    const own=key=>Object.hasOwn(content.design.base||{},key)||activeStyleLayers(device).some(layer=>Object.hasOwn(content.design[layer]||{},key));
    const customShadow=prefix=>Object.keys(values).some(key=>key.startsWith(prefix+'Shadow')&&own(key));
    const surface=own('buttonBackground')?(isGradient(values.buttonBackground)?values.buttonBackground:'none'):'radial-gradient(ellipse at 32% 0%, #625c5070, transparent 70%), linear-gradient(135deg, #403c35, #24221f 75%)';
    const normalShadow=customShadow('button')?(isGradient(values.buttonShadowColor)?'none':shadow(values,'button')):'inset 0 1px 0 rgb(255 255 255 / 12%)';
    form.dataset.orientation=values.orientation;form.dataset.placeholder=values.placeholderMode;form.dataset.fieldStyle=values.fieldStyle;
    form.style.setProperty('--zf-placeholder-color',own('inputColor')?paintFallback(values.inputColor):'#6d6962');
    form.style.setProperty('--zf-placeholder-opacity',own('inputColor')?'.5':'.9');
    form.style.setProperty('--zf-indicator-fill',own('indicatorBorderColor')?paintFallback(values.indicatorBorderColor):'#403c35');
    form.style.setProperty('--zf-button-surface',surface);
    form.style.setProperty('--zf-hover-surface',values.hoverBackground?(isGradient(values.hoverBackground)?values.hoverBackground:'none'):surface);
    form.style.setProperty('--zf-shadow',normalShadow);
    form.style.setProperty('--zf-hover-shadow',customShadow('hover')?(isGradient(values.hoverShadowColor)?'none':shadow(values,'hover')):normalShadow);
    form.style.setProperty('--zf-hover-color',paintFallback(values.hoverColor||values.buttonColor));
    form.style.setProperty('--zf-hover-background',values.hoverBackground||(own('buttonBackground')?values.buttonBackground:'#403c35'));
    form.style.setProperty('--zf-hover-border',paintFallback(values.hoverBorderColor||values.buttonBorderColor));
    form.style.setProperty('--zf-icon-order',values.buttonIconPosition==='after'?'1':'-1');
    buttonIcon.dataset.iconEffect=values.buttonIconAnimation;button.style.width=values.orientation==='vertical'&&values.buttonStretch?'100%':`${values.buttonWidth}px`;button.style.marginInline=values.buttonAlign==='center'?'auto':'0';
    for(const field of content.fields){const entry=parts.get(field.id);if(!entry)continue;if(field.type==='textarea')entry.first.style.height=`${Math.max(values.inputHeight,(field.rows||3)*values.inputFontSize*1.5+24+2*values.inputBorderWidth)}px`;const list=entry.group.querySelector('.kk-choice-options');if(list){const layout=field.choiceLayout||'default',columns=['mobile','mobileLandscape'].includes(device)&&field.choiceMobileColumns?2:['2','3','4'].includes(layout)?Number(layout):1;list.style.display=layout==='row'&&!(['mobile','mobileLandscape'].includes(device)&&field.choiceMobileColumns)?'flex':'grid';list.style.flexWrap='wrap';list.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;}}
  }
  const layoutKey=JSON.stringify([device,values.orientation,active.map(field=>[field.id,field.joinNext,field.width,field.belowSubmit]),values.fieldGap]);
  if(state.layoutKey!==layoutKey){state.layoutKey=layoutKey;const focused=form.getRootNode().activeElement||document.activeElement,selection=focused&&'selectionStart'in focused?[focused.selectionStart,focused.selectionEnd]:null;const inputs=[],below=[];
    const normal=active.filter(field=>!(singleCheckbox(field)&&field.belowSubmit));
    for(let index=0;index<normal.length;index++){const field=normal[index],entry=parts.get(field.id);if(values.orientation==='horizontal'){entry.group.style.flex='';entry.group.style.width='';entry.group.style.marginRight='';inputs.push(entry.group);continue;}let end=index;while(end<normal.length-1&&normal[end].joinNext)end++;const row=normal.slice(index,end+1);for(const [offset,item]of row.entries()){const group=parts.get(item.id).group,fraction=item.width&&item.width!=='auto'?Number(item.width)/100:1/row.length;group.style.flex=`0 0 calc(${fraction*100}% - ${fraction===1&&offset<row.length-1?values.fieldGap:values.fieldGap*(1-fraction)}px)`;group.style.width='';group.style.marginRight=offset<row.length-1?`${values.fieldGap}px`:'0';inputs.push(group);}const breaker=document.createElement('div');breaker.setAttribute('aria-hidden','true');breaker.style.cssText='flex-basis:100%;height:0';inputs.push(breaker);index=end;}
    for(const field of active)if(singleCheckbox(field)&&field.belowSubmit)below.push(parts.get(field.id).group);submitBox.style.flex=values.orientation==='vertical'?'0 0 100%':'';inputs.push(submitBox,...content.fields.filter(field=>!activeIds.has(field.id)).map(field=>parts.get(field.id).group));syncChildren(inputsBox,inputs,below);syncChildren(belowBox,below);if(focused&&form.contains(focused)&&focused!==form.getRootNode().activeElement){focused.focus({preventScroll:true});if(selection&&typeof focused.setSelectionRange==='function')try{focused.setSelectionRange(...selection);}catch{/* Number inputs do not expose a text selection. */}}
  }
  for(const field of content.fields){const entry=parts.get(field.id),visible=activeIds.has(field.id);entry.group.hidden=!visible;for(const control of entry.group.querySelectorAll('input,textarea,button'))control.disabled=pending||!visible||(control.dataset.customAnswer==='true'&&!entry.group.querySelector('[data-custom-choice]:checked'));if(!visible){entry.group.dataset.error='false';const error=entry.group.querySelector('.kk-form-error');if(error)error.hidden=true;entry.first?.removeAttribute('aria-invalid');}}
  const hover=button.matches(':hover,:focus-visible')&&Object.hasOwn(content.design.base||{},'hoverIconKind');paintZeroIcon(buttonIcon,values,hover?'hoverIcon':'buttonIcon',apiBase);
  inputsBox.hidden=form.dataset.success==='true';belowBox.hidden=form.dataset.success==='true';footer.hidden=form.dataset.success==='true'||!richTextPlain(content.behavior?.footer).trim();
  const footerKey=JSON.stringify(content.behavior?.footer||null);if(state.footer!==footerKey){state.footer=footerKey;renderRichText(footer,content.behavior?.footer);}
  const effects=()=>{const hover=button.matches(':hover,:focus-visible'),prefix=hover&&Object.keys(content.design.base||{}).some(k=>k.startsWith('hoverShadow'))?'hover':'button';
   const color=hover?values.hoverColor||values.buttonColor:values.buttonColor;for(const child of button.children)paintForeground(child,color);paintBorder(button,hover?values.hoverBorderColor||values.buttonBorderColor:values.buttonBorderColor);paintShadows(button,[{color:values[prefix+'ShadowColor'],opacity:values[prefix+'ShadowOpacity'],x:values[prefix+'ShadowX'],y:values[prefix+'ShadowY'],blur:values[prefix+'ShadowBlur'],spread:values[prefix+'ShadowSpread']}],1,hover?'var(--zf-hover-shadow)':'var(--zf-shadow)');
  };state.effects=effects;if(!state.bound){state.bound=true;bindPaintStates(button,()=>state.effects?.());}effects();
  for(const node of form.querySelectorAll('.kk-form-label,.kk-form-help'))paintForeground(node,values.labelColor);
  for(const node of form.querySelectorAll('.kk-form-choice>span'))paintForeground(node,values.choiceColor);
  for(const node of form.querySelectorAll('.kk-form-control,.kk-phone,.kk-number-wrap')){paintForeground(node,values.inputColor);paintBorder(node,node.getAttribute('aria-invalid')==='true'||node.closest('.kk-form-field')?.dataset.error==='true'?'#A4322C':values.inputBorderColor);}
  for(const node of form.querySelectorAll('.kk-form-choice input')){const invalid=node.getAttribute('aria-invalid')==='true'||node.closest('.kk-form-field')?.dataset.error==='true',color=invalid?'#A4322C':values.indicatorBorderColor,gradient=isGradient(color);paintBorder(node,color);if(!gradient){if(!invalid)node.style.removeProperty('border-color');node.style.removeProperty('--zf-indicator-paint');node.style.removeProperty('background');}else{node.style.setProperty('--zf-indicator-paint',values.indicatorBorderColor);if(node.type==='checkbox')node.style.background=node.checked?values.indicatorBorderColor:'transparent';}}
  return active;
}
