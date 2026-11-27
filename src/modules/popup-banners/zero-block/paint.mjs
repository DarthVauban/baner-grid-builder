/** Bounded data grammar, shared by authoring, server validation and customer rendering.
 * No CSS parser, URLs, variables, named colours, arbitrary functions or markup. */
export const HEX_COLOR=/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const num='(-?(?:\\d+(?:\\.\\d+)?|\\.\\d+))';
const finite=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
export function parsePaint(value){
 if(typeof value!=='string'||value.length>4096)return null;
 if(HEX_COLOR.test(value))return {type:'solid',color:value.toUpperCase()};
 const match=/^(linear|radial|conic)-gradient\(([^()]+)\)$/i.exec(value);if(!match)return null;
 const [,type,body]=match,parts=body.split(',').map(s=>s.trim()),header=parts.shift(),stops=[];
 if(parts.length<2||parts.length>12)return null;
 for(const part of parts){const stop=new RegExp(`^(#[\\da-f]{6}(?:[\\da-f]{2})?)\\s+${num}%$`,'i').exec(part);if(!stop||!finite(+stop[2],0,100))return null;stops.push({color:stop[1].toUpperCase(),position:+stop[2]});}
 const result={type,stops};
 if(type==='linear'){const a=new RegExp(`^${num}deg$`).exec(header);if(!a||!finite(+a[1],-360,360))return null;return {...result,angle:+a[1]};}
 const center=new RegExp(` at ${num}(%|px) ${num}(%|px)$`).exec(header);if(!center||!finite(+center[1],-3000,3000)||!finite(+center[3],-3000,3000))return null;
 Object.assign(result,{x:+center[1],xUnit:center[2],y:+center[3],yUnit:center[4]});const head=header.slice(0,center.index);
 if(type==='conic'){const a=new RegExp(`^from ${num}deg$`).exec(head);return a&&finite(+a[1],-360,360)?{...result,angle:+a[1]}:null;}
 const radial=/^(circle|ellipse) (.+)$/.exec(head);if(!radial)return null;result.radialShape=radial[1];
 if(['closest-side','closest-corner','farthest-side','farthest-corner'].includes(radial[2]))return {...result,radialSize:radial[2]};
 const radius=new RegExp(radial[1]==='circle'?`^${num}px$`:`^${num}(%|px) ${num}(%|px)$`).exec(radial[2]);if(!radius||!finite(+radius[1],0,10000))return null;
 if(radial[1]==='ellipse'&&(!finite(+radius[3],0,10000)||radius[2]!==radius[4]))return null;
 return {...result,radialSize:'custom',radiusX:+radius[1],radiusY:radial[1]==='ellipse'?+radius[3]:+radius[1],radiusUnit:radial[1]==='ellipse'?radius[2]:'px'};
}
export const isPaint=value=>parsePaint(value)!==null;
export const isGradient=value=>typeof value==='string'&&!HEX_COLOR.test(value)&&isPaint(value);
export function containsGradientPaint(value){return typeof value==='string'?isGradient(value):Array.isArray(value)?value.some(containsGradientPaint):!!value&&typeof value==='object'&&Object.values(value).some(containsGradientPaint);}
const n=value=>Math.round(value*10000)/10000;
export function serializePaint(layer,scale=1){
 if(layer.type==='solid')return layer.color||'#EADDBC';
 const stops=[...(layer.stops||[])].sort((a,b)=>a.position-b.position).map(s=>`${s.color} ${n(s.position)}%`).join(', ');
 const unit=(v=50,u='%')=>`${n(v*(u==='px'?scale:1))}${u}`,center=`${unit(layer.x,layer.xUnit)} ${unit(layer.y,layer.yUnit)}`;
 if(layer.type==='linear')return `linear-gradient(${n(layer.angle||0)}deg, ${stops})`;
 if(layer.type==='conic')return `conic-gradient(from ${n(layer.angle||0)}deg at ${center}, ${stops})`;
 const kind=layer.radialShape||'circle',size=layer.radialSize||'farthest-corner',radius=size==='custom'?kind==='circle'?`${n((layer.radiusX??100)*scale)}px`:`${unit(layer.radiusX??100,layer.radiusUnit)} ${unit(layer.radiusY??100,layer.radiusUnit)}`:size;
 return `radial-gradient(${kind} ${radius} at ${center}, ${stops})`;
}
export function paintFallback(value){const p=parsePaint(value);return p?.type==='solid'?p.color:p?.stops?.[0]?.color||'#25231F';}
export function paintAlpha(value,opacity=100){
 const apply=color=>{const c=color.slice(0,7),alpha=(color.length===9?parseInt(color.slice(7),16)/255:1)*opacity/100;return c+Math.round(alpha*255).toString(16).padStart(2,'0');};
 const p=parsePaint(value);if(!p)return '#00000000';return p.type==='solid'?apply(p.color):serializePaint({...p,stops:p.stops.map(stop=>({...stop,color:apply(stop.color)}))});
}
