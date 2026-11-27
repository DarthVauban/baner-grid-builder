import {paintAccessibilityCss,disposePaints} from './paint-runtime.mjs';
import {mountFormFlow,formFlowCss} from './form-flow-runtime.mjs';
import {formMinimumSize} from './forms.mjs';
import { PHONE_COUNTRIES, validateFormValues, phoneInputState } from './forms.mjs';
import { formPartStyle } from './form-appearance.mjs';
import { formAppearanceCss } from './form-style-css.mjs';
import { paintFormIcon } from './form-icons.mjs';
import { isZeroForm,fieldVariable,visibleFormFields,defaultFieldValue,singleCheckbox,maskedText,zeroFieldTitle } from './zero-form.mjs';
import { zeroFormCss,paintZeroForm,invalidateZeroForm } from './zero-form-runtime.mjs';
import {syncChildren} from './dom.mjs';
import { renderRichText,richTextFromPlain } from './rich-text.mjs';
export { PHONE_COUNTRIES, documentFormFields, validateFormValues, formMinimumSize } from './forms.mjs';

const css = `
.kk-form{box-sizing:border-box;display:flex;flex-direction:column;gap:1em;width:100%;height:100%;margin:0;padding:4px;overflow:auto;color:inherit;font:inherit;text-align:left;scrollbar-width:thin}
.kk-form *{box-sizing:border-box}.kk-form-field{display:flex;flex-direction:column;gap:6px;min-width:0;border:0;margin:0;padding:0}
.kk-form-label{display:block;font-size:.875em;line-height:1.4;overflow-wrap:anywhere;margin:0 0 6px}.kk-form-field>label.kk-form-label{margin:0}
.kk-form-control{width:100%;min-width:0;min-height:2.75em;border:1px solid #b8b2a8;border-radius:8px;padding:.6em .75em;color:inherit;background:transparent;font:inherit;line-height:1.4}
textarea.kk-form-control{min-height:5.5em;resize:vertical}.kk-form-control:focus-visible,.kk-form button:focus-visible,.kk-phone-menu button:focus-visible{outline:2px solid #a68150;outline-offset:2px}
.kk-form-choice{display:flex;align-items:flex-start;gap:.6em;line-height:1.4;overflow-wrap:anywhere;cursor:pointer}.kk-form-choice input{width:1em;height:1em;flex:none;margin:.2em 0;accent-color:#37342e}
.kk-form-submit{display:block;flex:none;width:100%;min-height:2.75em;padding:.6em .75em;border:0;border-radius:10px;font:inherit;line-height:1.4;white-space:normal;overflow-wrap:anywhere;color:#fff;background:#24221f;cursor:pointer}.kk-form-submit:disabled{opacity:.6;cursor:wait}
.kk-form-error,.kk-form-status{font-size:.8em;line-height:1.4;margin:0;overflow-wrap:anywhere}.kk-form-error{color:#ae302b}.kk-form [aria-invalid=true]{border-color:#ae302b}
.kk-phone{display:flex;align-items:stretch;min-width:0;border:1px solid #b8b2a8;border-radius:8px}.kk-phone input{border:0}.kk-phone-trigger{display:flex;gap:6px;align-items:center;flex:none;border:0;border-right:1px solid #b8b2a8;border-radius:7px 0 0 7px;padding:6px 8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.kk-form .kk-phone-flag,.kk-phone-menu .kk-phone-flag{width:20px;height:15px;object-fit:cover;flex:none;border-radius:2px;display:block}
.kk-phone-menu,.kk-phone-menu *{box-sizing:border-box}.kk-phone-menu{position:fixed;z-index:2147483600;width:min(320px,calc(100vw - 24px));max-height:min(340px,calc(100dvh - 24px));display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #e7e3dc;border-radius:14px;background:#fff;color:#25231f;box-shadow:0 12px 40px #0003;font:14px/1.4 Arial,sans-serif}
.kk-phone-menu[hidden]{display:none}.kk-phone-menu input{font:inherit;padding:10px;border:1px solid #d6d1c8;border-radius:8px;width:100%}.kk-phone-options{overflow:auto;min-height:0;overscroll-behavior:contain}
.kk-phone-option{display:flex;gap:10px;align-items:center;width:100%;padding:10px 8px;border:0;border-radius:7px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}.kk-phone-option:hover,.kk-phone-option[aria-selected=true]{background:#f4f1eb}.kk-phone-option span{flex:1;overflow-wrap:anywhere}.kk-phone-empty{margin:8px}
.kk-control-wrap{display:flex;position:relative;align-items:stretch;min-width:0;gap:0}.kk-control-wrap>.kk-form-control,.kk-control-wrap>.kk-phone{flex:1;min-width:0}.kk-control-wrap>.kk-form-control{width:0}.kk-phone input{min-width:0;flex:1;width:0}.kk-choice-options{display:grid;gap:6px;min-width:0}.kk-choice-text{min-width:0}.kk-form-help{font-size:.8em;line-height:1.4;margin:0}.kk-decoration{display:inline-flex;align-items:center;justify-content:center;flex:none;width:var(--kk-icon-size,20px);height:var(--kk-icon-size,20px);order:var(--kk-icon-order,-1);align-self:center}.kk-decoration svg,.kk-decoration img{display:block;width:100%;height:100%;object-fit:contain}.kk-input-icon{margin-inline:var(--kk-icon-gap,6px)}.kk-number-prefix,.kk-number-suffix{align-self:center;padding-inline:6px;flex:none}.kk-form-submit,.kk-form-help,.kk-form-error,.kk-form-status{display:flex;align-items:center;gap:var(--kk-icon-gap,6px)}.kk-form-submit{justify-content:center}.kk-form-submit>span:not(.kk-decoration):not(.kk-spinner){min-width:0;overflow-wrap:anywhere}.kk-form [hidden]{display:none!important}.kk-spinner{display:none;flex:none;width:1em;height:1em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:kk-form-spin .8s linear infinite}.kk-form[data-pending=true][data-spinner=true] .kk-spinner{display:block}@keyframes kk-form-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.kk-form *{animation:none!important;transition:none!important}}
`;
const create = (tag, className) => { const node=document.createElement(tag);if(className)node.className=className;return node; };
const flag = (country, apiBase) => {const img=create('img','kk-phone-flag');img.alt='';img.src=`${apiBase}/api/public/popup-banners/zero-block/flags/${country.toLowerCase()}.svg`;img.width=20;img.height=15;return img;};

function phoneControl(field, input, apiBase, onCountryChange, appearance=()=>({}), context=()=>({})) {
  const wrap=create('div','kk-phone'),trigger=create('button','kk-phone-trigger');trigger.type='button';trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const masked=field.phone.mode==='country';input.inputMode='numeric';
  let country=field.phone.country,number='',menu=null,root=null,accepted=phoneInputState('',country,field.phone.mode),restore={start:0,end:0};
  let paintKey='';
  const code=()=>PHONE_COUNTRIES.find(item=>item.country===country);
  const paint=()=>{if(!masked)return;const item=code(),style=appearance('phoneTrigger');const signature=country+JSON.stringify(style);if(signature!==paintKey){paintKey=signature;trigger.replaceChildren();if(style.showFlag!==false)trigger.append(flag(country,apiBase));if(style.showCode!==false)trigger.append(document.createTextNode(`+${item.code}`));if(style.showCountryName)trigger.append(document.createTextNode(item.name));if(style.disclosure!=='none')trigger.append(document.createTextNode(style.disclosure==='plus'?'+':'▾'));trigger.setAttribute('aria-label',`Країна телефону: ${item.name} +${item.code}`);}if(menu){menu.dataset.device=context().device||'desktop';for(const key of ['filled','error','pending','success'])menu.dataset[key]=String(!!context()[key]);positionMenu();}};
  function positionMenu(){if(!menu)return;menu.style.maxWidth=`${Math.max(100,innerWidth-24)}px`;menu.style.maxHeight=`${Math.min(appearance('phoneMenu').maxHeight||340,Math.max(100,innerHeight-24))}px`;const rect=trigger.getBoundingClientRect(),size=menu.getBoundingClientRect();menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-size.width-12))}px`;menu.style.top=`${Math.max(12,rect.bottom+size.height+8<=innerHeight?rect.bottom+8:rect.top-size.height-8)}px`;}
  const close=(focus=false)=>{if(menu){menu.remove();menu=null;root?.removeEventListener('pointerdown',outside,true);trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus();}};
  const outside=event=>{if(!event.composedPath().includes(menu)&&!event.composedPath().includes(trigger))close();};
  const canAccept=next=>next&&(next.digits<=next.maxDigits||(next.country===country&&(next.digits<accepted.digits||next.text===accepted.text)));
  const rememberSelection=()=>{restore={start:input.selectionStart??0,end:input.selectionEnd??0};};
  const update=(value,preserveCaret=false,allowOverflow=false)=>{
    const caret=input.selectionStart??input.value.length,end=input.selectionEnd??caret,digitsBefore=value.slice(0,caret).replace(/\D/g,'').length;
    const formatted=phoneInputState(value,country,field.phone.mode);
    if(!formatted||(!allowOverflow&&!canAccept(formatted))){input.value=accepted.text;input.setSelectionRange(restore.start,restore.end);return false;}
    const removedDigits=Math.max(0,value.replace(/\D/g,'').length-formatted.text.replace(/\D/g,'').length);
    country=formatted.country;number=formatted.number;input.value=formatted.text;accepted=formatted;paint();
    if(preserveCaret&&formatted.text===value)input.setSelectionRange(caret,end);
    else if(preserveCaret){const wanted=Math.max(0,digitsBefore-removedDigits);let seen=0,at=0;if(wanted)for(;at<input.value.length;at++){if(/\d/.test(input.value[at]))seen++;if(seen>=wanted){at++;break;}}input.setSelectionRange(at,at);}
    rememberSelection();return true;
  };
  input.addEventListener('beforeinput',event=>{
    rememberSelection();
    if(event.inputType.startsWith('insert')&&event.data!==null){
      const typing=['insertText','insertCompositionText'].includes(event.inputType),candidate=input.value.slice(0,restore.start)+event.data+input.value.slice(restore.end);
      if((typing&&!/^\d+$/.test(event.data))||!canAccept(phoneInputState(candidate,country,field.phone.mode)))event.preventDefault();
      return;
    }
    if(!masked||!['deleteContentBackward','deleteContentForward'].includes(event.inputType)||input.selectionStart!==input.selectionEnd)return;
    const direction=event.inputType==='deleteContentBackward'?-1:1,caret=input.selectionStart??0;
    let at=direction<0?caret-1:caret;
    if(at<0||at>=input.value.length||/\d/.test(input.value[at]))return;
    while(at>=0&&at<input.value.length&&!/\d/.test(input.value[at]))at+=direction;
    if(at<0||at>=input.value.length)return;
    event.preventDefault();input.value=input.value.slice(0,at)+input.value.slice(at+1);input.setSelectionRange(at,at);
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:event.inputType}));
  });
  input.addEventListener('input',event=>{if(!update(input.value,true))event.stopImmediatePropagation();});
  const insert=(value,inputType)=>{
    rememberSelection();const candidate=input.value.slice(0,restore.start)+value+input.value.slice(restore.end);
    if(!canAccept(phoneInputState(candidate,country,field.phone.mode)))return;
    input.value=candidate;input.setSelectionRange(restore.start+value.length,restore.start+value.length);
    input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType,data:value}));
  };
  input.addEventListener('paste',event=>{event.preventDefault();insert(event.clipboardData?.getData('text/plain')||'','insertFromPaste');});
  input.addEventListener('drop',event=>{event.preventDefault();input.focus();insert(event.dataTransfer?.getData('text/plain')||'','insertFromDrop');});
  trigger.addEventListener('click',()=>{
    if(menu){close();return;}
    menu=create('div','kk-phone-menu');root=wrap.getRootNode();menu.dataset.kkFormMenu=context().formId||'';menu.dataset.fieldId=field.id;menu.dataset.device=context().device||'desktop';
    const search=create('input');search.type='search';search.placeholder='Пошук країни';search.setAttribute('aria-label','Пошук країни телефону');
    const list=create('div','kk-phone-options');list.setAttribute('role','listbox');list.setAttribute('aria-label','Країна та телефонний код');
    menu.append(search,list);(root instanceof ShadowRoot?root:document.body).append(menu);trigger.setAttribute('aria-expanded','true');
    function render(){list.replaceChildren();const query=search.value.toLocaleLowerCase('uk').trim();for(const item of PHONE_COUNTRIES.filter(item=>`${item.name} ${item.country} +${item.code}`.toLocaleLowerCase('uk').includes(query))){
      const option=create('button','kk-phone-option');option.type='button';option.setAttribute('role','option');option.setAttribute('aria-selected',String(item.country===country));option.dataset.country=item.country;
      const name=create('span');name.textContent=item.name;option.append(flag(item.country,apiBase),name,document.createTextNode(`+${item.code}`));
      option.addEventListener('click',()=>{country=item.country;update(input.value,false,true);close();input.dispatchEvent(new Event('input',{bubbles:true}));onCountryChange();input.focus();});list.append(option);
    }if(!list.childNodes.length){const empty=create('p','kk-phone-empty');empty.textContent='Країну не знайдено';list.append(empty);}}
    search.addEventListener('input',render);render();
    menu.style.maxWidth=`${Math.max(100,innerWidth-24)}px`;menu.style.maxHeight=`${Math.min(appearance('phoneMenu').maxHeight||340,Math.max(100,innerHeight-24))}px`;
    const rect=trigger.getBoundingClientRect(),size=menu.getBoundingClientRect(),height=size.height;menu.style.left=`${Math.max(12,Math.min(rect.left,innerWidth-size.width-12))}px`;menu.style.top=`${Math.max(12,rect.bottom+height+8<=innerHeight?rect.bottom+8:rect.top-height-8)}px`;
    menu.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
      const options=[...list.querySelectorAll('button')];const active=options.indexOf(root.activeElement);
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const direction=event.key==='ArrowDown'?1:-1;options[(active+direction+options.length)%options.length]?.focus();}
      if(event.key==='Home'){event.preventDefault();options[0]?.focus();}if(event.key==='End'){event.preventDefault();options.at(-1)?.focus();}
    });root.addEventListener('pointerdown',outside,true);search.focus();
  });
  paint();if(masked)wrap.append(trigger,input);return {node:masked?wrap:input,value:()=>input.value.trim()?number:'',country:()=>country,layout:paint,destroy:()=>close()};
}

/** One customer renderer for editor, whole-banner preview and storefront. */
export function mountFormContent(target, content, options = {}) {
  const zero=isZeroForm(content);content={...content,fields:content.fields.map(field=>({...field,variable:fieldVariable(field)}))};
  const style=create('style');style.textContent=paintAccessibilityCss+css+'\n'+(content.flow?formFlowCss:'')+'\n'+(zero?zeroFormCss:formAppearanceCss(content,options.apiBase||''));target.append(style);
  const form=create('form',zero?'kk-form kk-zero-form':'kk-form');form.noValidate=true;form.dataset.formId=content.formId;form.setAttribute('aria-label',options.name||'Форма');
  const inputsBox=zero?create('div','kk-zero-inputs'):form,belowBox=zero?create('div','kk-zero-below'):null,footer=zero?create('div','kk-zero-footer'):null,submitBox=zero?create('div','kk-zero-submit'):null;
  if(zero)form.append(inputsBox);
  if(options.appearanceState)form.dataset.appearanceState=options.appearanceState;
  let device=options.device||'desktop',pending=false,destroyed=false,navigateTimer,flowUi;
  const controls=new Map(),readers=new Map(),phoneCountries=new Map(),errors=new Map(),cleanups=new Map(),parts=new Map(),phones=new Map();
  const decoration=()=>{const node=create('span','kk-decoration');node.setAttribute('aria-hidden','true');return node;};
  const status=create(zero?'div':'p','kk-form-status'),statusIcon=decoration(),statusText=create(zero?'div':'span');status.setAttribute('role','status');status.hidden=true;status.append(statusIcon,statusText);if(zero)statusIcon.hidden=true;
  const stateFor=field=>{const group=parts.get(field?.id)?.group||form;if(pending)return 'pending';if(form.dataset.success==='true')return 'success';if(group.dataset.error==='true')return 'error';if(group.matches(':active'))return 'active';if(group.matches(':focus-within'))return 'focus';if(group.querySelector(':disabled'))return 'disabled';if(group.querySelector('[readonly]'))return 'readonly';if(group.querySelector(':checked'))return 'selected';if(group.matches(':hover'))return 'hover';if(group.dataset.filled==='true')return 'filled';return 'normal';};
  const appearance=(field,part)=>formPartStyle(content,field,part,device,stateFor(field));
  const autoSized=new WeakSet();
  const grow=(field,input)=>{if(field.type!=='textarea')return;const settings=appearance(field,'textarea');if(settings.autoGrow){autoSized.add(input);input.style.height='auto';input.style.height=`${input.scrollHeight}px`;}else if(autoSized.has(input)){input.style.removeProperty('height');autoSized.delete(input);}};
  function refresh(){
    for(const field of content.fields){const entry=parts.get(field.id);if(!entry)continue;const {group,marker,inputIcon,prefix,suffix,helpIcon,errorIcon,first}=entry;const value=readers.get(field.variable)?.();group.dataset.filled=String(Array.isArray(value)?value.length>0:!!value);const markerStyle=appearance(field,'required');if(marker)marker.textContent=' '+(markerStyle.markerText??'*');if(zero){inputIcon.hidden=helpIcon.hidden=errorIcon.hidden=true;}else{paintFormIcon(inputIcon,appearance(field,'icon'),options.apiBase||'');paintFormIcon(helpIcon,appearance(field,'help'),options.apiBase||'');paintFormIcon(errorIcon,appearance(field,'error'),options.apiBase||'');}const number=zero?{}:appearance(field,'number');prefix.textContent=field.type==='number'?number.prefix||'':'';suffix.textContent=field.type==='number'?number.suffix||'':'';prefix.hidden=!prefix.textContent;suffix.hidden=!suffix.textContent;if(first&&!zero)grow(field,first);phones.get(field.id)?.layout();}
    form.dataset.filled=String([...parts.values()].some(entry=>entry.group.dataset.filled==='true'));
    if(zero){const active=paintZeroForm({form,content,device,parts,button,buttonIcon,inputsBox,submitBox,belowBox,footer,readAll,apiBase:options.apiBase||'',stepFieldIds:flowUi?.fieldIds,pending,measureAllFields:!!(options.measureOnly&&content.flow)});for(const field of content.fields)if(!active.includes(field))phones.get(field.id)?.destroy();form.dataset.error=String([...parts.values()].some(entry=>entry.group.dataset.error==='true'));}
    else{paintFormIcon(buttonIcon,appearance(null,'submit'),options.apiBase||'');paintFormIcon(statusIcon,appearance(null,form.dataset.success==='true'?'success':'status'),options.apiBase||'');}form.dataset.spinner=String(zero||appearance(null,'submit').showSpinner!==false);flowUi?.paint(device);
  }
  const tell=(message,success=false)=>{if(zero&&success)renderRichText(statusText,content.behavior?.success||richTextFromPlain(message));else statusText.textContent=message;status.hidden=!message;form.dataset.success=String(success);refresh();};
  function addField(field){
    const choices=field.type==='checkbox'||field.type==='radio',group=create(choices?'fieldset':'div','kk-form-field');group.dataset.fieldId=field.id;group.dataset.fieldVariable=field.variable;
    const label=create(choices?'legend':'label','kk-form-label'),labelText=create('span','kk-label-text');labelText.textContent=field.label;label.append(labelText);const marker=field.required&&!zero?create('span','kk-required'):null;if(marker){marker.textContent=' *';label.append(marker);}const id=`kk-field-${content.formId}-${field.id}`;if(!choices)label.htmlFor=id;if(zero&&!field.label.trim())label.hidden=true;if(choices&&zero)group.setAttribute('aria-label',zeroFieldTitle(field));group.append(label);
    const inputIcon=decoration(),helpIcon=decoration(),errorIcon=decoration(),prefix=create('span','kk-number-prefix'),suffix=create('span','kk-number-suffix');inputIcon.classList.add('kk-input-icon');prefix.setAttribute('aria-hidden','true');suffix.setAttribute('aria-hidden','true');
    let first;
    if(choices){
      const initial=defaultFieldValue(field),list=create('div','kk-choice-options');for(const option of field.options){const row=create('label','kk-form-choice'),input=create('input');input.type=field.type;input.name=id;input.value=option.id;input.setAttribute('data-option-id',option.id);input.setAttribute('aria-required',String(field.required));input.checked=Array.isArray(initial)?initial.includes(option.id):initial===option.id;const text=create(zero&&singleCheckbox(field)?'div':'span','kk-choice-text');if(zero&&singleCheckbox(field))renderRichText(text,field.checkboxLabel||richTextFromPlain(option.label));else text.textContent=option.label;row.append(input,text);list.append(row);first||=input;}group.append(list);
      let customInput;if(zero&&field.customAnswer?.enabled&&!singleCheckbox(field)){const row=create('label','kk-form-choice'),input=create('input'),text=create('span','kk-choice-text'),own=create('div','kk-custom-answer');input.type=field.type;input.name=id;input.value='custom';input.dataset.customChoice='true';text.textContent=field.customAnswer.label||'Своя відповідь';row.append(input,text);list.append(row);customInput=create('input','kk-form-control');customInput.type='text';customInput.maxLength=500;customInput.dataset.customAnswer='true';customInput.setAttribute('aria-label',`${zeroFieldTitle(field)}: власна відповідь`);own.append(customInput);own.hidden=!(options.measureOnly&&content.flow);customInput.disabled=true;group.append(own);const update=event=>{const selected=input.checked;own.hidden=!selected;customInput.disabled=!selected;if(selected&&event.target===input)customInput.focus();};group.addEventListener('change',update);}
      readers.set(field.variable,()=>{const selected=[...list.querySelectorAll('input:checked')].map(input=>input.dataset.customChoice?{custom:customInput?.value||''}:input.value);return field.type==='checkbox'?selected:selected[0]||'';});
    }else{
      const input=create(field.type==='textarea'?'textarea':'input','kk-form-control');if(input.tagName==='INPUT')input.type=field.type;input.id=id;input.name=field.variable;input.placeholder=field.placeholder;input.required=field.required;input.maxLength={text:500,email:254,tel:40,number:100,textarea:2000}[field.type];if(field.type==='number')input.step='any';
      if(field.type==='tel')input.autocomplete=field.phone.mode==='country'?'tel-national':'tel';if(field.type==='email')input.autocomplete='email';first=input;if(zero){input.value=String(defaultFieldValue(field));input.setAttribute('aria-label',field.label||field.placeholder||zeroFieldTitle(field));if(field.type==='textarea')input.rows=field.rows||3;}
      const wrap=create('div','kk-control-wrap');wrap.append(inputIcon,prefix);
      if(field.mask&&(field.type==='text'||field.type==='tel'&&field.phone.mode!=='country'))input.addEventListener('input',()=>{const value=input.value,caret=input.selectionStart??value.length,next=maskedText(value,field.mask);if(value!==next){const position=maskedText(value.slice(0,caret),field.mask).length;input.value=next;input.setSelectionRange(Math.min(position,next.length),Math.min(position,next.length));}});
      if(field.type==='tel'&&field.phone.mode!=='custom'){const phone=phoneControl(field,input,options.apiBase||'',()=>{tell('');if(readers.get(field.variable)())validateField(field,readValues(),false);},part=>zero?{}:appearance(field,part),()=>({formId:content.formId,device,filled:parts.get(field.id)?.group.dataset.filled==='true',error:parts.get(field.id)?.group.dataset.error==='true',pending,success:form.dataset.success==='true'}));wrap.append(phone.node);readers.set(field.variable,phone.value);phoneCountries.set(field.variable,phone.country);phones.set(field.id,phone);cleanups.set(field.id,phone.destroy);}else{if(zero&&field.type==='number'){wrap.classList.add('kk-number-wrap');const minus=create('button','kk-stepper'),plus=create('button','kk-stepper');minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label',`${zeroFieldTitle(field)}: зменшити число`);plus.setAttribute('aria-label',`${zeroFieldTitle(field)}: збільшити число`);for(const [button,direction]of [[minus,-1],[plus,1]])button.addEventListener('click',()=>{const current=Number(input.value||'0');if(!Number.isFinite(current))return;input.value=String(Number((current+direction).toPrecision(12)));input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();});wrap.append(minus,input,plus);}else wrap.append(input);readers.set(field.variable,()=>input.value);}wrap.append(suffix);group.append(wrap);
    }
    const help=field.helpText?create('p','kk-form-help'):null;if(help){help.id=`${id}-help`;const text=create('span');text.textContent=field.helpText;help.append(helpIcon,text);if(zero)group.insertBefore(help,label.nextSibling);else group.append(help);}
    const error=create('p','kk-form-error'),errorText=create('span');error.id=`${id}-error`;error.hidden=true;error.setAttribute('role','alert');error.append(errorIcon,errorText);group.append(error);errors.set(field.variable,{node:error,text:errorText});controls.set(field.variable,first);first?.setAttribute('aria-describedby',[help?.id,error.id].filter(Boolean).join(' '));
    parts.set(field.id,{group,marker,inputIcon,prefix,suffix,helpIcon,errorIcon,first,label,labelText,help});
    const clear=()=>{error.hidden=true;group.dataset.error='false';form.dataset.error=String([...parts.values()].some(entry=>entry.group.dataset.error==='true'));first?.removeAttribute('aria-invalid');first?.setCustomValidity('');tell('');};group.addEventListener('input',clear);group.addEventListener('change',clear);inputsBox.append(group);
    if(field.type==='tel')first.addEventListener('blur',event=>{if(!event.relatedTarget?.closest?.('.kk-phone-trigger,.kk-phone-menu')&&readers.get(field.variable)().trim())validateField(field,readValues(),false);});
  }
  for(const field of content.fields)addField(field);
  const button=create('button','kk-form-submit'),buttonIcon=decoration(),buttonText=create('span'),spinner=create('span','kk-spinner');button.type='submit';buttonText.textContent=content.submitText;spinner.setAttribute('aria-hidden','true');button.append(buttonIcon,buttonText,spinner);if(zero){buttonIcon.classList.add('kk-button-decoration');submitBox.append(button);inputsBox.append(submitBox);form.append(belowBox,footer,status);}else form.append(button,status);target.append(form);
  const readAll=()=>Object.fromEntries([...readers].map(([key,read])=>[key,read()]));
  const readValues=()=>{const all=readAll();return zero?Object.fromEntries(visibleFormFields(content.fields,all).map(field=>[field.variable,all[field.variable]])):all;};
  function validateField(field,values,focus){
    const control=controls.get(field.variable),error=errors.get(field.variable),group=parts.get(field.id).group;
    try{if(control?.validity?.badInput)throw new Error(`Вкажіть число: ${field.label}`);const normalized=validateFormValues([field],{[field.variable]:values[field.variable]},{zero,skipVisibility:true,messages:content.behavior?.errors,phoneCountries:{[field.variable]:phoneCountries.get(field.variable)?.()}});if(field.type==='tel')values[field.variable]=normalized[field.variable];error.node.hidden=true;group.dataset.error='false';form.dataset.error=String([...parts.values()].some(entry=>entry.group.dataset.error==='true'));control?.removeAttribute('aria-invalid');refresh();return true;}
    catch(failure){error.text.textContent=failure.message;error.node.hidden=false;group.dataset.error='true';form.dataset.error='true';control?.setAttribute('aria-invalid','true');if(focus){control?.focus();control?.scrollIntoView({block:'nearest'});}refresh();return false;}
  }
  function validate(currentStep=false){
    const values=readValues(),active=zero?visibleFormFields(content.fields,readAll()):content.fields;for(const field of active){if(currentStep&&flowUi&&!flowUi.fieldIds.includes(field.id))continue;if(!validateField(field,values,!flowUi)){if(flowUi){flowUi.setStep(content.flow.steps.findIndex(s=>s.fieldIds.includes(field.id)));validateField(field,values,true);}return null;}}
    return values;
  }
  async function submit(){
    if(options.mode==='editor'||pending||destroyed||zero&&form.dataset.success==='true')return;if(flowUi&&!flowUi.last){if(validate(true))flowUi.next();return;}const values=validate();if(!values)return;
    if(options.mode==='preview'){if(flowUi){flowUi.success();refresh();}else tell('Прев’ю не надсилає заявки');return;}
    pending=true;form.dataset.pending='true';button.disabled=true;tell('Надсилаємо заявку…');
    try{if(!options.onSubmit)throw new Error('Заявку не прийнято. Спробуйте ще раз.');const accepted=await options.onSubmit(content.formId,values);if(destroyed)return;if(flowUi){if(!accepted?.reward)throw new Error('Винагорода недоступна. Спробуйте ще раз.');flowUi.success(accepted.reward);status.hidden=true;refresh();}else tell('Заявку прийнято',true);if(!flowUi&&zero&&content.behavior?.successUrl)navigateTimer=setTimeout(()=>{if(!destroyed)try{if(options.onNavigate)options.onNavigate(content.behavior.successUrl);else window.location.assign(content.behavior.successUrl);}catch{/* The accepted submission stays successful if navigation is unavailable. */}},300);}
    catch(failure){form.dataset.error='true';tell(failure?.message||'Заявку не прийнято. Спробуйте ще раз.');}
    finally{pending=false;if(!destroyed){form.dataset.pending='false';button.disabled=false;refresh();}}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void submit();});
  if(options.mode==='preview')form.addEventListener('click',event=>{if(event.target.closest?.('a')){event.preventDefault();if(flowUi){statusText.textContent='У прев’ю перехід вимкнено';status.hidden=false;}else tell('У прев’ю перехід вимкнено');}});
  for(const event of ['mouseover','mouseout','focusin','focusout','pointerdown','pointerup'])form.addEventListener(event,()=>queueMicrotask(refresh));
  if(options.mode==='editor'){form.inert=true;form.setAttribute('aria-hidden','true');}
  if(content.flow){flowUi=mountFormFlow(form,content,options,{button,buttonText,submitBox,onChange:refresh});const view=options.formSteps?.[content.formId];if(options.mode==='editor'&&view!==undefined)flowUi.setStep(view);}
  function layout(nextDevice){device=nextDevice;form.dataset.device=device;refresh();}layout(device);
  function update(next,nextOptions={}){
    if(isZeroForm(next)!==zero||next.formId!==content.formId)return false;
    next=structuredClone(next);next.fields=next.fields.map(field=>({...field,variable:fieldVariable(field)}));
    const fieldKind=field=>JSON.stringify({...field,appearance:null,label:null,placeholder:null,required:null,helpText:null,defaultValue:null,defaultChecked:null,rows:null,joinNext:null,width:null,belowSubmit:null,disabled:null,validation:null,visibility:null,checkboxLabel:null,choiceLayout:null,choiceMobileColumns:null});
    const previous=new Map(content.fields.map(field=>[field.id,field])),incoming=new Map(next.fields.map(field=>[field.id,field]));
    for(const field of content.fields)if(!incoming.has(field.id)||fieldKind(field)!==fieldKind(incoming.get(field.id))){const entry=parts.get(field.id);cleanups.get(field.id)?.();cleanups.delete(field.id);phones.delete(field.id);disposePaints(entry.group);entry.group.remove();parts.delete(field.id);controls.delete(field.variable);readers.delete(field.variable);phoneCountries.delete(field.variable);errors.delete(field.variable);previous.delete(field.id);}
    const retained=next.fields.map(field=>{const old=previous.get(field.id);if(!old)return field;const defaults=JSON.stringify(defaultFieldValue(old));for(const key of Object.keys(old))if(!Object.hasOwn(field,key))delete old[key];Object.assign(old,field);const entry=parts.get(field.id);entry.labelText.textContent=field.label;entry.label.hidden=zero&&!field.label.trim();entry.group.dataset.fieldVariable=field.variable;
      if(!zero&&field.required&&!entry.marker){entry.marker=create('span','kk-required');entry.label.append(entry.marker);}else if(!zero&&!field.required&&entry.marker){entry.marker.remove();entry.marker=null;}
      if(entry.first&&!['checkbox','radio'].includes(field.type)){entry.first.placeholder=field.placeholder;entry.first.required=field.required;entry.first.setAttribute('aria-label',field.label||field.placeholder||zeroFieldTitle(field));if(field.type==='textarea')entry.first.rows=field.rows||3;if(options.mode==='editor'&&defaults!==JSON.stringify(defaultFieldValue(field)))entry.first.value=String(defaultFieldValue(field));}
      if(field.type==='checkbox'||field.type==='radio'){entry.group.setAttribute('aria-label',zeroFieldTitle(field));for(const input of entry.group.querySelectorAll('input[data-option-id]')){input.setAttribute('aria-required',String(field.required));if(options.mode==='editor'&&defaults!==JSON.stringify(defaultFieldValue(field))){const value=defaultFieldValue(field);input.checked=Array.isArray(value)?value.includes(input.value):value===input.value;}}if(zero&&singleCheckbox(field)){const rich=entry.group.querySelector('.kk-choice-text');renderRichText(rich,field.checkboxLabel||richTextFromPlain(field.options[0]?.label||''));}}
      const id=`kk-field-${content.formId}-${field.id}`;if(field.helpText){if(!entry.help){entry.help=create('p','kk-form-help');entry.help.id=id+'-help';entry.help.append(entry.helpIcon,create('span'));entry.group.insertBefore(entry.help,zero?entry.label.nextSibling:errors.get(field.variable).node);}entry.help.lastElementChild.textContent=field.helpText;}else if(entry.help){entry.help.remove();entry.help=null;}entry.first?.setAttribute('aria-describedby',[entry.help?.id,id+'-error'].filter(Boolean).join(' '));return old;});
    content={...next,fields:retained};Object.assign(options,nextOptions);form.setAttribute('aria-label',options.name||'Форма');
    const cssText=paintAccessibilityCss+css+'\n'+(content.flow?formFlowCss:'')+'\n'+(zero?zeroFormCss:formAppearanceCss(content,options.apiBase||''));if(style.textContent!==cssText)style.textContent=cssText;
    for(const field of content.fields)if(!parts.has(field.id))addField(field);
    if(!zero)syncChildren(form,[...content.fields.map(field=>parts.get(field.id).group),button,status]);
    if(content.flow){if(flowUi)flowUi.update(content);else flowUi=mountFormFlow(form,content,options,{button,buttonText,submitBox,onChange:refresh});}else if(flowUi){flowUi.destroy();flowUi=null;form.dataset.success='false';}
    if(buttonText.textContent!==content.submitText)buttonText.textContent=content.submitText;invalidateZeroForm(form);layout(device);return true;
  }
  return {form,controls,readValues,validate,submit,layout,update,setStep:view=>flowUi?.setStep(view),destroy(){disposePaints(form);destroyed=true;flowUi?.destroy();clearTimeout(navigateTimer);cleanups.forEach(clean=>clean());form.remove();style.remove();}};
}

const formMeasurements=new Map();
let fontMeasurementHook=false;
/** Measures the very same customer DOM at document scale, never a screenshot or approximate text count. */
export function measureFormContent(content,width=320,device='desktop'){
  if(typeof document==='undefined')return formMinimumSize(content,width,16,device);
  const key=JSON.stringify([content,width,device]),cached=formMeasurements.get(key);if(cached)return cached;
  if(!fontMeasurementHook&&document.fonts){document.fonts.addEventListener('loadingdone',()=>formMeasurements.clear());fontMeasurementHook=true;}
  const host=create('div');host.style.cssText='all:initial!important;position:fixed!important;left:-100000px!important;top:0!important;visibility:hidden!important;pointer-events:none!important';document.documentElement.append(host);const root=host.attachShadow({mode:'closed'});const probe=create('div');probe.style.cssText=`position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;width:${Math.max(20,width)}px;font:16px Arial,sans-serif;contain:layout style paint`;root.append(probe);
  const mounted=mountFormContent(probe,content,{mode:'editor',device,measureOnly:true}),button=mounted.form.querySelector('.kk-form-submit'),buttonWidth=button.style.width;if(buttonWidth==='100%')button.style.width='max-content';const minimum=Math.max(20,Math.ceil(button.getBoundingClientRect().width));button.style.width=buttonWidth;probe.style.width=`${Math.max(width,minimum)}px`;mounted.layout(device);let measuredHeight=mounted.form.getBoundingClientRect().height,measuredWidth=minimum;if(content.flow){for(const view of [...content.flow.steps.map((_,i)=>i),'success']){mounted.setStep(view);measuredHeight=Math.max(measuredHeight,mounted.form.getBoundingClientRect().height);if(mounted.form.scrollWidth>probe.clientWidth+1)measuredWidth=Math.max(measuredWidth,mounted.form.scrollWidth);}mounted.setStep(0);}const result={width:measuredWidth,height:content.flow?Math.ceil(measuredHeight):Math.round(measuredHeight)};mounted.destroy();host.remove();
  if(formMeasurements.size>=100)formMeasurements.clear();formMeasurements.set(key,result);return result;
}
