import {styleLayer,responsiveValues,POPUP_DEVICES} from './responsive.mjs';
import {isPaint} from './paint.mjs';
import {RICH_FONTS} from './rich-text.mjs';

export const PRODUCT_PRESETS = [['horizontal','Горизонтальна'],['vertical','Вертикальна'],['contrast','Контрастна']];
const property=(key,label,group,kind,value,extra={})=>({key,label,group,kind,default:value,...extra});
const n=(key,label,group,value,min=0,max=100)=>property(key,label,group,'number',value,{min,max});
const c=(key,label,group,value)=>property(key,label,group,'color',value);
const font=(key,label,group)=>property(key,label,group,'font','Segoe UI');
export const PRODUCT_PROPERTIES = [
 ...[['showImage','Фото'],['showArticle','Артикул'],['showAvailability','Наявність'],['showPrice','Ціна'],['showButton','Кнопка']].map(([key,label])=>property(key,`Показувати: ${label}`,'Склад картки','boolean',true)),
 c('background','Фон картки','Поверхня','#FFFFFF'),c('borderColor','Колір контуру','Поверхня','#E7E4DF'),n('borderWidth','Товщина контуру, px','Поверхня',1,0,12),n('radius','Заокруглення, px','Поверхня',24,0,999),n('paddingX','Відступи по горизонталі, px','Поверхня',16,0,120),n('paddingY','Відступи по вертикалі, px','Поверхня',16,0,120),n('gap','Проміжок між частинами, px','Поверхня',16,0,120),n('textGap','Проміжок між рядками, px','Поверхня',8,0,80),n('opacity','Непрозорість, %','Поверхня',100),c('shadowColor','Колір тіні','Поверхня','#00000000'),n('shadowBlur','Розмиття тіні, px','Поверхня',0,0,100),n('shadowY','Зміщення тіні Y, px','Поверхня',4,-100,100),
 c('imageBackground','Фон фото','Фото','#F4F3F1'),n('imageRadius','Заокруглення фото, px','Фото',16,0,999),n('imageHeight','Висота області фото, px','Фото',120,40,800),n('imageWidth','Частка ширини фото, %','Фото',24,15,65),property('imageFit','Вписування фото','Фото','select','contain',{options:[['contain','Повністю'],['cover','Заповнити']]}),
 font('nameFont','Шрифт назви','Назва й метадані'),n('nameSize','Розмір назви, px','Назва й метадані',20,8,120),property('nameWeight','Насиченість назви','Назва й метадані','weight',600),c('nameColor','Колір назви','Назва й метадані','#25231F'),n('nameLineHeight','Міжрядковий інтервал назви','Назва й метадані',1.3,1,3),font('metaFont','Шрифт метаданих','Назва й метадані'),n('metaSize','Розмір метаданих, px','Назва й метадані',12,8,64),c('metaColor','Колір артикула','Назва й метадані','#6D6962'),c('availableColor','Колір наявного товару','Назва й метадані','#37642D'),c('unavailableColor','Колір відсутнього товару','Назва й метадані','#6D6962'),c('unknownColor','Колір невідомої наявності','Назва й метадані','#8B570C'),
 font('priceFont','Шрифт ціни','Ціна'),n('priceSize','Розмір ціни, px','Ціна',28,8,120),property('priceWeight','Насиченість ціни','Ціна','weight',700),c('priceColor','Колір ціни','Ціна','#25231F'),
 font('buttonFont','Шрифт кнопки','Кнопка'),n('buttonSize','Розмір тексту кнопки, px','Кнопка',14,8,64),property('buttonWeight','Насиченість кнопки','Кнопка','weight',500),c('buttonBackground','Фон кнопки','Кнопка','#24221F'),c('buttonColor','Колір тексту кнопки','Кнопка','#FFFFFF'),c('buttonHoverBackground','Фон при наведенні','Кнопка','#403C35'),c('buttonHoverColor','Текст при наведенні','Кнопка','#FFFFFF'),c('buttonFocusColor','Колір фокусу','Кнопка','#826324'),n('buttonRadius','Заокруглення кнопки, px','Кнопка',999,0,999),n('buttonPaddingX','Відступ кнопки по горизонталі, px','Кнопка',16,0,100),n('buttonPaddingY','Відступ кнопки по вертикалі, px','Кнопка',12,0,100),
];
export const PRODUCT_GROUPS=[...new Set(PRODUCT_PROPERTIES.map(p=>p.group))];
const defaults=Object.fromEntries(PRODUCT_PROPERTIES.map(p=>[p.key,p.default]));
const skins={horizontal:{},vertical:{imageHeight:240,imageWidth:100,gap:16},contrast:{background:'radial-gradient(circle farthest-corner at 100% 0%, #403C35 0%, #24221F 100%)',borderColor:'#403C35',radius:28,paddingX:20,paddingY:20,imageBackground:'#FFFFFF',imageHeight:240,imageWidth:46,nameColor:'#FFFFFF',metaColor:'#B9B4AA',priceColor:'#FFFFFF',availableColor:'#B7D0A4',unavailableColor:'#B9B4AA',unknownColor:'#EADDBC',buttonBackground:'#EADDBC',buttonColor:'#25231F',buttonHoverBackground:'#DAC99D',buttonHoverColor:'#25231F'}};
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=(v,allowed)=>Object.keys(v).every(key=>allowed.includes(key));
const text=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u001f]/u.test(v);
export const productUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function productValues(content,device='desktop'){
 const data=content?.product,mobile=['mobile','mobileLandscape'].includes(device),ownPreset=data?.[device+'Preset'],preset=ownPreset||(mobile?data?.mobilePreset:undefined)||data?.preset||'horizontal';
 return {...defaults,...skins[preset],...(mobile?{imageHeight:200,nameSize:20,priceSize:28}:{}),...responsiveValues(data,device),layout:mobile&&!ownPreset&&!data?.mobilePreset?'vertical':preset};
}
export function validateProductContent(content){
 if(!plain(content)||!keys(content,['productId','product'])||(content.productId!==null&&!text(content.productId,200)))throw Error('Некоректний товар');
 const data=content.product;if(data===undefined)return content;
 const preset=value=>PRODUCT_PRESETS.some(([id])=>id===value);
 if(!plain(data)||!keys(data,['version','preset','mobilePreset','laptopPreset','tabletPreset','mobileLandscapePreset','base','mobile','laptop','tablet','mobileLandscape','buttonText','currencyLabel','target'])||data.version!==1||!preset(data.preset)||(data.mobilePreset!==undefined&&!preset(data.mobilePreset))||!plain(data.base)||(content.productId!==null&&!productUuid(content.productId)))throw Error('Некоректна товарна картка');
 for(const device of POPUP_DEVICES.filter(device=>device!=='desktop'))if(data[device+'Preset']!==undefined&&!preset(data[device+'Preset']))throw Error('Некоректний адаптивний пресет');
 if(data.buttonText!==undefined&&!text(data.buttonText,80)||data.currencyLabel!==undefined&&!text(data.currencyLabel,12)||data.target!==undefined&&!['same_tab','new_tab'].includes(data.target))throw Error('Некоректна дія або підпис ціни');
 for(const layer of ['base','mobile','laptop','tablet','mobileLandscape']){const values=data[layer];if(values===undefined&&layer!=='base')continue;if(!plain(values))throw Error('Некоректні стилі товару');for(const [key,value]of Object.entries(values)){
  const p=PRODUCT_PROPERTIES.find(p=>p.key===key);if(!p)throw Error('Невідомий параметр товару');
  const valid=p.kind==='color'?typeof value==='string'&&isPaint(value):p.kind==='number'?Number.isFinite(value)&&typeof value==='number'&&value>=p.min&&value<=p.max:p.kind==='boolean'?typeof value==='boolean':p.kind==='font'?RICH_FONTS.includes(value)&&value!=='inherit':p.kind==='weight'?[400,500,600,700].includes(value):p.options?.some(([id])=>id===value);
  if(!valid)throw Error(`Некоректне значення: ${p.label}`);
 }}return content;
}
export function setProductPreset(content,preset,device='desktop'){
 const next=structuredClone(content);next.product={version:1,preset:'horizontal',base:{},...next.product};
 if(device!=='desktop')next.product[device+'Preset']=preset;else next.product.preset=preset;
 return validateProductContent(next);
}
export function updateProductStyle(content,device,patch){
 if(!POPUP_DEVICES.includes(device))throw Error('Невідомий пристрій');
 const next=content.product?structuredClone(content):setProductPreset(content,'horizontal'),layer=styleLayer(device);next.product[layer]||={};
 for(const [key,value]of Object.entries(patch)){if(value===undefined)delete next.product[layer][key];else next.product[layer][key]=value;}
 return validateProductContent(next);
}
export function productUrl(value){
 if(typeof value!=='string'||value.length>4096||/[\p{Cc}\s\\]/u.test(value))return null;
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function productPrice(value){
 if(typeof value!=='string'||!/^\d{1,15}(?:\.\d{1,6})?$/.test(value))return '';
 const [integer,fraction]=value.split('.');return integer.replace(/\B(?=(\d{3})+(?!\d))/g,'\u00a0')+(fraction===undefined?'':','+fraction);
}
export function productDiagnostics(document,products){
 const errors=[];
 for(const item of document.elements.filter(item=>item.type==='product')){
  const id=item.content.productId,product=id&&products?.[id],add=(code,message)=>errors.push({elementId:item.id,code,message});
  if(!id){add('product_missing','Оберіть товар із каталогу');continue;}
  if(!product){add('product_unavailable','Товар недоступний у поточному каталозі. Оберіть його повторно.');continue;}
  const button=POPUP_DEVICES.some(device=>productValues(item.content,device).showButton);
  if(button&&!productUrl(product.productUrl))add('product_url_missing','У товару немає посилання. Приховайте кнопку або оновіть каталог.');
  if(button&&item.content.product?.buttonText!==undefined&&!item.content.product.buttonText.trim())add('product_button_empty','Вкажіть підпис кнопки товару');
 }
 return errors;
}
