import {POPUP_STYLE_LAYERS,activeStyleLayers} from './responsive.mjs';
/** Typed, sparse merchant styles. No user-provided CSS, selectors or URLs. */
import { zeroFormMediaIds } from './zero-form.mjs';
export const FORM_STYLE_STATES = {normal:'Звичайний',hover:'Наведення',focus:'Фокус',filled:'Заповнений',error:'Помилка',selected:'Вибраний',disabled:'Недоступний',readonly:'Лише читання',active:'Натиснутий',pending:'Надсилання',success:'Успіх'};
export const FORM_STYLE_PARTS = {form:'Форма',field:'Компонування поля',input:'Поле введення',label:'Підпис поля',required:'Позначка обов’язковості',placeholder:'Placeholder',help:'Підказка під полем',icon:'Іконка поля',textarea:'Багаторядкове поле',number:'Числове поле',phone:'Телефон: рамка',phoneTrigger:'Телефон: країна та код',phoneMenu:'Телефон: список країн',phoneSearch:'Телефон: пошук',phoneOption:'Телефон: країна у списку',phoneEmpty:'Телефон: немає результатів',choice:'Варіант відповіді',indicator:'Чекбокс / радіокнопка',choiceText:'Текст варіанта',submit:'Кнопка надсилання',error:'Помилка поля',status:'Повідомлення / надсилання',success:'Успішне надсилання'};
export const FIELD_STYLE_PARTS = Object.keys(FORM_STYLE_PARTS).filter(key=>!['form','submit','status','success'].includes(key));
export const FORM_FONT_FAMILIES = ['inherit','Arial','Segoe UI','Verdana','Tahoma','Georgia','Times New Roman','Courier New'];
export const FORM_ICON_NAMES = ['none','user','phone','mail','check','arrow','lock','info','warning','search','custom'];
const all=Object.keys(FORM_STYLE_PARTS), box=all.filter(part=>!['placeholder','indicator'].includes(part));
const properties=[];
const add=(key,label,kind,group,parts=all,extra={})=>properties.push({key,label,kind,group,parts,...extra});
const n=(key,label,min=0,max=200,group='Розміри',parts=box,step=1)=>add(key,label,'number',group,parts,{min,max,step});
const e=(key,label,options,group='Компонування',parts=all)=>add(key,label,'select',group,parts,{options});
const c=(key,label,group='Кольори',parts=all)=>add(key,label,'color',group,parts);
const b=(key,label,group,parts)=>add(key,label,'boolean',group,parts);
const t=(key,label,max,group,parts)=>add(key,label,'text',group,parts,{max});
const r=(key,label,group,parts)=>add(key,label,'resource',group,parts);
c('background','Колір фону','Фон',box);e('backgroundMode','Тип фону',[['solid','Суцільний / прозорий'],['gradient','Градієнт'],['image','Зображення']],'Фон',['form','submit']);
c('gradientColor','Другий колір градієнта','Фон',['form','submit']);n('gradientAngle','Напрям градієнта',0,360,'Фон',['form','submit']);
r('backgroundResourceId','Зображення фону','Фон',['form']);e('backgroundFit','Вписування фону',[['cover','Заповнити'],['contain','Повністю'],['auto','Оригінальний розмір']],'Фон',['form']);
e('backgroundPosition','Положення фону',[['center','Центр'],['top','Вгорі'],['bottom','Внизу'],['left','Ліворуч'],['right','Праворуч']],'Фон',['form']);n('backgroundOpacity','Непрозорість фону, %',0,100,'Фон',['form']);
c('color','Колір тексту');e('fontFamily','Шрифт',FORM_FONT_FAMILIES.map(value=>[value,value==='inherit'?'Успадкувати шрифт':value]),'Типографіка');
n('fontSize','Розмір шрифту',0,120,'Типографіка',all);e('fontWeight','Насиченість',[['inherit','Успадкувати'],...['100','200','300','400','500','600','700','800','900'].map(value=>[value,value])],'Типографіка');
e('fontStyle','Накреслення',[['normal','Звичайне'],['italic','Курсив']],'Типографіка');n('lineHeight','Міжрядковий інтервал',0,4,'Типографіка',all,.05);n('letterSpacing','Міжлітерний інтервал',-5,20,'Типографіка',all,.1);
e('textAlign','Вирівнювання тексту',[['left','Ліворуч'],['center','По центру'],['right','Праворуч']],'Типографіка');e('textTransform','Регістр',[['none','Як введено'],['uppercase','ВЕЛИКІ ЛІТЕРИ'],['lowercase','малі літери'],['capitalize','Початок Слів']],'Типографіка');e('textDecoration','Оформлення тексту',[['none','Без лінії'],['underline','Підкреслення'],['line-through','Перекреслення']],'Типографіка');
for(const [key,label] of [['width','Ширина (0 — авто)'],['height','Висота (0 — авто)'],['minHeight','Мінімальна висота'],['maxHeight','Максимальна висота (0 — без межі)'],['maxWidth','Максимальна ширина (0 — без межі)']])n(key,label,0,3000);
for(const [side,label] of [['Top','Зверху'],['Right','Праворуч'],['Bottom','Знизу'],['Left','Ліворуч']]){n('padding'+side,label,0,200,'Внутрішні відступи');n('border'+side+'Width',label,0,20,'Товщина рамки',all);c('border'+side+'Color',label,'Колір рамки');}
for(const [side,label]of [['Top','Зверху'],['Right','Праворуч'],['Bottom','Знизу'],['Left','Ліворуч']])e('border'+side+'Style',label,[['solid','Суцільна'],['dashed','Штрихова'],['dotted','Пунктирна'],['none','Без лінії']],'Лінія сторін');
e('borderStyle','Лінія рамки',[['solid','Суцільна'],['dashed','Штрихова'],['dotted','Пунктирна'],['none','Без рамки']],'Рамка');
for(const [key,label] of [['radiusTopLeft','Верхній лівий'],['radiusTopRight','Верхній правий'],['radiusBottomRight','Нижній правий'],['radiusBottomLeft','Нижній лівий']])n(key,label,0,999,'Кути',all);
for(const [prefix,title] of [['shadow','Зовнішня тінь'],['innerShadow','Внутрішня тінь']]){b(prefix+'Enabled','Увімкнути тінь',title,box);n(prefix+'X','Зміщення X',-200,200,title);n(prefix+'Y','Зміщення Y',-200,200,title);n(prefix+'Blur','Розмиття',0,200,title);n(prefix+'Spread','Розширення',-100,100,title);c(prefix+'Color','Колір тіні',title,box);}
e('layout','Компонування',[['grid','Колонки'],['row','В один ряд']],'Компонування',['form']);n('columns','Кількість колонок',1,4,'Компонування',['form']);n('rowGap','Відступ між рядками',0,160,'Компонування',['form']);n('columnGap','Відступ між колонками',0,160,'Компонування',['form']);
e('align','Вирівнювання блока',[['stretch','На всю ширину'],['start','Ліворуч'],['center','По центру'],['end','Праворуч']],'Компонування',['form','field','submit']);
n('span','Ширина у сітці (0 — успадкувати, 12 — повна)',0,12,'Компонування',['field']);n('marginTop','Відступ зверху',0,200,'Компонування',box);n('marginBottom','Відступ знизу',0,200,'Компонування',box);
e('labelPosition','Розташування підпису',[['top','Над полем'],['left','Ліворуч'],['floating','Плаваючий'],['hidden','Візуально прихований']],'Підпис',['field']);n('labelWidth','Ширина підпису ліворуч',40,400,'Підпис',['field']);n('labelGap','Відступ між підписом і полем',0,80,'Підпис',['field']);
t('markerText','Позначка обов’язковості',40,'Позначка',['required']);e('markerPosition','Положення позначки',[['after','Після підпису'],['before','Перед підписом'],['hidden','Приховати позначку']],'Позначка',['required']);n('markerGap','Відступ позначки',0,40,'Позначка',['required']);
e('controlVariant','Оформлення поля',[['outline','Повна рамка'],['filled','Із заливкою'],['underline','Нижня лінія']],'Поле',['input','phone']);c('caretColor','Колір курсора','Поле',['input']);c('selectionColor','Колір виділеного тексту','Поле',['input']);c('selectionBackground','Фон виділеного тексту','Поле',['input']);
e('icon','Іконка',FORM_ICON_NAMES.map(value=>[value,({none:'Без іконки',user:'Користувач',phone:'Телефон',mail:'Конверт',check:'Галочка',arrow:'Стрілка',lock:'Замок',info:'Інформація',warning:'Попередження',search:'Пошук',custom:'Власне зображення'})[value]]),'Іконка',['icon','help','submit','error','status','success']);
r('iconResourceId','Власна іконка','Іконка',['icon','help','submit','error','status','success']);n('iconSize','Розмір іконки',8,80,'Іконка',['icon','help','submit','error','status','success']);n('iconGap','Відступ до іконки',0,80,'Іконка',['icon','help','submit','error','status','success']);e('iconPosition','Положення іконки',[['before','Перед текстом'],['after','Після тексту']],'Іконка',['icon','help','submit','error','status','success']);
n('rows','Видимі рядки',1,30,'Багаторядкове поле',['textarea']);b('autoGrow','Автоматична висота','Багаторядкове поле',['textarea']);e('resize','Зміна розміру',[['vertical','Лише висота'],['horizontal','Лише ширина'],['both','Висота й ширина'],['none','Заборонена']],'Багаторядкове поле',['textarea']);
b('showSteppers','Показувати стрілки числа','Числове поле',['number']);t('prefix','Префікс',40,'Числове поле',['number']);t('suffix','Суфікс',40,'Числове поле',['number']);
e('phoneBorder','Рамка телефону',[['joined','Спільна'],['separate','Окремі блоки']],'Телефон',['phone']);b('showFlag','Показувати прапорець','Телефон',['phoneTrigger']);b('showCode','Показувати код','Телефон',['phoneTrigger']);b('showCountryName','Показувати назву країни','Телефон',['phoneTrigger']);n('flagWidth','Ширина прапорця',8,48,'Телефон',['phoneTrigger']);n('flagHeight','Висота прапорця',6,36,'Телефон',['phoneTrigger']);e('disclosure','Іконка розкриття',[['chevron','Стрілка'],['plus','Плюс'],['none','Без іконки']],'Телефон',['phoneTrigger']);
e('choiceLayout','Розташування варіантів',[['column','Вертикально'],['row','Горизонтально'],['grid','Сітка']],'Варіанти',['field']);n('choiceColumns','Колонки варіантів',1,4,'Варіанти',['field']);n('choiceGap','Проміжок варіантів',0,80,'Варіанти',['field']);e('choiceVariant','Вигляд варіанта',[['list','Список'],['cards','Картки'],['pills','Плашки']],'Варіанти',['choice']);e('choiceAlign','Вирівнювання індикатора',[['start','Зверху'],['center','По центру']],'Варіанти',['choice']);n('indicatorSize','Розмір індикатора',10,48,'Індикатор',['indicator']);c('accentColor','Колір галочки / крапки','Індикатор',['indicator']);n('indicatorGap','Відступ до тексту',0,80,'Індикатор',['indicator']);
n('transitionDuration','Тривалість переходу, мс',0,1500,'Рух',all);e('transitionEasing','Плавність',[['ease','Плавно'],['linear','Лінійно'],['ease-in','Прискорення'],['ease-out','Сповільнення'],['ease-in-out','Прискорення й сповільнення']],'Рух');n('translateY','Вертикальне зміщення',-20,20,'Рух',box);n('scale','Масштаб',.8,1.2,'Рух',box,.01);b('motion','Декоративчний рух','Рух',['form']);b('showSpinner','Індикатор надсилання','Рух',['submit']);
n('focusWidth','Товщина focus-рамки',1,8,'Фокус',all);n('focusOffset','Відступ focus-рамки',0,12,'Фокус',all);c('focusColor','Колір focus-рамки','Фокус');
n('scrollbarSize','Ширина смуги прокручування',4,20,'Прокручування',['form','textarea','phoneMenu']);c('scrollbarColor','Колір смуги прокручування','Прокручування',['form','textarea','phoneMenu']);
export const FORM_STYLE_PROPERTIES = properties;
export const FORM_STYLE_PROPERTY_MAP = Object.fromEntries(properties.map(item=>[item.key,item]));
export const FORM_NORMAL_ONLY_PROPERTIES=['layout','columns','rowGap','columnGap','span','labelPosition','labelWidth','labelGap','choiceLayout','choiceColumns','choiceGap','rows','autoGrow','resize','showSteppers','phoneBorder','motion'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,hex=/^#[\da-f]{6}(?:[\da-f]{2})?$/i;
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
export function validateFormAppearance(value,field=false) {
  if(value===undefined)return;
  const fail=()=>{throw new Error('Некоректний стиль форми');};
  if(!plain(value)||value.version!==1||Object.keys(value).some(key=>!['version',...POPUP_STYLE_LAYERS,...(!field?['types']:[])].includes(key))||new TextEncoder().encode(JSON.stringify(value)).length>65536)fail();
  const layer=(data,fieldLayer)=>{if(data===undefined)return;if(!plain(data))fail();for(const [part,states]of Object.entries(data)){if(!Object.hasOwn(FORM_STYLE_PARTS,part)||(fieldLayer&&!FIELD_STYLE_PARTS.includes(part))||!plain(states))fail();for(const [state,values]of Object.entries(states)){if(!Object.hasOwn(FORM_STYLE_STATES,state)||!plain(values))fail();for(const [key,item]of Object.entries(values)){const rule=FORM_STYLE_PROPERTY_MAP[key];if(!Object.hasOwn(FORM_STYLE_PROPERTY_MAP,key)||!rule.parts.includes(part)||(state!=='normal'&&FORM_NORMAL_ONLY_PROPERTIES.includes(key)))fail();if(rule.kind==='number'&&(!Number.isFinite(item)||item<rule.min||item>rule.max||(['columns','span','rows','choiceColumns'].includes(key)&&!Number.isInteger(item))))fail();if(rule.kind==='color'&&(typeof item!=='string'||!hex.test(item)))fail();if(rule.kind==='select'&&!rule.options.some(([value])=>value===item))fail();if(rule.kind==='boolean'&&typeof item!=='boolean')fail();if(rule.kind==='resource'&&(typeof item!=='string'||(item!==''&&!uuid.test(item))))fail();if(rule.kind==='text'&&(typeof item!=='string'||item.length>rule.max||/[\u0000-\u001f]/.test(item)))fail();}}}};
  for(const key of POPUP_STYLE_LAYERS)layer(value[key],field);
  if(value.types!==undefined){if(!plain(value.types))fail();for(const [type,style]of Object.entries(value.types)){if(!['text','tel','email','number','checkbox','radio','textarea'].includes(type)||!plain(style)||Object.keys(style).some(key=>!POPUP_STYLE_LAYERS.includes(key)))fail();for(const key of POPUP_STYLE_LAYERS)layer(style[key],true);}}
  return value;
}
export function resolveFormAppearance(content,field,device='desktop') {
  const out={};const merge=layer=>{for(const [part,states]of Object.entries(layer||{}))for(const [state,values]of Object.entries(states)){out[part]||={};out[part][state]={...out[part][state],...values};}};
  for(const key of activeStyleLayers(device))merge(content.appearance?.[key]);
  if(field){for(const key of activeStyleLayers(device))merge(content.appearance?.types?.[field.type]?.[key]);for(const key of activeStyleLayers(device))merge(field.appearance?.[key]);}
  return out;
}
export function formPartStyle(content,field,part,device='desktop',state='normal') {const styles=resolveFormAppearance(content,field,device)[part]||{};return {...styles.normal,...(state==='normal'?{}:styles[state])};}
export function appearanceMediaIds(appearance) {const ids=new Set();const layer=data=>{for(const states of Object.values(data||{}))for(const values of Object.values(states))for(const key of ['backgroundResourceId','iconResourceId'])if(values[key])ids.add(values[key]);};for(const key of POPUP_STYLE_LAYERS)layer(appearance?.[key]);for(const type of Object.values(appearance?.types||{}))for(const key of POPUP_STYLE_LAYERS)layer(type[key]);return [...ids];}
export function formStyleMediaIds(content) {return [...new Set([...(appearanceMediaIds(content.appearance)),...(content.fields||[]).flatMap(field=>appearanceMediaIds(field.appearance)),...zeroFormMediaIds(content)])];}
export const FORM_STYLE_PRESETS = {
  minimal:{name:'Мінімалістичний',base:{input:{normal:{background:'#FFFFFF00',borderTopWidth:0,borderRightWidth:0,borderLeftWidth:0,borderBottomWidth:1}},submit:{normal:{background:'#24221F',color:'#FFFFFF'}}}},
  outlined:{name:'Контурний',base:{input:{normal:{background:'#FFFFFF',borderTopWidth:1,borderRightWidth:1,borderBottomWidth:1,borderLeftWidth:1,borderStyle:'solid',borderTopColor:'#B8B2A8',borderRightColor:'#B8B2A8',borderBottomColor:'#B8B2A8',borderLeftColor:'#B8B2A8'}},phone:{normal:{background:'#FFFFFF'}}}},
  filled:{name:'Із заливкою',base:{input:{normal:{controlVariant:'filled',background:'#F1F2F4',paddingTop:14,paddingBottom:14}},phone:{normal:{background:'#F1F2F4'}}}},
  underline:{name:'Нижня лінія',base:{input:{normal:{controlVariant:'underline',background:'#FFFFFF00'}},phone:{normal:{controlVariant:'underline'}}}},
  rounded:{name:'Округлий',base:{input:{normal:{radiusTopLeft:999,radiusTopRight:999,radiusBottomLeft:999,radiusBottomRight:999,paddingLeft:20,paddingRight:20}},phone:{normal:{radiusTopLeft:999,radiusTopRight:999,radiusBottomLeft:999,radiusBottomRight:999}},submit:{normal:{radiusTopLeft:999,radiusTopRight:999,radiusBottomLeft:999,radiusBottomRight:999}}}},
  dark:{name:'Темний',base:{form:{normal:{background:'#24252A',color:'#FFFFFF',paddingTop:20,paddingRight:20,paddingBottom:20,paddingLeft:20}},input:{normal:{background:'#33343C',color:'#FFFFFF',borderTopColor:'#727480',borderRightColor:'#727480',borderBottomColor:'#727480',borderLeftColor:'#727480'}},phone:{normal:{background:'#33343C',color:'#FFFFFF'}},submit:{normal:{background:'#EADDBC',color:'#25231F'}},placeholder:{normal:{color:'#B9BAC4'}}}},
  contrast:{name:'Контрастний',base:{input:{normal:{background:'#FFFFFF',color:'#000000',borderTopWidth:2,borderRightWidth:2,borderBottomWidth:2,borderLeftWidth:2,borderTopColor:'#000000',borderRightColor:'#000000',borderBottomColor:'#000000',borderLeftColor:'#000000'},focus:{focusWidth:3,focusColor:'#005FCC'}},label:{normal:{color:'#000000',fontWeight:'700'}},submit:{normal:{background:'#000000',color:'#FFFFFF'}}}},
  cards:{name:'Картки відповідей',base:{choice:{normal:{choiceVariant:'cards',background:'#F4F3F1',paddingTop:12,paddingRight:12,paddingBottom:12,paddingLeft:12},selected:{background:'#EADDBC',borderTopWidth:1,borderRightWidth:1,borderBottomWidth:1,borderLeftWidth:1}},field:{normal:{choiceLayout:'grid',choiceColumns:2,choiceGap:8}}},mobile:{field:{normal:{choiceColumns:1}}}},
};
export function formStylePreset(key) {if(!Object.hasOwn(FORM_STYLE_PRESETS,key))throw new Error('Невідомий стиль');const preset=FORM_STYLE_PRESETS[key];return {version:1,base:structuredClone(preset.base),...(preset.mobile?{mobile:structuredClone(preset.mobile)}:{})};}

/** Conservative content minimum; browser layout remains scrollable for visitor input/errors. */
export function styledFormMinimumSize(content,width=320,fontSize=16,device='desktop') {
  const root=formPartStyle(content,null,'form',device),font=root.fontSize||fontSize,line=(root.lineHeight||1.4)*font;
  const sides=(style,prefix,defaultValue=0)=>['Top','Right','Bottom','Left'].map(side=>style[prefix+side+(prefix==='border'?'Width':'')]??defaultValue);
  const padding=sides(root,'padding',4),borders=sides(root,'border'),inner=Math.max(40,width-padding[1]-padding[3]-borders[1]-borders[3]);
  const row=root.layout==='row',columns=row?content.fields.length+1:root.columns||1,gap=root.rowGap??font,columnGap=root.columnGap??font;
  const textHeight=(text,size,available,ratio=1.4)=>String(text||'').split(/\r?\n/).reduce((sum,part)=>sum+Math.max(1,Math.ceil([...part].length*size*.7/Math.max(20,available))),0)*size*ratio;
  let rowSpan=0,rowHeight=0,height=0;
  for(const field of content.fields||[]){const get=part=>formPartStyle(content,field,part,device),layout=get('field'),input={...get('input'),...(field.type==='textarea'?get('textarea'):{} )},label=get('label'),help=get('help'),choice=get('choice');const span=row?12/columns:layout.span||12/columns;
    if(rowSpan+span>12.001){height+=rowHeight+gap;rowSpan=0;rowHeight=0;}
    const available=Math.max(40,inner*span/12-columnGap*(1-span/12)),inputFont=input.fontSize||font,labelFont=label.fontSize||font*.875,position=layout.labelPosition||'top';
    const controlWidth=Math.max(20,available-(position==='left'?(layout.labelWidth||120)+(layout.labelGap??6):0)),ip=sides(input,'padding',font*.6),ib=sides(input,'border',1);
    let control=Math.max(input.height||0,input.minHeight||font*2.75,inputFont*(input.lineHeight||1.4)+ip[0]+ip[2]+ib[0]+ib[2]);
    if(field.type==='textarea')control=Math.max(control,inputFont*(input.lineHeight||1.4)*(input.rows||3)+ip[0]+ip[2]+ib[0]+ib[2]);
    if(['checkbox','radio'].includes(field.type)){const count=layout.choiceLayout==='grid'?layout.choiceColumns||2:layout.choiceLayout==='row'?Math.max(1,Math.floor(controlWidth/100)):1;let choiceRow=0,total=0;for(let i=0;i<field.options.length;i++){choiceRow=Math.max(choiceRow,textHeight(field.options[i].label,choice.fontSize||font,controlWidth/count-32)+(choice.paddingTop||0)+(choice.paddingBottom||0)+8);if((i+1)%count===0||i===field.options.length-1){total+=choiceRow+(i?layout.choiceGap??8:0);choiceRow=0;}}control=total;}
    const labelHeight=['hidden','floating'].includes(position)?0:textHeight(field.label,labelFont,position==='left'?layout.labelWidth||120:available,label.lineHeight||1.4);
    let fieldHeight=(position==='left'?Math.max(control,labelHeight):control+labelHeight+(layout.labelGap??6))+(field.helpText?textHeight(field.helpText,help.fontSize||font*.8,controlWidth,help.lineHeight||1.4)+(help.marginTop??4):0)+(layout.marginTop||0)+(layout.marginBottom||0);
    const fp=sides(layout,'padding');fieldHeight+=fp[0]+fp[2];rowSpan+=span;rowHeight=Math.max(rowHeight,fieldHeight);
  }
  const submit=formPartStyle(content,null,'submit',device),sp=sides(submit,'padding',font*.6),buttonFont=submit.fontSize||font;
  const buttonHeight=Math.max(submit.height||0,submit.minHeight||font*2.75,textHeight(content.submitText,buttonFont,submit.width||(row?inner/columns:inner),submit.lineHeight||1.4)+sp[0]+sp[2])+(submit.marginTop||0)+(submit.marginBottom||0);
  height+=(row?Math.max(rowHeight,buttonHeight):rowHeight+gap+buttonHeight)+padding[0]+padding[2]+borders[0]+borders[2];
  return {width:Math.ceil(240*fontSize/16),height:Math.ceil(height+8+line*.1)};
}
