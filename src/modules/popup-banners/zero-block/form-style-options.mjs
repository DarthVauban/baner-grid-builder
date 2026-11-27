import {styleLayer,POPUP_STYLE_LAYERS} from './responsive.mjs';
import { FIELD_STYLE_PARTS, FORM_STYLE_PARTS, FORM_STYLE_PROPERTIES, resolveFormAppearance } from './form-appearance.mjs';

/** Apply only settings edited against the dialog's opening snapshot. */
function mergeEditedSetting(current,draft,original){
  if(JSON.stringify(draft)===JSON.stringify(original))return structuredClone(current);
  if(current&&draft&&original&&[current,draft,original].every(value=>typeof value==='object'&&!Array.isArray(value))){const next=structuredClone(current);for(const key of new Set([...Object.keys(original),...Object.keys(draft)])){const value=mergeEditedSetting(current[key],draft[key],original[key]);if(value===undefined)delete next[key];else next[key]=value;}return next;}
  return structuredClone(draft);
}
export function mergeFormConfiguration(current,draft,original){
  const next=structuredClone(draft);
  for(const key of ['design','behavior','submitText']){if(current[key]!==undefined)next[key]=structuredClone(current[key]);else delete next[key];}
  if(next.flow&&current.flow){next.flow.reward=structuredClone(current.flow.reward);for(const key of POPUP_STYLE_LAYERS){if(current.flow[key]!==undefined)next.flow[key]=structuredClone(current.flow[key]);else delete next.flow[key];}}
  if(current.appearance)next.appearance=structuredClone(current.appearance);else delete next.appearance;
  for(const field of next.fields){const prior=current.fields.find(item=>item.id===field.id);if(!prior)continue;if(prior.appearance)field.appearance=structuredClone(prior.appearance);else delete field.appearance;}
  if(original){
    for(const key of ['design','behavior','submitText','appearance']){const value=mergeEditedSetting(current[key],draft[key],original[key]);if(value===undefined)delete next[key];else next[key]=value;}
    if(next.flow&&draft.flow&&current.flow&&original.flow)for(const key of ['reward',...POPUP_STYLE_LAYERS]){const value=mergeEditedSetting(current.flow[key],draft.flow[key],original.flow[key]);if(value===undefined)delete next.flow[key];else next.flow[key]=value;}
    for(const field of next.fields){const prior=current.fields.find(item=>item.id===field.id),base=original.fields.find(item=>item.id===field.id),edited=draft.fields.find(item=>item.id===field.id);if(!prior||!base||!edited)continue;const value=mergeEditedSetting(prior.appearance,edited.appearance,base.appearance);if(value===undefined)delete field.appearance;else field.appearance=value;}
  }
  return next;
}

export function formStyleTypes(content){return [...new Set(content.fields.map(field=>field.type))];}
export function formStyleParts(content,fields=content.fields,global=true,device='desktop'){
  const input=fields.some(field=>!['checkbox','radio'].includes(field.type)),choices=fields.some(field=>['checkbox','radio'].includes(field.type));
  const country=fields.some(field=>field.type==='tel'&&field.phone?.mode==='country');
  const icon=fields.some(field=>Object.values(resolveFormAppearance(content,field,device).icon||{}).some(style=>style.icon&&style.icon!=='none'));
  const present={form:global,field:fields.length>0,input,label:fields.some(field=>field.label?.trim()),required:fields.some(field=>field.required),placeholder:fields.some(field=>!['checkbox','radio'].includes(field.type)&&field.placeholder?.trim()),help:fields.some(field=>field.helpText?.trim()),icon:input&&icon,textarea:fields.some(field=>field.type==='textarea'),number:fields.some(field=>field.type==='number'),phone:country,phoneTrigger:country,phoneMenu:country,phoneSearch:country,phoneOption:country,phoneEmpty:country,choice:choices,indicator:choices,choiceText:choices,submit:global,error:fields.length>0,status:global,success:global};
  return Object.keys(FORM_STYLE_PARTS).filter(part=>present[part]&&(global||FIELD_STYLE_PARTS.includes(part)));
}
export function formStylePartLabel(part,fields){
  const checkbox=fields.some(field=>field.type==='checkbox'),radio=fields.some(field=>field.type==='radio');
  if(part==='indicator')return checkbox&&radio?'Чекбокси та радіокнопки':checkbox?'Чекбокси':'Радіокнопки';
  return FORM_STYLE_PARTS[part];
}
export function formStylePropertyVisible(property,part,fields,effective={}){
  const key=property.key;
  if(key.startsWith('choice')&&!fields.some(field=>['checkbox','radio'].includes(field.type)))return false;
  if(key==='choiceColumns'&&effective.choiceLayout!=='grid')return false;
  if(key==='labelWidth'&&effective.labelPosition!=='left')return false;
  if(key.startsWith('gradient')&&effective.backgroundMode!=='gradient')return false;
  if(['backgroundResourceId','backgroundFit','backgroundPosition'].includes(key)&&effective.backgroundMode!=='image')return false;
  for(const prefix of ['shadow','innerShadow'])if(key.startsWith(prefix)&&key!==prefix+'Enabled'&&!effective[prefix+'Enabled'])return false;
  if(key==='iconResourceId'&&effective.icon!=='custom')return false;
  if(['iconResourceId','iconSize','iconGap','iconPosition'].includes(key)&&(!effective.icon||effective.icon==='none'))return false;
  if(['flagWidth','flagHeight'].includes(key)&&effective.showFlag===false)return false;
  if(key==='columns'&&effective.layout==='row')return false;
  return true;
}

const removedGroups=new Set(['Розміри','Лінія сторін','Рух','Прокручування','Поле']);
const contourGroups=new Set(['Рамка','Товщина рамки','Колір рамки','Кути']);
const typographyKeys=['fontFamily','fontStyle','fontWeight','color','lineHeight','letterSpacing'];
const typographyLabels={fontStyle:'Стиль шрифту',color:'Колір шрифту',letterSpacing:'Міжбуквений інтервал'};
/** Authoring categories only; the persisted v1 contract still accepts older settings. */
export function simpleFormStyleGroups(content,device='desktop',query=''){
  const resolved=resolveFormAppearance(content,undefined,device),groups=new Map();
  const parts=formStyleParts(content,content.fields,true,device),hasIcon=parts.includes('icon');
  // An input icon can be added before an icon exists in the form.
  if(parts.includes('input')&&!parts.includes('icon'))parts.splice(parts.indexOf('input')+1,0,'icon');
  for(const part of parts){
    const effective=resolved[part]?.normal||{};
    for(const property of FORM_STYLE_PROPERTIES){
      if(!property.parts.includes(part)||removedGroups.has(property.group))continue;
      if(part==='icon'&&!hasIcon&&property.group!=='Іконка')continue;
      if(!formStylePropertyVisible(property,part,content.fields,effective))continue;
      const typography=['Кольори','Типографіка'].includes(property.group);
      if(typography&&(!typographyKeys.includes(property.key)||!['form','input','placeholder'].includes(part)))continue;
      const group=typography?(part==='form'?'Типографіка':'Поле введення'):contourGroups.has(property.group)?'Контур форми':property.group;
      const label=group==='Поле введення'?(part==='placeholder'?'Плейсхолдер':'Текст поля'):formStylePartLabel(part,content.fields);
      const displayed=typography?{...property,label:typographyLabels[property.key]||property.label,options:property.options?.map(([value,label])=>[value,value==='inherit'?'За замовчуванням':property.key==='fontStyle'&&value==='normal'?'Звичайний':label])}:property;
      if(query&&!`${group} ${label} ${displayed.label}`.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')))continue;
      if(!groups.has(group))groups.set(group,new Map());
      const sections=groups.get(group);
      if(!sections.has(part))sections.set(part,{part,label,properties:[]});
      sections.get(part).properties.push(displayed);
    }
  }
  return [...groups].map(([name,sections])=>({name,sections:[...sections.values()].map(section=>['Типографіка','Поле введення'].includes(name)?{...section,properties:section.properties.sort((a,b)=>typographyKeys.indexOf(a.key)-typographyKeys.indexOf(b.key))}:section)}));
}

/** Uniform normal edits reconcile only the edited keys; other parts/states/devices survive. */
export function updateSimpleFormStyle(content,device,part,values){
  const next=structuredClone(content),layer=styleLayer(device);
  next.appearance||={version:1};next.appearance[layer]||={};next.appearance[layer][part]||={};next.appearance[layer][part].normal||={};
  const localStyles=[...Object.values(next.appearance.types||{}),...next.fields.map(field=>field.appearance).filter(Boolean)];
  for(const [key,value]of Object.entries(values)){
    const common=next.appearance[layer][part].normal;
    if(value===undefined)delete common[key];else common[key]=value;
    for(const appearance of localStyles){
      const patch=appearance[layer]?.[part]?.normal;
      if(device==='desktop'||value===undefined){if(patch)delete patch[key];}
      else if(appearance.base?.[part]?.normal?.[key]!==undefined||patch?.[key]!==undefined){
        appearance[layer]||={};appearance[layer][part]||={};appearance[layer][part].normal||={};appearance[layer][part].normal[key]=value;
      }
    }
  }
  return next;
}
