const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const tags=['g','path','circle','ellipse','rect','line','polyline','polygon'];
const common=['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','fill-rule','clip-rule','opacity','fill-opacity','stroke-opacity','transform'];
const geometry={g:[],path:['d'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],rect:['x','y','width','height','rx','ry'],line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points']};
const fail=()=>{throw new Error('SVG має містити лише прості векторні фігури без стилів, скриптів і зовнішніх ресурсів (до 32 КіБ).');};
function attributes(value,tag){
 if(!plain(value))fail();
 for(const [key,item]of Object.entries(value)){
  if(![...common,...(geometry[tag]||[])].includes(key)||typeof item!=='string'||item.length>4096)fail();
  if(['fill','stroke'].includes(key)){if(!/^(?:none|currentColor|transparent|#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8})$/i.test(item))fail();}
  else if(key==='d'){if(!item||!/^[MmLlHhVvCcSsQqTtAaZz\d.eE+,\s-]+$/.test(item))fail();}
  else if(key==='points'){if(!item||!/^[\d.eE+,\s-]+$/.test(item))fail();}
  else if(key==='transform'){if(!/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([-+\d.eE,\s]+\)\s*)+$/.test(item)||item.length>512)fail();}
  else if(key.endsWith('linecap')){if(!['butt','round','square'].includes(item))fail();}
  else if(key.endsWith('linejoin')){if(!['miter','round','bevel'].includes(item))fail();}
  else if(key.endsWith('rule')){if(!['nonzero','evenodd'].includes(item))fail();}
  else {if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(item)||!Number.isFinite(Number(item))||Math.abs(Number(item))>100000||['r','rx','ry','width','height','stroke-width'].includes(key)&&Number(item)<0||key.includes('opacity')&&(Number(item)<0||Number(item)>1))fail();}
 }
}
export function validateSvgIcon(value){
 if(!plain(value)||Object.keys(value).some(key=>!['viewBox','attrs','children'].includes(key))||!Array.isArray(value.viewBox)||value.viewBox.length!==4||!value.viewBox.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000)||value.viewBox[2]<=0||value.viewBox[3]<=0||JSON.stringify(value).length>32768)fail();
 attributes(value.attrs,'g');let count=0;
 function children(nodes,depth){if(!Array.isArray(nodes)||depth>8)fail();for(const node of nodes){if(++count>128||!plain(node)||Object.keys(node).some(key=>!['tag','attrs','children'].includes(key))||!tags.includes(node.tag))fail();attributes(node.attrs,node.tag);if(node.children!==undefined){if(node.tag!=='g')fail();children(node.children,depth+1);}}}
 children(value.children,0);if(!count)fail();return value;
}
/** XML is parsed inertly and rebuilt as bounded data. Source markup is never inserted. */
export function parseSvgIcon(source){
 if(typeof source!=='string'||source.length>32768||/<!|<\?|(?:href|src)\s*=|url\s*\(/i.test(source))fail();
 const document=new DOMParser().parseFromString(source,'image/svg+xml'),root=document.documentElement;
 if(root.localName!=='svg'||document.querySelector('parsererror'))fail();
 function attrs(node,isRoot=false){const output={};for(const attribute of node.attributes){if(isRoot&&['xmlns','viewBox','width','height','version'].includes(attribute.name))continue;output[attribute.name]=attribute.value;}return output;}
 function nodes(parent){return [...parent.childNodes].flatMap(node=>{if(node.nodeType===8)return [];if(node.nodeType===3){if(node.textContent.trim())fail();return [];}if(node.nodeType!==1)fail();return [{tag:node.localName,attrs:attrs(node),...(node.children.length?{children:nodes(node)}:{})}];});}
 const width=Number((root.getAttribute('width')||'24').replace(/px$/,'')),height=Number((root.getAttribute('height')||'24').replace(/px$/,''));
 const viewBox=root.hasAttribute('viewBox')?root.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number):[0,0,width,height];
 return validateSvgIcon({viewBox,attrs:attrs(root,true),children:nodes(root)});
}
export function createSvgIcon(value){
 validateSvgIcon(value);const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',value.viewBox.join(' '));svg.setAttribute('aria-hidden','true');
 function paint(node,attrs){for(const [key,item]of Object.entries(attrs))node.setAttribute(key,item);}
 function append(parent,nodes){for(const value of nodes){const node=document.createElementNS(ns,value.tag);paint(node,value.attrs);if(value.children)append(node,value.children);parent.append(node);}}
 paint(svg,value.attrs);append(svg,value.children);return svg;
}
