const bundled={Roboto:'roboto',Montserrat:'montserrat',Inter:'inter'},pending=new Map();let defaultBase='';
export function runtimeFontFamily(family){return Object.hasOwn(bundled,family)?`KramKin Popup ${family}`:family;}
export function sourceFontFamily(family){return Object.keys(bundled).find(name=>runtimeFontFamily(name)===family)||family;}
export function setTextFontBase(base){if(base)defaultBase=baseOrigin(base);}
function baseOrigin(base){try{const url=new URL(base||defaultBase);if(['http:','https:'].includes(url.protocol))return url.origin;}catch{/* A relative API base uses the current origin. */}return globalThis.location?.origin||'';}
/** Fonts are public, local assets. Administrative UI typography is unaffected. */
export function ensureTextFont(family,italic=false,base){
 if(!bundled[family]||typeof FontFace==='undefined'||typeof document==='undefined')return Promise.resolve();
 const style=italic?'italic':'normal',origin=baseOrigin(base),key=`${origin}/${family}/${style}`;
 if(pending.has(key))return pending.get(key);
 const source=`${origin}/api/public/popup-banners/zero-block/fonts/kk-${bundled[family]}${italic?'-italic':''}-v1.woff2`,face=new FontFace(runtimeFontFamily(family),`url("${source}")`,{style,weight:'100 900',display:'swap'});
 document.fonts.add(face);const promise=face.load().then(()=>{globalThis.dispatchEvent?.(new Event('kramkin:text-font-ready'));}).catch(()=>{/* A denied font request keeps the declared system fallback. */});pending.set(key,promise);return promise;
}
export function ensureRichFonts(value,base){for(const block of value?.blocks||[])for(const run of block.runs||[])if(run.fontFamily)ensureTextFont(run.fontFamily,!!run.italic,base);}
