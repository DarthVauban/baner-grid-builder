import {styleLayer,responsiveValues,POPUP_DEVICES} from './responsive.mjs';
import {isPaint} from './paint.mjs';
import {textValues,textFallback,textLocked,updateTextGlobal,validateTextContent,TEXT_FITS} from './text.mjs';
import {ZERO_ICON_GLYPHS,ZERO_ICON_VECTORS,ZERO_FORM_PROPERTY_MAP} from './zero-form.mjs';
import {validateSvgIcon} from './svg-icon.mjs';
export const BUTTON_GROUPS=['Типографіка','Розмір і розміщення','Фон і відступи','Іконка','Контур','Тіні','Наведення'];
export const BUTTON_FITS=TEXT_FITS;
export const BUTTON_ICON_EFFECTS=ZERO_FORM_PROPERTY_MAP.buttonIconAnimation.options;
export const BUTTON_COMMON_KEYS=['fontFamily','fontSize','fontWeight','color','align','lineHeight','lineHeightUnit','letterSpacing','letterCase','fit','opacity','rotation','flipX','flipY','background','padding','corners','border','shadows'];
export const isStyledButton=content=>content?.button?.version===1;
export function buttonData(content){return {version:1,base:{},...content.button};}
export function buttonValues(content,device='desktop',fallback={}){
 const base=textValues({typography:{version:1,base:{fit:'fixed'}}},device,fallback);
 return {...base,fit:'fixed',padding:{top:4,right:4,bottom:4,left:4},icon:{kind:'none',glyph:'right',emoji:'',resourceId:''},hoverIcon:{kind:'none',glyph:'right',emoji:'',resourceId:''},iconPosition:'before',iconSize:20,iconGap:10,iconWeight:'regular',iconAnimation:'none',hoverBackground:'',hoverColor:'',hoverBorderColor:'',hoverDuration:.2,...responsiveValues(content.button,device)};
}
export const buttonFallback=textFallback;
export function editorLocked(element){return element.locked===true||textLocked(element)||element.type==='button'&&element.content.button?.locked===true;}
/** Mutates only editor metadata in the caller's document copy. Legacy flags stay compatible. */
export function setEditorLocked(element,locked){
 if(element.type==='text'){delete element.locked;element.content=updateTextGlobal(element.content,{locked});}
 else if(element.type==='button'){delete element.locked;element.content=updateButtonGlobal(element.content,{locked});}
 else if(locked)element.locked=true;else delete element.locked;
}
function validateIcon(value){
 const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 if(!plain(value)||Object.keys(value).some(key=>!['kind','glyph','emoji','resourceId','svg'].includes(key))||!['none','glyph','icon','emoji','image','svg'].includes(value.kind)||typeof value.glyph!=='string'||!Object.hasOwn({...ZERO_ICON_GLYPHS,...ZERO_ICON_VECTORS},value.glyph)||typeof value.emoji!=='string'||value.emoji.length>32||/[\u0000-\u0008\u000e-\u001f]/.test(value.emoji)||typeof value.resourceId!=='string'||value.resourceId!==''&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.resourceId))throw new Error('Некоректна іконка кнопки');
 if(value.svg!==undefined)validateSvgIcon(value.svg);if(value.kind==='svg'&&!value.svg)throw new Error('Додайте коректну SVG іконку');
}
export function validateButtonContent(content){
 if(!content||typeof content!=='object'||Array.isArray(content)||![Object.prototype,null].includes(Object.getPrototypeOf(content))||Object.keys(content).some(key=>!['text','button'].includes(key))||typeof content.text!=='string'||content.text.length>5000||/[\u0000-\u0008\u000e-\u001f]/.test(content.text))throw new Error('Підпис кнопки — до 5000 символів');
 const b=content.button;if(b===undefined)return content;
 if(!b||typeof b!=='object'||Array.isArray(b)||![Object.prototype,null].includes(Object.getPrototypeOf(b))||b.version!==1||!b.base||typeof b.base!=='object'||Array.isArray(b.base)||Object.keys(b).some(key=>!['version','base','mobile','laptop','tablet','mobileLandscape','locked','nofollow'].includes(key))||['locked','nofollow'].some(key=>b[key]!==undefined&&typeof b[key]!=='boolean'))throw new Error('Некоректне оформлення кнопки');
 for(const layer of ['base','mobile','laptop','tablet','mobileLandscape']){
  const value=b[layer];if(value===undefined)continue;if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('Некоректний стиль кнопки');
  const common={};for(const [key,item]of Object.entries(value)){
   if(BUTTON_COMMON_KEYS.includes(key)){common[key]=item;continue;}
   if(['icon','hoverIcon'].includes(key)){validateIcon(item);continue;}
   if(['iconSize','iconGap','hoverDuration'].includes(key)){if(!Number.isFinite(item)||item<0||item>(key==='hoverDuration'?10:120)||key==='iconSize'&&item<8)throw new Error('Некоректний розмір або тривалість');continue;}
   if(['hoverBackground','hoverColor','hoverBorderColor'].includes(key)){if(typeof item!=='string'||item!==''&&!isPaint(item))throw new Error('Некоректний колір наведення');continue;}
   const options={iconPosition:['before','after'],iconWeight:['light','regular','semibold','bold'],iconAnimation:BUTTON_ICON_EFFECTS.map(([key])=>key)};
   if(!Object.hasOwn(options,key)||!options[key].includes(item))throw new Error('Невідомий параметр кнопки');
  }
  if(common.align==='justify')throw new Error('Оберіть вирівнювання кнопки');validateTextContent({text:'',typography:{version:1,base:common}});
 }
 return content;
}
/** The first edit retains each legacy composition's effective styles, without touching actions. */
export function upgradeButton(element){
 const content=structuredClone(element.content);if(isStyledButton(content))return content;
 const layers={base:{}};
 for(const device of POPUP_DEVICES){
  const values=buttonValues(content,device,buttonFallback(element,device)),parent=device==='mobileLandscape'?'mobile':'desktop',inherited=buttonValues(content,parent,buttonFallback(element,parent)),target={};
  for(const key of BUTTON_COMMON_KEYS)if(device==='desktop'||JSON.stringify(values[key])!==JSON.stringify(inherited[key]))target[key]=values[key];
  if(device==='desktop'||Object.keys(target).length)layers[styleLayer(device)]=target;
 }
 content.button={version:1,...layers};return validateButtonContent(content);
}
export function updateButtonStyle(content,device,patch){const next=structuredClone(content);next.button=buttonData(next);const layer=styleLayer(device);next.button[layer]||={};for(const [key,value]of Object.entries(patch))if(value===undefined)delete next.button[layer][key];else next.button[layer][key]=value;return validateButtonContent(next);}
export function updateButtonGlobal(content,patch){return validateButtonContent({...content,button:{...buttonData(content),...patch}});}
export function buttonHandles(content,device='desktop'){const fit=buttonValues(content,device).fit;return fit==='auto-width'?[]:fit==='auto-height'||fit==='single-line'?['w','e']:undefined;}
export function buttonMediaIds(content){return [...new Set(['base','mobile','laptop','tablet','mobileLandscape'].flatMap(layer=>['icon','hoverIcon'].flatMap(key=>{const icon=content.button?.[layer]?.[key];return icon?.kind==='image'&&icon.resourceId?[icon.resourceId]:[];})))];}
