import { AsYouType, getCountries, getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString, validatePhoneNumberLength } from 'libphonenumber-js/max';
import { Metadata } from 'libphonenumber-js/core';
import phoneMetadata from 'libphonenumber-js/max/metadata';
import phoneExamples from 'libphonenumber-js/examples.mobile.json';
import { compilePhonePlan } from './phone-plan.mjs';
import { validateFormAppearance, styledFormMinimumSize } from './form-appearance.mjs';
import { FIELD_EXTRA_KEYS, isZeroForm, fieldVariable, singleCheckbox, choiceField, defaultFieldValue, visibleFormFields, zeroFieldErrors, validateZeroDesign, validateZeroBehavior, zeroFormValues, completeMask, zeroFieldTitle } from './zero-form.mjs';
import {validateFormFlow,formFlowErrors} from './form-flow.mjs';
import { richTextFromPlain } from './rich-text.mjs';

export const FORM_FIELD_TYPES = ['text', 'tel', 'email', 'number', 'checkbox', 'radio', 'textarea'];
export const FIELD_TYPE_LABELS = { text: 'Текстове', tel: 'Телефон', email: 'Email', number: 'Числове', checkbox: 'Чекбокси', radio: 'Радіокнопки', textarea: 'Багаторядкове' };
const regionNames = new Intl.DisplayNames(['uk'], { type: 'region' });
// Non-ISO special regions AC/TA have no flag in the shipped ISO flag collection.
export const PHONE_COUNTRIES = getCountries().filter(country => !['AC','TA'].includes(country)).map(country => ({ country, code: getCountryCallingCode(country), name: regionNames.of(country) || country })).sort((a,b)=>a.name.localeCompare(b.name,'uk'));
const countryIds = new Set(PHONE_COUNTRIES.map(item => item.country));
const numberingPlans = new Metadata(phoneMetadata);
const phonePrefixes=new Map(),phoneDefaultLengths=new Map();
const phoneLengths = new Map(PHONE_COUNTRIES.map(({country,code}) => {
  numberingPlans.selectNumberingPlan(country);
  phonePrefixes.set(country,numberingPlans.numberingPlan.nationalPrefix());
  phoneDefaultLengths.set(country,(numberingPlans.numberingPlan.type('MOBILE')||numberingPlans.numberingPlan.type('FIXED_LINE')).possibleLengths().filter(length=>length+code.length<=15));
  return [country,numberingPlans.numberingPlan.possibleLengths().filter(length => length + code.length <= 15)];
}));
const compiledPhonePlans=new Map();
const phoneTypes=['FIXED_LINE','MOBILE','TOLL_FREE','PREMIUM_RATE','SHARED_COST','PERSONAL_NUMBER','VOIP','PAGER','UAN','VOICEMAIL'];
export function phoneMaskLengths(country, nationalPrefix='',fallback=true) {
  if(!compiledPhonePlans.has(country)){
    const metadata=new Metadata(phoneMetadata);metadata.selectNumberingPlan(country);
    const types=phoneTypes.flatMap(name=>{const type=metadata.numberingPlan.type(name);if(!type)return [];const pattern=type.pattern()||(name==='MOBILE'?metadata.numberingPlan.type('FIXED_LINE')?.pattern():'');return pattern?[{pattern,lengths:type.possibleLengths()}]:[];});
    compiledPhonePlans.set(country,compilePhonePlan(types,phoneLengths.get(country).at(-1)));
  }
  return compiledPhonePlans.get(country).lengths(nationalPrefix,fallback,phoneDefaultLengths.get(country));
}

const phoneGroups=new Map();
function defaultPhoneGroups(country){
  if(!phoneGroups.has(country)){
    const example=getExampleNumber(country,phoneExamples),prefix=`+${getCountryCallingCode(country)}`;
    phoneGroups.set(country,country==='UA'?[3,3,4]:example.formatInternational().slice(prefix.length).trim().split(/[ ()-]+/).filter(Boolean).map(part=>part.length));
  }
  return phoneGroups.get(country);
}

function groupPhoneDigits(national,groups){
  let at=0;const parts=[];
  for(const length of groups){if(at>=national.length)break;parts.push(national.slice(at,at+length));at+=length;}
  if(at<national.length)parts.push(national.slice(at));
  return parts;
}

/** National significant digits only: calling code and trunk prefix have already been parsed. */
export function phoneLengthError(country, nationalNumber) {
  const lengths=phoneLengths.get(country);
  if (!lengths) return 'INVALID_COUNTRY';
  if (nationalNumber.length < lengths[0]) return 'TOO_SHORT';
  if (nationalNumber.length > lengths.at(-1)) return 'TOO_LONG';
  return lengths.includes(nationalNumber.length) ? undefined : 'INVALID_LENGTH';
}

function phoneLengthHint(country, nationalPrefix='') {
  if(!phoneLengths.has(country))return '';
  const lengths=phoneMaskLengths(country,nationalPrefix);
  const ranges=[];
  for (let i=0;i<lengths.length;i++) {
    const start=lengths[i];let end=start;
    while(lengths[i+1]===end+1)end=lengths[++i];
    ranges.push(start===end ? String(start) : `${start}–${end}`);
  }
  return ` ${regionNames.of(country)}: ${ranges.join(', ')} цифр після коду країни.`;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const validText = (value, max, min = 0) => typeof value === 'string' && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000e-\u001f]/.test(value);
const keys = (value, allowed) => Object.keys(value).every(key => allowed.includes(key));
export const isChoice = type => type === 'checkbox' || type === 'radio';

export function createFormField(type = 'text', variable = 'field_1', {zero=false}={}) {
  return { id: crypto.randomUUID(), variable, label: type === 'tel' ? 'Телефон' : type === 'email' ? 'Email' : 'Нове поле', type, required: false, placeholder: '',
    ...(isChoice(type) ? { options: (zero&&type==='checkbox'?[1]:[1,2]).map(index => ({ id: crypto.randomUUID(), label: zero&&type==='checkbox'?'Так':`Варіант ${index}` })) } : {}),
    ...(zero&&type==='checkbox'?{choiceMode:'single',checkboxLabel:richTextFromPlain('Я погоджуюся'),label:''}:{}),
    ...(zero&&type==='textarea'?{rows:3}:{}),
    ...(type === 'tel' ? { phone: { mode: 'country', country: 'UA' } } : {}) };
}

export function createFormContent(formId = crypto.randomUUID(),{legacy=false}={}) {
  if(!legacy)return {formId,design:{version:1,base:{}},fields:[{...createFormField('email','email',{zero:true}),placeholder:'mail@example.com'},{...createFormField('text','name',{zero:true}),label:'Ім’я',placeholder:'Іван Іваненко',validation:'name'}],submitText:'Надіслати'};
  const name = { ...createFormField('text','name'), label: 'Ім’я', required: true };
  const phone = { ...createFormField('tel','phone'), label: 'Телефон', required: true };
  return { formId, fields: [name,phone], submitText: 'Надіслати' };
}

/** Editable validation also drives the dialog; untrusted input is checked before use. */
export function formConfigurationErrors(content) {
  const errors = [];
  const add = (path, message, fieldId) => errors.push({ path, message, fieldId });
  if (!plain(content) || !keys(content,['formId','fields','submitText','appearance','design','behavior','flow']) || !uuid.test(content.formId || '')) { add('form','Некоректна форма'); return errors; }
  try { validateFormAppearance(content.appearance); } catch { add('appearance','Некоректні стилі форми'); }
  try { validateZeroDesign(content.design);validateZeroBehavior(content.behavior);validateFormFlow(content); }  catch(failure) { add('design',failure.message); }
  if (!validText(content.submitText,200,1) || !content.submitText.trim()) add('submitText','Вкажіть текст кнопки (до 200 символів)');
  if (!Array.isArray(content.fields) || content.fields.length < 1 || content.fields.length > 20) { add('fields','Додайте від 1 до 20 полів'); return errors; }
  const ids = new Set(), variables = new Map();
  for (const field of content.fields) {
    if (!plain(field) || !keys(field,['id','variable','label','type','required','placeholder','options','phone','appearance','helpText',...FIELD_EXTRA_KEYS]) || !uuid.test(field.id || '') || ids.has(field.id) || !FORM_FIELD_TYPES.includes(field.type) || typeof field.required !== 'boolean') { add('field','Некоректне поле',field?.id); continue; }
    try { validateFormAppearance(field.appearance,true); } catch { add('appearance','Некоректні стилі поля',field.id); }
    if(field.helpText!==undefined&&!validText(field.helpText,500))add('helpText','Підказка — до 500 символів',field.id);
    ids.add(field.id);
    const variable=fieldVariable(field);
    if (typeof field.variable !== 'string' || !(isZeroForm(content)&&field.variable===''||/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(field.variable)) || ['__proto__','constructor','prototype'].includes(variable)) add('variable','Латинські літери, цифри й _. Почніть з літери або _; до 64 символів.',field.id);
    else if (variables.has(variable)) { add('variable','Назва змінної має бути унікальною у формі',field.id); add('variable','Назва змінної має бути унікальною у формі',variables.get(variable)); }
    variables.set(variable,field.id);
    if (!validText(field.label,200,isZeroForm(content)?0:1) || !isZeroForm(content)&&!field.label.trim()) add('label','Вкажіть підпис поля (до 200 символів)',field.id);
    if (!validText(field.placeholder,200)) add('placeholder','Підказка в полі — до 200 символів',field.id);
    if (isChoice(field.type)) {
      if (!Array.isArray(field.options) || !field.options.length || field.options.length > 20) add('options','Додайте від 1 до 20 варіантів',field.id);
      else { const optionIds = new Set(), labels = new Set(); for (const option of field.options) {
        if (!plain(option) || !keys(option,['id','label']) || !uuid.test(option.id || '') || optionIds.has(option.id) || !validText(option.label,200,1) || !option.label.trim() || labels.has(option.label.trim())) add('options','Варіанти мають мати різні непорожні підписи (до 200 символів)',field.id);
        optionIds.add(option?.id); labels.add(typeof option?.label === 'string' ? option.label.trim() : '');
      } }
    } else if (field.options !== undefined) add('options','Варіанти доступні лише для чекбоксів і радіокнопок',field.id);
    if (field.type === 'tel') {
      if (!plain(field.phone) || !keys(field.phone,['mode','country']) || !['none','country','custom'].includes(field.phone.mode) || !countryIds.has(field.phone.country)) add('phone','Оберіть режим телефону й країну',field.id);
    } else if (field.phone !== undefined) add('phone','Маска доступна лише для телефону',field.id);
  }
  return [...errors,...zeroFieldErrors(content),...(!errors.some(e=>e.path==='design')?formFlowErrors(content):[])];
}

export function validateFormContent(content) {
  const errors = formConfigurationErrors(content).filter(error=>!error.semantic); if (errors.length) throw new Error(errors[0].message); return content;
}

export function documentFormFields(document, formId) {
  const form = document.elements.find(item => item.type === 'form' && item.content.formId === formId);
  if (form) return form.content.fields.map(field=>({...field,variable:fieldVariable(field)}));
  return document.elements.filter(item => item.type === 'field' && item.content.formId === formId).map(item => ({ id:item.id, variable:item.id, label:item.content.label || 'Поле форми', type:item.content.fieldType, required:item.content.required, placeholder:item.content.placeholder, legacy:true }));
}

/** Stored values use the owner's variables and published choice labels. phoneCountries is transient UI state, never a submission payload. */
export function validateFormValues(fields, input, options = {}) {
  const zero=options.zero===true||fields.some(field=>FIELD_EXTRA_KEYS.some(key=>field[key]!==undefined));
  if (!plain(input) || !zero&&Object.keys(input).length !== fields.length || !Object.keys(input).every(key => fields.some(field => fieldVariable(field) === key))) throw new Error('Некоректні поля заявки');
  const values = {},active=zero&&!options.skipVisibility?visibleFormFields(fields,input):fields;
  const fail=(kind,fallback)=>{throw new Error(options.messages?.[kind]?.trim()||fallback);};
  for (const field of active) {
    const variable=fieldVariable(field),raw=input[variable]??(zero?defaultFieldValue(field):undefined),title=zeroFieldTitle(field);
    if (isChoice(field.type)) {
      const selected = field.type === 'checkbox' ? raw : raw === '' ? [] : [raw];
      const customAllowed=!!field.customAnswer?.enabled&&!singleCheckbox(field),custom=Array.isArray(selected)?selected.filter(item=>plain(item)):[];
      if (!Array.isArray(selected) || selected.length > (field.options?.length || 0)+(customAllowed?1:0) || new Set(selected.filter(item=>typeof item==='string')).size!==selected.filter(item=>typeof item==='string').length || custom.length>1 || selected.some(id=>typeof id==='string'?!field.options.some(option=>option.id===id):!customAllowed||!plain(id)||!keys(id,['custom'])||!validText(id.custom,500,1)||!id.custom.trim())) throw new Error(`Некоректний вибір: ${title}`);
      if (field.required && !selected.length) fail('required',`Оберіть відповідь: ${title}`);
      const labels = [...field.options.filter(option => selected.includes(option.id)).map(option => option.label),...custom.map(item=>item.custom.trim())];
      values[variable] = field.type === 'checkbox' ? labels : labels[0] || ''; continue;
    }
    const max = { text:500, email:254, tel:40, number:100, textarea:2000 }[field.type];
    if (!validText(raw,max)) throw new Error(`Некоректне поле: ${title}`);
    const value = raw.trim();
    const rule=field.type==='text'?field.validation:field.type;
    if (field.required && !value) fail('required',`Заповніть поле: ${title}`);
    if (value && rule === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('email',`Некоректна адреса: ${title}`);
    if (value && rule === 'number' && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value)))) throw new Error(`Вкажіть число: ${title}`);
    if(value&&rule==='name'&&!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’ʼ-]*$/u.test(value))fail('name',`Вкажіть ім’я: ${title}`);
    if(value&&rule==='website'){let valid=false;try{const url=new URL(/^[a-z]+:/i.test(value)?value:`https://${value}`);valid=['http:','https:'].includes(url.protocol)&&url.hostname.includes('.');}catch{}if(!valid)throw new Error(`Вкажіть адресу сайту: ${title}`);}
    if(value&&rule==='phone'&&(!/^[+0-9() .-]+$/.test(value)||!/[0-9]/.test(value)))fail('phone',`Некоректний телефон: ${title}`);
    if(value&&field.mask&&!completeMask(value,field.mask))fail(field.type==='tel'||rule==='phone'?'phone':'mask',`Заповніть поле за маскою: ${title}`);
    if(value&&field.type==='tel'&&field.phone.mode==='custom'){
      if(!/^[+0-9() .-]+$/.test(value)||!/[0-9]/.test(value))fail('phone',`Некоректний телефон: ${title}`);values[variable]=value;
    }else if(value&&field.type==='tel'){try{values[variable]=validatePhoneValue(value,field,options.phoneCountries?.[variable]);}catch(failure){fail('phone',failure.message);}}
    else values[variable]=value;
  }
  return values;
}

function validatePhoneValue(value, field, selectedCountry) {
  const title=field.label || 'Поле форми',country=field.phone?.country || 'UA',masked=field.phone?.mode === 'country';
  if (!/^\+?[0-9() .-]+$/.test(value) || (masked && !value.startsWith('+'))) throw new Error(`Некоректний формат телефону: ${title}`);
  const parsed=parsePhoneNumberFromString(value,{defaultCountry:country,extract:false});
  // A shared calling code does not make the selector's countries interchangeable (e.g. BQ/CW).
  // The server has no transient selector state and independently derives the visitor's country.
  const chosen=masked && countryIds.has(selectedCountry) && parsed?.countryCallingCode===getCountryCallingCode(selectedCountry) ? selectedCountry : value.startsWith('+') ? parsed?.country || country : country;
  const length=parsed && phoneLengths.has(chosen) ? phoneLengthError(chosen,parsed.nationalNumber) : validatePhoneNumberLength(value,country);
  const hint=phoneLengthHint(chosen,parsed?.nationalNumber||'');
  if (length === 'TOO_SHORT') throw new Error(`Номер телефону закороткий: ${title}.${hint}`);
  if (length === 'TOO_LONG') throw new Error(`Номер телефону задовгий: ${title}.${hint}`);
  if (length === 'INVALID_LENGTH') throw new Error(`Некоректна довжина телефону: ${title}.${hint}`);
  const matchesCountry=parsed&&(!phoneLengths.has(chosen)||phoneMaskLengths(chosen,parsed.nationalNumber,false).includes(parsed.nationalNumber.length));
  if (!parsed?.isValid() || !matchesCountry || (masked && (!countryIds.has(parsed.country) || !/^\+[1-9]\d{1,14}$/.test(parsed.number)))) throw new Error(`Некоректний телефон: ${title}`);
  return masked ? parsed.number : value;
}

export function formatPhoneInput(value, country = 'UA') {
  const raw=String(value).trim();
  // Keep malformed input visible so validation can reject it, rather than repairing it into another number.
  if (!/^\+?[0-9()\s.-]*$/.test(raw)) return {country,text:raw,number:raw};
  const clean=raw.replace(/[^+0-9]/g,''),explicit=clean.startsWith('+'),callingCode=getCountryCallingCode(country),trunk=phonePrefixes.get(country);
  let formatter;
  if(explicit||(!phoneMaskLengths(country,clean,false).length&&((trunk&&clean.startsWith(trunk))||clean.startsWith(callingCode)))){
    formatter=new AsYouType(country);
    // An incomplete IDD can leave the library without a numbering plan. It must not break an editable value.
    try{formatter.input(clean);}catch{formatter=undefined;}
  }
  const detected=formatter?.getCountry();
  if (explicit && !countryIds.has(detected)) return {country,text:raw,number:clean};
  const selected=explicit?detected:country;
  let national=explicit?formatter.getNationalNumber():clean;
  const ownCode=clean.startsWith(callingCode)&&formatter?.getCallingCode()===callingCode;
  if(!explicit&&formatter&&(!formatter.isInternational()||ownCode)){
    const parsed=formatter.getNationalNumber();
    // Normalize a real trunk prefix/validated domestic transform, never an injected local area code.
    const suffix=parsed.length<clean.length&&clean.endsWith(parsed)&&(!parsed||phoneMaskLengths(country,parsed,false).length);
    const transformed=trunk&&clean.startsWith(trunk)&&parsed.length<clean.length&&formatter.getNumber()?.isValid();
    if(suffix||transformed)national=parsed;
  }
  const number=clean?`+${getCountryCallingCode(selected)}${national}`:'';
  if (!national) return {country:selected,text:raw,number};
  const prefix=`+${getCountryCallingCode(selected)}`,international=new AsYouType().input(number);
  const uaLocal=selected==='UA'&&phoneMaskLengths(selected,national).at(-1)<=9;
  let parts=uaLocal?groupPhoneDigits(national,[2,3,2,2]):international.slice(prefix.length).trim().split(/[ ()-]+/).filter(Boolean);
  const groups=uaLocal?[2,3,2,2]:defaultPhoneGroups(selected),fallback=parts.length===1;
  if(fallback)parts=groupPhoneDigits(national,groups);
  const complete=parts.length>1||parts[0].length===groups[0];
  return {country:selected,text:`(${parts[0]}${complete ? ')' : ''}${parts.length > 1 ? `-${parts.slice(1).join('-')}` : ''}`,number};
}

/** Candidate state for the input guard; validation remains strict and never truncates a contact. */
export function phoneInputState(value, country = 'UA', mode = 'country') {
  const raw=String(value).trim();
  if (!/^\+?[0-9()\s.-]*$/.test(raw)) return null;
  const formatted=formatPhoneInput(raw,country),masked=mode==='country';
  if (formatted.text.includes('+') || (!masked && getCountryCallingCode(formatted.country)!==getCountryCallingCode(country))) return null;
  const selected=masked ? formatted.country : country,digits=raw.replace(/\D/g,''),national=formatted.number.slice(1+getCountryCallingCode(selected).length);
  const maxDigits=phoneMaskLengths(selected,national).at(-1);
  if (!digits) return {country:selected,text:'',number:'',digits:0,maxDigits};
  const text=masked ? formatted.text : raw.startsWith('+') ? formatted.text.replace(/\D/g,'') : digits;
  return {country:selected,text,number:masked ? formatted.number : text,digits:national.length,maxDigits};
}

export function formMinimumSize(content, width = 320, fontSize = 16, device = 'desktop') {
  // SSR/gallery fallback. The editor and public browser use measureFormContent's actual DOM.
  if(isZeroForm(content)){
    const v=zeroFormValues(content,device),text=(value,size,w)=>Math.max(1,Math.ceil(String(value||'').length*size*.6/Math.max(20,w)))*size*1.2;
    const buttonMin=Math.max(v.buttonWidth,text(content.submitText,v.buttonFontSize,Infinity)+40),available=Math.max(width,buttonMin);
    const heights=visibleFormFields(content.fields).map(field=>(field.label?text(field.label,v.labelFontSize,available)+v.labelGap:0)+(field.helpText?text(field.helpText,v.labelFontSize*.875,available)+10:0)+(choiceField(field)?(singleCheckbox(field)?1:(field.options?.length||1))*Math.max(v.indicatorSize,v.choiceFontSize*1.55):field.type==='textarea'?Math.max(v.inputHeight,(field.rows||3)*v.inputFontSize*1.5+24+2*v.inputBorderWidth):v.inputHeight)+v.fieldGap);
    return {width:Math.ceil(buttonMin),height:Math.ceil(v.orientation==='horizontal'&&available>buttonMin+content.fields.length*100?Math.max(v.buttonHeight,...heights):heights.reduce((a,b)=>a+b,0)+v.buttonHeight+v.buttonGap)};
  }

  if(content.appearance||content.fields?.some(field=>field.appearance||field.helpText))return styledFormMinimumSize(content,width,fontSize,device);
  const line = fontSize * 1.4, input = fontSize * 2.75, gap = fontSize;
  const textHeight = text => String(text).split(/\r?\n/).reduce((sum,part)=>sum+Math.max(1,Math.ceil([...part].length * fontSize * .7 / Math.max(80,width-40))),0) * line;
  let height = 8 + Math.max(input,textHeight(content.submitText)+fontSize*1.2);
  for (const field of content.fields || []) height += gap + textHeight(field.label) * .875 + 6 + (isChoice(field.type) ? field.options.reduce((sum,option)=>sum+Math.max(line,textHeight(option.label))+8,0) : field.type === 'textarea' ? input * 2 : input);
  return { width: Math.ceil(240 * fontSize / 16), height: Math.ceil(height) };
}
