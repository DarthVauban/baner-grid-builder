import {styleLayer,responsiveValues,POPUP_DEVICES} from './responsive.mjs';
import {isPaint} from './paint.mjs';
import {RICH_FONTS} from './rich-text.mjs';

export const PROMO_VARIANTS=[['capsule','Капсула'],['coupon','Купон'],['card','Темна картка']];
const p=(key,label,group,kind,value,min,max,options)=>({key,label,group,kind,default:value,min,max,options});
export const PROMO_PROPERTIES=[
 p('fontFamily','Шрифт коду','Код і підпис','font','Arial'),p('fontSize','Розмір коду, px','Код і підпис','number',20,8,120),p('fontWeight','Насиченість коду','Код і підпис','weight',600),p('letterSpacing','Інтервал літер, px','Код і підпис','number',0,-5,20),p('color','Колір коду','Код і підпис','color','#25231F'),p('showLabel','Показувати підпис','Код і підпис','boolean',false),p('labelSize','Розмір підпису, px','Код і підпис','number',12,8,64),p('labelColor','Колір підпису','Код і підпис','color','#6D6962'),
 p('background','Зовнішній фон','Поверхня','color','#FFFFFF'),p('codeBackground','Фон коду','Поверхня','color','#F5EEDD'),p('radius','Радіус компонента, px','Поверхня','number',999,0,999),p('codeRadius','Радіус області коду, px','Поверхня','number',999,0,999),p('borderColor','Колір контуру','Поверхня','color','#E7E4DF'),p('borderWidth','Товщина контуру, px','Поверхня','number',1,0,12),p('padding','Внутрішній відступ, px','Поверхня','number',8,0,80),p('gap','Проміжок до кнопки, px','Поверхня','number',8,0,80),p('opacity','Непрозорість, %','Поверхня','number',100,0,100),p('shadowBlur','Розмиття тіні, px','Поверхня','number',0,0,100),p('shadowY','Зміщення тіні Y, px','Поверхня','number',2,-100,100),p('shadowColor','Колір тіні','Поверхня','color','#00000020'),
 p('copyText','Підпис кнопки','Кнопка копіювання','text','Скопіювати'),p('copyShowText','Показувати текст кнопки','Кнопка копіювання','boolean',false),p('copySize','Розмір кнопки, px','Кнопка копіювання','number',48,32,160),p('copyRadius','Радіус кнопки, px','Кнопка копіювання','number',999,0,999),p('copyPadding','Відступи кнопки, px','Кнопка копіювання','number',8,0,64),p('copyIconSize','Розмір іконки, px','Кнопка копіювання','number',20,12,64),p('copyFontFamily','Шрифт кнопки копіювання','Кнопка копіювання','font','Arial'),p('copyFontWeight','Насиченість кнопки копіювання','Кнопка копіювання','weight',500),p('copyFontSize','Розмір тексту кнопки, px','Кнопка копіювання','number',13,8,64),p('copyBackground','Фон кнопки','Кнопка копіювання','color','#24221F'),p('copyColor','Колір кнопки','Кнопка копіювання','color','#FFFFFF'),p('copyBorderColor','Колір контуру кнопки','Кнопка копіювання','color','#24221F'),p('copyBorderWidth','Товщина контуру кнопки, px','Кнопка копіювання','number',0,0,12),p('copyShadowBlur','Розмиття тіні кнопки, px','Кнопка копіювання','number',0,0,100),p('copyShadowColor','Колір тіні кнопки','Кнопка копіювання','color','#00000020'),
 p('copyHoverBackground','Фон при наведенні','Стани кнопки','color','#403C35'),p('copyHoverColor','Колір при наведенні','Стани кнопки','color','#FFFFFF'),p('copySuccessBackground','Фон після копіювання','Стани кнопки','color','#37642D'),p('copySuccessColor','Колір після копіювання','Стани кнопки','color','#FFFFFF'),
];
export const PROMO_GROUPS=[...new Set(PROMO_PROPERTIES.map(p=>p.group))];
const defaults=Object.fromEntries(PROMO_PROPERTIES.map(p=>[p.key,p.default]));
const skins={capsule:{},coupon:{labelColor:'#403C35',background:'#EADDBC',codeBackground:'#FFFFFF00',radius:16,codeRadius:0,padding:0,gap:0,showLabel:true,copyRadius:0,copySize:64,borderColor:'#D5C8AA'},card:{background:'#24221F',codeBackground:'#FFFFFF',radius:24,codeRadius:16,padding:16,showLabel:true,labelColor:'#EADDBC',copyBackground:'#EADDBC',copyColor:'#25231F',copyBorderColor:'#EADDBC',copySize:40,copyHoverBackground:'#DAC99D',copyHoverColor:'#25231F'}};
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v),keys=(v,allowed)=>Object.keys(v).every(k=>allowed.includes(k));
export const isStyledPromo=content=>content?.promo?.version===1;
export function promoValues(content,device='desktop'){const d=content?.promo;return {...defaults,...skins[d?.variant||'capsule'],...responsiveValues(d,device)};}
export function validatePromoContent(content){
 const validText=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u0008\u000e-\u001f]/.test(s);
 if(!plain(content)||!keys(content,['value','label','promo'])||!validText(content.value,128)||!validText(content.label,200))throw Error('Некоректний промокод');
 if(content.promo===undefined)return content;
 const data=content.promo;if(!plain(data)||!keys(data,['version','variant','base','mobile','laptop','tablet','mobileLandscape'])||data.version!==1||!PROMO_VARIANTS.some(([id])=>id===data.variant)||!plain(data.base))throw Error('Некоректний тип промокоду');
 for(const layer of ['base','mobile','laptop','tablet','mobileLandscape']){const values=data[layer];if(values===undefined&&layer!=='base')continue;if(!plain(values))throw Error('Некоректний стиль промокоду');for(const [key,value]of Object.entries(values)){
  const property=PROMO_PROPERTIES.find(p=>p.key===key);if(!property)throw Error('Невідомий параметр промокоду');
  const valid=property.kind==='color'?typeof value==='string'&&isPaint(value):property.kind==='number'?typeof value==='number'&&Number.isFinite(value)&&value>=property.min&&value<=property.max:property.kind==='boolean'?typeof value==='boolean':property.kind==='font'?RICH_FONTS.includes(value)&&value!=='inherit':property.kind==='weight'?[400,500,600,700].includes(value):validText(value,80);
  if(!valid)throw Error(`Некоректне значення: ${property.label}`);
 }}return content;
}
export function setPromoVariant(content,variant){const next=structuredClone(content);next.promo={version:1,base:{},...next.promo,variant};return validatePromoContent(next);}
export function updatePromoStyle(content,device,patch){if(!POPUP_DEVICES.includes(device)||Object.keys(patch).some(key=>!PROMO_PROPERTIES.some(p=>p.key===key)))throw Error('Невідомий параметр промокоду');const next=isStyledPromo(content)?structuredClone(content):setPromoVariant(content,'capsule');const layer=styleLayer(device);next.promo[layer]||={};for(const [key,value]of Object.entries(patch)){if(value===undefined)delete next.promo[layer][key];else next.promo[layer][key]=value;}return validatePromoContent(next);}
export async function copyPromoValue(value,{mode='storefront',onNotice=()=>{},onActionSuccess,clipboard=globalThis.navigator?.clipboard}={}){
 if(typeof value!=='string'||!value.trim()){onNotice('Промокод не вказано');return 'empty';}
 if(mode==='preview'){onNotice(`У прев’ю: ${value}`);return 'preview';}
 if(mode==='editor')return 'editor';
 try{if(!clipboard?.writeText)throw Error('Clipboard unavailable');await clipboard.writeText(value);onNotice('Промокод скопійовано');try{onActionSuccess?.('copy_promo');}catch{/* Tracking cannot turn a confirmed copy into an error. */}return 'success';}catch{onNotice(`Не вдалося скопіювати. Код: ${value}`);return 'error';}
}
