import {isPaint} from './paint.mjs';
import {RICH_FONTS} from './rich-text.mjs';
import {POPUP_DEVICES,responsiveValues,styleLayer} from './responsive.mjs';

export const TIMER_UNITS=['days','hours','minutes','seconds'];
export const TIMER_LABELS={days:'дні',hours:'години',minutes:'хвилини',seconds:'секунди'};
export const TIMER_MAX_DURATION=365*86400;
const property=(key,label,group,kind,value,min,max)=>({key,label,group,kind,default:value,min,max});
export const TIMER_PROPERTIES=[
 property('appearance','Вигляд таймера','Оформлення','appearance','cards'),
 property('fontFamily','Шрифт цифр','Типографіка','font','Arial'),
 property('fontSize','Розмір цифр, px','Типографіка','number',32,8,120),
 property('fontWeight','Насиченість цифр','Типографіка','weight',600),
 property('color','Колір цифр','Типографіка','color','#25231F'),
 property('labelSize','Розмір підписів, px','Типографіка','number',12,8,64),
 property('labelColor','Колір підписів','Типографіка','color','#6D6962'),
 property('background','Фон блоків','Оформлення','color','#EADDBC'),
 property('radius','Кути блоків, px','Оформлення','number',12,0,999),
 property('borderWidth','Товщина контуру, px','Оформлення','number',0,0,12),
 property('borderColor','Колір контуру','Оформлення','color','#E7E4DF'),
 property('padding','Відступ у блоках, px','Оформлення','number',12,0,80),
 property('gap','Проміжок між блоками, px','Оформлення','number',8,0,80),
 property('labelGap','Проміжок до підпису, px','Оформлення','number',4,0,40),
 property('shadowBlur','Розмиття тіні, px','Оформлення','number',0,0,100),
 property('shadowY','Зміщення тіні Y, px','Оформлення','number',2,-100,100),
 property('shadowColor','Колір тіні','Оформлення','color','#00000020'),
];
const defaults=Object.fromEntries(TIMER_PROPERTIES.map(p=>[p.key,p.default]));
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/\p{Cc}/u.test(value);
export function validTimerTimezone(value){try{return typeof value==='string'&&value.length<=100&&!!new Intl.DateTimeFormat('en',{timeZone:value}).format(0);}catch{return false;}}
export function createTimerContent(timezone='Europe/Kyiv'){
 return {timer:{version:1,mode:'deadline',endAt:null,timezone,durationSeconds:900,units:[...TIMER_UNITS],labels:{...TIMER_LABELS},separator:':',showLabels:true,finish:'message',finishText:'Акцію завершено',base:{}}};
}
export function timerValues(content,device='desktop'){return {...defaults,...responsiveValues(content.timer,device)};}
export function validateTimerContent(content){
 const t=content?.timer;
 if(!plain(content)||!keys(content,['timer'])||!plain(t)||!keys(t,['version','mode','endAt','timezone','durationSeconds','units','labels','separator','showLabels','finish','finishText','base',...POPUP_DEVICES.filter(d=>d!=='desktop')])||t.version!==1||!['deadline','duration'].includes(t.mode)||!validTimerTimezone(t.timezone))throw Error('Некоректний таймер');
 if(t.endAt!==null&&(!Number.isSafeInteger(t.endAt)||t.endAt<Date.UTC(2019,11,30)||t.endAt>Date.UTC(2101,0,2)||Number(timerLocalParts(t.endAt,t.timezone).date.slice(0,4))<2020||Number(timerLocalParts(t.endAt,t.timezone).date.slice(0,4))>2100))throw Error('Дата таймера має бути між 2020 і 2100 роками');
 if(!Number.isInteger(t.durationSeconds)||t.durationSeconds<1||t.durationSeconds>TIMER_MAX_DURATION)throw Error('Тривалість таймера: від 1 секунди до 365 днів');
 if(!Array.isArray(t.units)||!t.units.length||t.units.length>4||t.units.some((u,i)=>!TIMER_UNITS.includes(u)||i>0&&TIMER_UNITS.indexOf(u)<=TIMER_UNITS.indexOf(t.units[i-1])))throw Error('Оберіть хоча б одну одиницю таймера');
 if(!plain(t.labels)||!keys(t.labels,TIMER_UNITS)||!TIMER_UNITS.every(unit=>text(t.labels[unit],24))||!text(t.separator,3)||typeof t.showLabels!=='boolean'||!['message','hide','close'].includes(t.finish)||!text(t.finishText,300))throw Error('Перевірте формат і завершення таймера');
 for(const layer of ['base',...POPUP_DEVICES.filter(d=>d!=='desktop')]){
  const values=t[layer];if(values===undefined&&layer!=='base')continue;
  if(!plain(values))throw Error('Некоректне оформлення таймера');
  for(const [key,value]of Object.entries(values)){
   const p=TIMER_PROPERTIES.find(p=>p.key===key);
   const valid=p&&(p.kind==='number'?typeof value==='number'&&Number.isFinite(value)&&value>=p.min&&value<=p.max:p.kind==='color'?isPaint(value):p.kind==='font'?RICH_FONTS.includes(value)&&value!=='inherit':p.kind==='weight'?[400,500,600,700].includes(value):['plain','cards'].includes(value));
   if(!valid)throw Error(`Некоректне оформлення таймера: ${p?.label||key}`);
  }
 }
 return content;
}
export function updateTimer(content,patch){const next=structuredClone(content);Object.assign(next.timer,patch);return validateTimerContent(next);}
export function updateTimerStyle(content,device,patch){
 if(!POPUP_DEVICES.includes(device))throw Error('Невідомий пристрій');
 const next=structuredClone(content),layer=styleLayer(device);next.timer[layer]||={};
 for(const [key,value]of Object.entries(patch)){if(value===undefined)delete next.timer[layer][key];else next.timer[layer][key]=value;}
 return validateTimerContent(next);
}
export function timerDiagnostics(element){return element.content.timer.mode==='deadline'&&element.content.timer.endAt===null?[{elementId:element.id,code:'timer_deadline_missing',message:'Оберіть дату й час завершення таймера.'}]:[];}
export function timerParts(seconds,units=TIMER_UNITS){
 let remaining=Math.max(0,Math.ceil(seconds));const divisors={days:86400,hours:3600,minutes:60,seconds:1};
 return units.map(unit=>{const value=Math.floor(remaining/divisors[unit]);remaining%=divisors[unit];return {unit,value};});
}
export function remainingTimerSeconds(endAt,now=Date.now()){return Math.max(0,Math.ceil((endAt-now)/1000));}
export function timerLocalParts(instant,timezone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
 return {date:`${parts.year}-${parts.month}-${parts.day}`,hour:parts.hour,minute:parts.minute};
}
export function timerInstant(date,hour,minute,timezone){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}$/.test(hour)||!/^\d{2}$/.test(minute)||!validTimerTimezone(timezone))throw Error('Перевірте дату й час таймера');
 const [year,month,day]=date.split('-').map(Number),h=Number(hour),m=Number(minute),naive=Date.UTC(year,month-1,day,h,m);
 if(year<2020||year>2100||h>23||m>59||new Date(naive).toISOString().slice(0,10)!==date)throw Error('Перевірте дату й час таймера');
 const offsets=new Set();
 for(let delta=-36;delta<=36;delta+=6){const at=naive+delta*3600000,p=timerLocalParts(at,timezone),[y,mo,d]=p.date.split('-').map(Number);offsets.add(Date.UTC(y,mo-1,d,Number(p.hour),Number(p.minute))-at);}
 const matches=[...offsets].map(offset=>naive-offset).filter(at=>{const p=timerLocalParts(at,timezone);return p.date===date&&p.hour===hour&&p.minute===minute;}).sort((a,b)=>a-b);
 if(!matches.length)throw Error('Цього часу немає через переведення годинника. Оберіть інший час.');
 return matches[0];
}
export function timerStorageKey(identity,timer){return `kk:timer:v1:${identity.shopId}:${identity.widgetId}:${identity.elementId}:${timer.durationSeconds}`;}
/** Explicit sessions isolate previews; storefront reuses one browser session across mounts. */
/** @param {{getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}|undefined} [storage] */
export function createTimerSession(storage){
 const deadlines=new Map();
 return {resolve(identity,timer,now=Date.now()){
  if(timer.mode==='deadline')return timer.endAt;
  const key=timerStorageKey(identity,timer);let deadline=deadlines.get(key);
  try{const record=JSON.parse(storage?.getItem(key)||'null');if(record&&Number.isSafeInteger(record.start)&&record.start>=0&&Number.isSafeInteger(record.end)&&record.end-record.start===timer.durationSeconds*1000)deadline=deadline===undefined?record.end:Math.min(deadline,record.end);}catch{/* Storage can be unavailable; keep this page's deadline. */}
  if(deadline===undefined){deadline=now+timer.durationSeconds*1000;try{storage?.setItem(key,JSON.stringify({start:now,end:deadline}));}catch{/* The page-memory session still continues on reopen. */}}
  deadlines.set(key,deadline);return deadline;
 }};
}
