import {POPUP_DEVICES} from './responsive.mjs';
import { formPartStyle, resolveFormAppearance, validateFormAppearance } from './form-appearance.mjs';

const kebab=key=>key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase());
const px=value=>`${value}px`;
// States override only their sparse values. Composite CSS values need their
// normal siblings (for example a changed gradient stop or shadow blur).
function stateValues(normal,patch,state){
  if(state==='normal')return patch;
  const values={...patch},groups=[['backgroundMode','background','gradientColor','gradientAngle','backgroundResourceId','backgroundFit','backgroundPosition'],['shadowEnabled','shadowX','shadowY','shadowBlur','shadowSpread','shadowColor','innerShadowEnabled','innerShadowX','innerShadowY','innerShadowBlur','innerShadowSpread','innerShadowColor'],['translateY','scale'],['transitionDuration','transitionEasing'],['focusWidth','focusColor','focusOffset'],['align','width']];
  for(const group of groups)if(group.some(key=>Object.hasOwn(patch,key)))for(const key of group)if(!Object.hasOwn(values,key)&&Object.hasOwn(normal,key))values[key]=normal[key];
  return values;
}
export function formStyleDeclarations(style,part,apiBase='') {
  const out=[];const put=(key,value)=>out.push(`${key}:${value}`);
  if(style.controlVariant==='outline')out.push('border:1px solid #B8B2A8','border-radius:8px');
  if(style.controlVariant==='underline')out.push('border-top-width:0','border-right-width:0','border-left-width:0','border-bottom-width:1px','border-radius:0');
  if(style.controlVariant==='filled')out.push('border-color:transparent');
  if(part==='choice'&&style.choiceVariant==='cards')out.push('border:1px solid #D6D1C8','border-radius:10px','padding:12px');
  if(part==='choice'&&style.choiceVariant==='pills')out.push('border:1px solid #D6D1C8','border-radius:999px','padding:10px 16px');
  if(part==='choice'&&style.choiceVariant==='list')out.push('border:0','border-radius:0','padding:0');
  for(const [key,value]of Object.entries(style)){
    if(['color','caretColor','background','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','borderStyle','borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle','fontStyle','fontWeight','textAlign','textTransform','textDecoration','resize'].includes(key)){if(key!=='background')put(kebab(key),value);}
    if(['paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','letterSpacing','marginTop','marginBottom','rowGap','columnGap'].includes(key))put(kebab(key),px(value));
    if(['width','height','maxWidth','maxHeight','minHeight'].includes(key))put(kebab(key),value?px(value):key.startsWith('max')?'none':key==='minHeight'?'0':'auto');
    if(key==='fontFamily')put('font-family',value==='inherit'?'inherit':`"${value}"`);
    if(key==='fontSize')put('font-size',value?px(value):'inherit');if(key==='lineHeight')put('line-height',value||'inherit');
    if(key.startsWith('radius'))put('border-'+({radiusTopLeft:'top-left',radiusTopRight:'top-right',radiusBottomLeft:'bottom-left',radiusBottomRight:'bottom-right'})[key]+'-radius',px(value));
  }
  const background=style.backgroundMode==='gradient'?`linear-gradient(${style.gradientAngle??135}deg,${style.background||'#FFFFFF00'},${style.gradientColor||'#EADDBC'})`:style.backgroundMode==='image'&&style.backgroundResourceId?`url("${apiBase}/api/public/popup-banners/zero-block/media/${style.backgroundResourceId}") ${style.backgroundPosition||'center'} / ${style.backgroundFit||'cover'} no-repeat`:style.background;
  if(background!==undefined){put(part==='form'?'--kk-form-background':'background',background);if(part==='form')put('background','transparent');}
  if(style.backgroundOpacity!==undefined)put('--kk-form-background-opacity',style.backgroundOpacity/100);
  const shadows=[];for(const [prefix,inset]of [['shadow',''],['innerShadow','inset ']])if(style[prefix+'Enabled'])shadows.push(`${inset}${style[prefix+'X']||0}px ${style[prefix+'Y']||0}px ${style[prefix+'Blur']||0}px ${style[prefix+'Spread']||0}px ${style[prefix+'Color']||'#00000033'}`);
  if(shadows.length||style.shadowEnabled===false||style.innerShadowEnabled===false)put('box-shadow',shadows.join(',')||'none');
  if(style.focusWidth!==undefined||style.focusColor!==undefined||style.focusOffset!==undefined){const color=style.focusColor||'#A68150';put('--kk-focus-color',color.length===9?color.slice(0,7):color);put('--kk-focus-width',px(style.focusWidth||2));put('--kk-focus-offset',px(style.focusOffset??2));}
  if(style.translateY!==undefined||style.scale!==undefined)put('transform',`translateY(${style.translateY||0}px) scale(${style.scale??1})`);
  if(style.transitionDuration!==undefined||style.transitionEasing!==undefined)put('transition',`color ${style.transitionDuration??140}ms ${style.transitionEasing||'ease'},background ${style.transitionDuration??140}ms ${style.transitionEasing||'ease'},border-color ${style.transitionDuration??140}ms ${style.transitionEasing||'ease'},box-shadow ${style.transitionDuration??140}ms ${style.transitionEasing||'ease'},transform ${style.transitionDuration??140}ms ${style.transitionEasing||'ease'}`);
  if(style.align!==undefined){put('justify-self',style.align);if(part==='submit'&&style.align!=='stretch'&&style.width===undefined)put('width','auto');if(part==='form')out.push(`margin-left:${['center','end'].includes(style.align)?'auto':'0'}`,`margin-right:${['center','start'].includes(style.align)?'auto':'0'}`);}
  if(['input','textarea','number'].includes(part)&&style.width!==undefined)out.push(`flex:${style.width?'0 1 auto':'1 1 0'}`,'max-width:100%');
  if(style.scrollbarColor)put('scrollbar-color',`${style.scrollbarColor} transparent`);
  if(style.iconSize!==undefined)put('--kk-icon-size',px(style.iconSize));if(style.iconGap!==undefined)put('--kk-icon-gap',px(style.iconGap));if(style.iconPosition!==undefined)put('--kk-icon-order',style.iconPosition==='after'?1:-1);
  if(style.indicatorSize!==undefined)out.push(`width:${style.indicatorSize}px`,`height:${style.indicatorSize}px`);if(style.accentColor){put('accent-color',style.accentColor);if(part==='indicator')put('--kk-check-color',style.accentColor);}
  if(style.flagWidth!==undefined)put('--kk-flag-width',px(style.flagWidth));if(style.flagHeight!==undefined)put('--kk-flag-height',px(style.flagHeight));
  if(part==='choice'){if(style.choiceAlign)put('align-items',style.choiceAlign==='start'?'flex-start':'center');if(style.indicatorGap!==undefined)put('gap',px(style.indicatorGap));}
  if(part==='indicator'&&Object.keys(style).some(key=>key.startsWith('border')||key.startsWith('radius')||key==='background'))out.push('appearance:none','position:relative','display:inline-grid','place-content:center','flex:none');
  if(part==='required'){if(style.markerGap!==undefined)put('margin-inline',px(style.markerGap));if(style.markerPosition!==undefined)out.push(`order:${style.markerPosition==='before'?-1:0}`,`display:${style.markerPosition==='hidden'?'none':'inline'}`);}
  return out.join(';');
}

function selectors(root,group,menu,part){const map={form:root,field:group,input:`${group} .kk-form-control`,label:`${group} .kk-form-label`,required:`${group} .kk-required`,placeholder:`${group} .kk-form-control::placeholder`,help:`${group} .kk-form-help`,icon:`${group} .kk-input-icon`,textarea:`${group} textarea.kk-form-control`,number:`${group} input[type=number].kk-form-control`,phone:`${group} .kk-phone`,phoneTrigger:`${group} .kk-phone-trigger`,phoneMenu:menu,phoneSearch:`${menu} input[type=search]`,phoneOption:`${menu} .kk-phone-option`,phoneEmpty:`${menu} .kk-phone-empty`,choice:`${group} .kk-form-choice`,indicator:`${group} .kk-form-choice input`,choiceText:`${group} .kk-choice-text`,submit:`${root} .kk-form-submit`,error:`${group} .kk-form-error`,status:`${root} .kk-form-status`,success:`${root}[data-success=true] .kk-form-status`};return map[part];}
function stateSelector(root,group,menu,selector,part,state){
  if(state==='normal')return selector;
  const portal=part.startsWith('phone')&&['phoneMenu','phoneSearch','phoneOption','phoneEmpty'].includes(part),anchor=portal?menu:group||root;
  const replace=condition=>selector.replace(anchor,anchor+condition);
  const optionPart=['phoneOption','choice','indicator','choiceText'].includes(part);
  const rowSelector=part==='choiceText'?selector.replace(' .kk-choice-text',' .kk-form-choice'):part==='indicator'?selector.replace(' input',''):selector;
  const optionState=condition=>part==='choiceText'?rowSelector+condition+' .kk-choice-text':part==='indicator'?rowSelector+condition+' input':selector+condition;
  if(state==='hover')return optionPart?optionState(':hover'):replace(':hover');if(state==='focus')return optionPart?optionState(':focus-within'):replace(':focus-within');
  if(state==='filled'||state==='error')return replace(`[data-${state}=true]`);
  if(state==='disabled')return portal?replace('[aria-disabled=true]'):replace(':has(:disabled)');
  if(state==='readonly')return replace(':has([readonly])');
  if(state==='selected'){if(part==='phoneOption')return selector+'[aria-selected=true]';if(part==='indicator')return selector+':checked';if(part==='choice'||part==='choiceText')return optionState(':has(input:checked)');return replace(':has(:checked)');}
  if(state==='active')return selector.endsWith('::placeholder')?replace(':active'):selector+':active';
  return selector.replace(portal?menu:root,(portal?menu:root)+`[data-${state}=true]`);
}

export function formAppearanceCss(content,apiBase='') {
  validateFormAppearance(content.appearance);for(const field of content.fields)validateFormAppearance(field.appearance,true);
  const scope=`.kk-form[data-form-id="${content.formId}"]`,out=[];
  const add=(selector,css)=>{if(css)out.push(`${selector}{${css}}`);};
  const hasStyles=!!content.appearance||content.fields.some(field=>field.appearance);
  if(!hasStyles)return '';
  add(scope,'display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-auto-rows:max-content;align-content:start;position:relative;isolation:isolate');
  add(scope+'::before','content:"";position:absolute;inset:0;border-radius:inherit;background:var(--kk-form-background,transparent);opacity:var(--kk-form-background-opacity,1);pointer-events:none;z-index:-1');
  add(`${scope}>.kk-form-submit,${scope}>.kk-form-status`,'grid-column:1/-1');
  for(const device of POPUP_DEVICES){
    const root=scope+`[data-device=${device}]`,global=resolveFormAppearance(content,null,device),form=global.form?.normal||{};
    const columns=form.layout==='row'?Math.min(12,content.fields.length):form.columns||1;add(root,`row-gap:${form.rowGap===undefined?'1em':px(form.rowGap)};column-gap:${form.columnGap===undefined?'1em':px(form.columnGap)}`);
    const emit=(field)=>{
      const group=field?`${root} [data-field-id="${field.id}"]`:root,menu=field?`.kk-phone-menu[data-kk-form-menu="${content.formId}"][data-field-id="${field.id}"][data-device=${device}]`:'';
      const resolved=field?resolveFormAppearance(content,field,device):global;
      if(field){const typography=Object.fromEntries(Object.entries(form).filter(([key])=>['color','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textTransform','textDecoration'].includes(key)));add(menu,formStyleDeclarations(typography,'phoneMenu',apiBase));}
      for(const [part,states]of Object.entries(resolved)){
        if(field?['form','submit','status','success'].includes(part):!['form','submit','status','success'].includes(part))continue;
        const order=['normal','filled','hover','selected','readonly','disabled','focus','active','error','pending','success'];
        for(const [state,patch]of Object.entries(states).sort(([a],[b])=>order.indexOf(a)-order.indexOf(b))){
          const values=stateValues(states.normal||{},patch,state),selector=selectors(root,group,menu,part);if(!selector)continue;
          add(stateSelector(root,group,menu,selector,part,state),formStyleDeclarations(values,part,apiBase));
          if(state!=='normal'){const anchor=selector.includes(root)?root:menu;add(selector.replace(anchor,anchor+`[data-appearance-state=${state}]`),formStyleDeclarations(values,part,apiBase));}
          if(part==='input'&&(values.selectionColor||values.selectionBackground))add(stateSelector(root,group,menu,selector,part,state)+'::selection',`${values.selectionColor?'color:'+values.selectionColor+';':''}${values.selectionBackground?'background:'+values.selectionBackground+';':''}`);
          if(part==='indicator'&&values.indicatorGap!==undefined)add(stateSelector(root,group,menu,selectors(root,group,menu,'choice'),'choice',state),`gap:${values.indicatorGap}px`);
          if(values.scrollbarSize!==undefined){const scroll=part==='phoneMenu'?selector+' .kk-phone-options':selector;add(stateSelector(root,group,menu,scroll,part,state)+'::-webkit-scrollbar',`width:${values.scrollbarSize}px;height:${values.scrollbarSize}px`);}
        }
      }
      if(!field)return;
      const layout=formPartStyle(content,field,'field',device),input=formPartStyle(content,field,'input',device),indicator=formPartStyle(content,field,'indicator',device),choice=formPartStyle(content,field,'choice',device),textarea=formPartStyle(content,field,'textarea',device),phone=formPartStyle(content,field,'phone',device),trigger=formPartStyle(content,field,'phoneTrigger',device);
      add(group,`grid-column:${form.layout==='row'?'auto':`span ${layout.span||12/columns}`};max-width:100%;gap:${layout.labelGap??6}px`);
      if(layout.labelPosition==='left')add(group,`display:grid;grid-template-columns:minmax(0,${layout.labelWidth||120}px) minmax(0,1fr);align-items:start`);
      if(layout.labelPosition==='left'){add(group+'>.kk-form-label','grid-column:1;grid-row:1');add(group+'>:not(.kk-form-label)','grid-column:2');}
      if(layout.labelPosition==='hidden')add(group+'>.kk-form-label','position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap');
      if(layout.labelPosition==='floating'&&!['checkbox','radio'].includes(field.type)){add(group,'position:relative');add(group+'>.kk-form-label',`position:absolute;z-index:1;pointer-events:none;top:12px;left:${(input.paddingLeft??12)+1}px;transition:transform 140ms,font-size 140ms`);add(`${group}:focus-within>.kk-form-label,${group}[data-filled=true]>.kk-form-label`,'transform:translateY(-9px);font-size:.65em');add(group+' .kk-form-control','padding-top:1.35em');}
      if(['checkbox','radio'].includes(field.type)){const display=layout.choiceLayout==='grid'?'grid':layout.choiceLayout==='row'?'flex':'grid';add(group+' .kk-choice-options',`display:${display};${display==='flex'?'flex-wrap:wrap;':`grid-template-columns:repeat(${layout.choiceLayout==='grid'?layout.choiceColumns||2:1},minmax(0,1fr));`}gap:${layout.choiceGap??8}px`);if(indicator.indicatorGap!==undefined)add(group+' .kk-form-choice',`gap:${indicator.indicatorGap}px`);if(choice.choiceVariant==='cards'||choice.choiceVariant==='pills')add(group+' .kk-form-choice','cursor:pointer');}
      if(indicator.indicatorSize)add(group+' .kk-form-choice input',`width:${indicator.indicatorSize}px;height:${indicator.indicatorSize}px`);
      if(Object.keys(indicator).some(key=>key.startsWith('border')||key.startsWith('radius')||key==='background')){add(group+' .kk-form-choice input:checked::before','content:"";display:block;width:55%;height:55%;background:var(--kk-check-color,currentColor);border-radius:inherit');if(indicator.accentColor)add(group+' .kk-form-choice input',`--kk-check-color:${indicator.accentColor}`);}
      if(Object.values(resolved.required||{}).some(style=>style.markerPosition!==undefined))add(group+' .kk-form-label','display:flex;gap:0');
      if(input.selectionColor||input.selectionBackground)add(group+' .kk-form-control::selection',`${input.selectionColor?'color:'+input.selectionColor+';':''}${input.selectionBackground?'background:'+input.selectionBackground+';':''}`);
      if(textarea.rows)add(group+' textarea.kk-form-control',`min-height:max(${textarea.minHeight??input.minHeight??44}px,calc(${textarea.rows}lh + ${(textarea.paddingTop??input.paddingTop??10)+(textarea.paddingBottom??input.paddingBottom??10)}px))`);
      const number=formPartStyle(content,field,'number',device);if(number.showSteppers===false){add(group+' input[type=number]','appearance:textfield');add(group+' input[type=number]::-webkit-inner-spin-button','appearance:none;margin:0');add(group+' input[type=number]::-webkit-outer-spin-button','appearance:none;margin:0');}
      if(phone.phoneBorder==='separate'){add(group+' .kk-phone','border:0;gap:8px;border-radius:0');add(group+' .kk-phone-trigger','border:1px solid #B8B2A8;border-radius:8px;'+formStyleDeclarations(trigger,'phoneTrigger',apiBase));add(group+' .kk-phone input','border:1px solid #B8B2A8;border-radius:8px;'+formStyleDeclarations(input,'input',apiBase));}
      if(Object.values(resolved.phoneTrigger||{}).some(style=>style.flagWidth||style.flagHeight))add(`${group} .kk-phone-flag,${menu} .kk-phone-flag`,`width:var(--kk-flag-width,${trigger.flagWidth||20}px);height:var(--kk-flag-height,${trigger.flagHeight||15}px)`);
      for(const [part,style]of [['form',form],['textarea',textarea],['phoneMenu',formPartStyle(content,field,'phoneMenu',device)]]){if(style.scrollbarSize!==undefined){const selector=part==='form'?root:part==='textarea'?group+' textarea':menu+' .kk-phone-options';add(selector+'::-webkit-scrollbar',`width:${style.scrollbarSize}px;height:${style.scrollbarSize}px`);}}
    };
    emit(null);for(const field of content.fields)emit(field);
    if(form.layout==='row'){add(root,`grid-template-columns:repeat(${content.fields.length+1},minmax(80px,1fr))`);add(root+'>.kk-form-submit','grid-column:auto');}
    if(form.motion===false)add(`${root} *,${root} *::before`,'transition:none!important;animation:none!important;transform:none!important');
  }
  add(`${scope} .kk-form-control:focus-visible,${scope} button:focus-visible`,'outline:var(--kk-focus-width,2px) solid var(--kk-focus-color,#A68150);outline-offset:var(--kk-focus-offset,2px)');
  add(`.kk-phone-menu[data-kk-form-menu="${content.formId}"] :is(button,input):focus-visible`,'outline:var(--kk-focus-width,2px) solid var(--kk-focus-color,#A68150);outline-offset:var(--kk-focus-offset,2px)');
  out.push(`@media(prefers-reduced-motion:reduce){${scope} *,${scope} *::before{transition:none!important;animation:none!important;transform:none!important}}`);
  return out.join('\n');
}
