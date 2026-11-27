import {styleLayer,responsiveValues} from './responsive.mjs';
import {isPaint} from './paint.mjs';
import {safeSuccessUrl,RICH_FONTS} from './rich-text.mjs';
import {validatePromoContent} from './promo.mjs';

export const REWARD_TYPES=[['promo','Промокод'],['file','Файл'],['offer','Спеціальна пропозиція']];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000e-\u001f]/.test(v);
const keys=(v,list)=>Object.keys(v).every(key=>list.includes(key));
export const isFormFlow=content=>content?.flow?.version===1;
export const FLOW_PARTS={stepTitle:'Заголовок кроку',stepDescription:'Опис кроку',progress:'Прогрес',back:'Кнопка «Назад»',reward:'Поверхня результату',rewardTitle:'Заголовок результату',rewardDescription:'Опис результату',rewardAction:'Кнопка винагороди',fileName:'Назва файлу'};
const properties=[];
const add=(part,key,label,kind,value,extra={})=>properties.push({part,key:part+key,label,kind,default:value,...extra});
for(const part of Object.keys(FLOW_PARTS)){
  const button=['back','rewardAction'].includes(part),surface=part==='reward';
  if(!surface){
    add(part,'FontFamily','Шрифт','select','Segoe UI',{options:['Segoe UI',...RICH_FONTS.filter(v=>v!=='inherit')].map(v=>[v,v])});
    add(part,'FontSize','Розмір шрифту','number',part.includes('Title')?22:13,{min:8,max:120});
    add(part,'FontWeight','Насиченість','select',part.includes('Title')||button?'600':'400',{options:['300','400','500','600','700','800','900'].map(v=>[v,v])});
    add(part,'Color','Колір тексту','color',part==='rewardAction'?'#FFFFFF':part==='progress'||part.includes('Description')?'#6D6962':'#25231F');
    add(part,'LineHeight','Міжрядковий інтервал','number',1.4,{min:1,max:3,step:.05});
    add(part,'LetterSpacing','Міжлітерний інтервал','number',0,{min:-5,max:20,step:.1});
    add(part,'TextAlign','Вирівнювання тексту','select',button?'center':'left',{options:[['left','Ліворуч'],['center','По центру'],['right','Праворуч']]});
  }
  add(part,'Opacity','Непрозорість, %','number',100,{min:0,max:100});
  add(part,'MarginBottom','Відступ знизу','number',part==='progress'?16:part.includes('Title')?8:12,{min:0,max:200});
  if(button||surface){
    add(part,'Background','Фон','color',part==='rewardAction'?'#24221F':surface?'#F4F3F1':'#FFFFFF');
    add(part,'BorderColor','Колір контуру','color','#E7E4DF');
    add(part,'BorderWidth','Товщина контуру','number',part==='rewardAction'?0:1,{min:0,max:12});
    add(part,'Radius','Заокруглення','number',button?999:20,{min:0,max:999});
    add(part,'PaddingX','Горизонтальний відступ','number',surface?20:16,{min:0,max:100});
    add(part,'PaddingY','Вертикальний відступ','number',surface?20:10,{min:0,max:100});
    for(const [key,label,def,min,max] of [['ShadowX','Тінь: X',0,-100,100],['ShadowY','Тінь: Y',0,-100,100],['ShadowBlur','Тінь: розмиття',0,0,100],['ShadowSpread','Тінь: поширення',0,-100,100]])add(part,key,label,'number',def,{min,max});
    add(part,'ShadowColor','Колір тіні','color','#00000000');
    if(button){
      add(part,'Height','Мінімальна висота','number',40,{min:24,max:200});
      add(part,'Width','Ширина (0 — автоматична)','number',0,{min:0,max:3000});
      add(part,'HoverBackground','Фон при наведенні / фокусі','color',part==='rewardAction'?'#403C35':'#EADDBC');
      add(part,'HoverColor','Текст при наведенні / фокусі','color',part==='rewardAction'?'#FFFFFF':'#25231F');
      add(part,'HoverBorderColor','Контур при наведенні / фокусі','color','#826324');
      add(part,'FocusColor','Колір рамки фокусу','color','#826324');
    }
  }
}
for(const [key,label,kind,value,extra] of [
 ['ActiveColor','Активний колір','color','#826324',{}],['TrackColor','Неактивний колір','color','#E7E4DF',{}],
 ['Size','Висота смуги / діаметр крапки','number',6,{min:2,max:32}],['Gap','Проміжок крапок','number',8,{min:0,max:40}],
 ['Radius','Заокруглення індикатора','number',999,{min:0,max:999}],['CaptionGap','Проміжок до індикатора','number',8,{min:0,max:80}]
])add('progress',key,label,kind,value,extra);
export const FLOW_STYLE_PROPERTIES=properties;
export const FLOW_STYLE_DEFAULTS=Object.fromEntries(properties.map(p=>[p.key,p.default]));
export function flowStyleValues(content,device='desktop'){return {...FLOW_STYLE_DEFAULTS,...responsiveValues(content.flow,device)};}
export function updateFlowStyle(content,device,key,value){const next=structuredClone(content);const layer=styleLayer(device);next.flow[layer]||={};if(value===undefined)delete next.flow[layer][key];else next.flow[layer][key]=value;validateFormFlow(next);return next;}

export function newReward(type='promo'){
  return {type,title:'Дякуємо! Ваш подарунок готовий',description:'Скористайтеся своєю винагородою.',buttonText:type==='file'?'Завантажити файл':type==='offer'?'Переглянути пропозицію':'Скопіювати',...(type==='promo'?{promo:{value:'',label:'Ваш промокод',promo:{version:1,variant:'capsule',base:{}}}}:type==='offer'?{url:'',target:'same_tab'}:{fileId:'',fileName:''})};
}
export function enableFormFlow(content,enabled){const next=structuredClone(content);if(!enabled){delete next.flow;return next;}if(next.flow)return next;const split=Math.max(1,Math.ceil(next.fields.length/2));next.flow={version:1,steps:[{id:crypto.randomUUID(),title:'Знайомство',description:'',fieldIds:next.fields.slice(0,split).map(f=>f.id)},{id:crypto.randomUUID(),title:'Контакти',description:'',fieldIds:next.fields.slice(split).map(f=>f.id)}],nextText:'Далі',backText:'Назад',progress:'bar',reward:newReward(),base:{}};return next;}
/** Reconcile editor field additions/removal without silently repairing broken visibility rules. */
export function reconcileFormSteps(content){if(!isFormFlow(content))return content;const next=structuredClone(content),seen=new Set(),ids=new Set(next.fields.map(f=>f.id));for(const step of next.flow.steps)step.fieldIds=step.fieldIds.filter(id=>ids.has(id)&&!seen.has(id)&&(seen.add(id),true));next.flow.steps.at(-1).fieldIds.push(...next.fields.filter(f=>!seen.has(f.id)).map(f=>f.id));const order=next.flow.steps.flatMap(s=>s.fieldIds);next.fields.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));return next;}
export function validateFormFlow(content){
 const flow=content.flow;if(flow===undefined)return;
 const fail=message=>{throw new Error(message);};
 if(!object(flow)||!keys(flow,['version','steps','nextText','backText','progress','reward','base','mobile','laptop','tablet','mobileLandscape'])||flow.version!==1||!Array.isArray(flow.steps)||flow.steps.length<2||flow.steps.length>10)fail('Покрокова форма: від 2 до 10 кроків');
 if(content.design?.version!==1)fail('Покрокова форма потребує Zero Form');
 const ids=new Set();for(const step of flow.steps){if(!object(step)||!keys(step,['id','title','description','fieldIds'])||!uuid.test(step.id||'')||ids.has(step.id)||!text(step.title,200)||!text(step.description,1000)||!Array.isArray(step.fieldIds)||step.fieldIds.length>20||step.fieldIds.some(id=>!uuid.test(id)))fail('Некоректний крок форми');ids.add(step.id);}
 if(!text(flow.nextText,200)||!flow.nextText.trim()||!text(flow.backText,200)||!flow.backText.trim()||!['bar','dots','counter','none'].includes(flow.progress))fail('Перевірте навігацію форми');
 const reward=flow.reward;if(!object(reward)||!keys(reward,['type','title','description','buttonText','promo','fileId','fileName','url','target'])||!REWARD_TYPES.some(([v])=>v===reward.type)||!text(reward.title,200)||!text(reward.description,2000)||!text(reward.buttonText,200))fail('Некоректна винагорода');
 if(reward.type==='promo'){validatePromoContent(reward.promo);if(!reward.promo.promo)fail('Оберіть оформлення промокоду');}
 if(reward.type==='file'&&(!text(reward.fileId,36)||reward.fileId!==''&&!uuid.test(reward.fileId)||!text(reward.fileName,200)))fail('Некоректний файл винагороди');
 if(reward.type==='offer'&&(!text(reward.url,2048)||reward.url!==''&&!safeSuccessUrl(reward.url)||!['same_tab','new_tab'].includes(reward.target)))fail('Вкажіть безпечну адресу пропозиції');
 if(reward.type!=='promo'&&reward.promo!==undefined||reward.type!=='file'&&(reward.fileId!==undefined||reward.fileName!==undefined)||reward.type!=='offer'&&(reward.url!==undefined||reward.target!==undefined))fail('Параметри іншого типу винагороди');
 for(const layer of ['base','mobile','laptop','tablet','mobileLandscape']){if(flow[layer]===undefined)continue;if(!object(flow[layer]))fail('Некоректні стилі кроків');for(const [key,value]of Object.entries(flow[layer])){const p=properties.find(p=>p.key===key);if(!p||p.kind==='number'&&(!Number.isFinite(value)||value<p.min||value>p.max)||p.kind==='color'&&!isPaint(value)||p.kind==='select'&&!p.options.some(([v])=>v===value))fail('Некоректний стиль покрокової форми');}}
}
export function formFlowErrors(content){
 if(!isFormFlow(content))return [];const errors=[],add=(message,path='flow')=>errors.push({path,message,semantic:true});const all=content.flow.steps.flatMap(s=>s.fieldIds),expected=content.fields.map(f=>f.id);
 if(new Set(all).size!==all.length||all.length!==expected.length||expected.some(id=>!all.includes(id)))add('Кожне поле має належати рівно одному кроку');
 if(content.flow.steps.some(s=>!s.title.trim()))add('Вкажіть назви всіх кроків');
 if(content.flow.steps.some(s=>!s.fieldIds.some(id=>content.fields.some(f=>f.id===id&&!f.disabled))))add('Кожен крок потребує ввімкненого поля');
 if(all.join()!==expected.join())add('Порядок полів має відповідати порядку кроків');
 const r=content.flow.reward;if(!r.title.trim()||!r.buttonText.trim())add('Вкажіть заголовок і підпис дії винагороди','flow.reward');
 if(r.type==='promo'&&!r.promo.value.trim())add('Вкажіть промокод винагороди','flow.reward.promo');
 if(r.type==='file'&&!r.fileId)add('Завантажте файл винагороди','flow.reward.file');
 if(r.type==='offer'&&!r.url.trim())add('Вкажіть адресу пропозиції','flow.reward.url');
 return errors;
}
/** Secret values stay exclusively in the private immutable version. Styles are safe to publish. */
export function publicFormContent(content){if(!isFormFlow(content))return content;const next=structuredClone(content),r=next.flow.reward;if(r.type==='promo')r.promo.value='';if(r.type==='file'){r.fileId='';r.fileName='';}if(r.type==='offer')r.url='';return next;}
