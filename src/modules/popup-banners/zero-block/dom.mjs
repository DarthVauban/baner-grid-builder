/** Reorder the same connected nodes, preserving native state where supported. */
export function placeNode(parent,node,before=null){
 if(node.parentNode===parent&&node.nextSibling===before)return;
 if(typeof parent.moveBefore==='function'&&node.parentNode&&node.isConnected===parent.isConnected&&node.getRootNode({composed:true})===parent.getRootNode({composed:true}))parent.moveBefore(node,before);
 else{
  const root=node.getRootNode(),focused=root.activeElement,restore=focused&&node.contains(focused)?focused:null,selection=restore&&'selectionStart'in restore?[restore.selectionStart,restore.selectionEnd]:null;
  parent.insertBefore(node,before);
  if(restore?.isConnected&&restore!==restore.getRootNode().activeElement){restore.focus({preventScroll:true});if(selection&&typeof restore.setSelectionRange==='function')try{restore.setSelectionRange(...selection);}catch{/* Non-text inputs have no caret. */}}
 }
}
export function syncChildren(parent,children,retained=[]){
 const wanted=new Set([...children,...retained]);for(const node of [...parent.childNodes])if(!wanted.has(node))node.remove();
 let before=null;for(const node of [...children].reverse()){placeNode(parent,node,before);before=node;}
}
/** Inert, renderer-owned text markup only; never transfers event handlers or HTML. */
export function syncTextMarkup(target,source){
 const wanted=[];for(const [index,fresh]of [...source.childNodes].entries()){
  let node=target.childNodes[index];
  if(!node||node.nodeType!==fresh.nodeType||node.nodeName!==fresh.nodeName){node=fresh.cloneNode(true);target.insertBefore(node,target.childNodes[index]||null);}
  else if(node.nodeType===3){if(node.data!==fresh.data)node.data=fresh.data;}
  else if(node.nodeType===1){for(const attr of [...node.attributes])if(!fresh.hasAttribute(attr.name))node.removeAttribute(attr.name);for(const attr of fresh.attributes)if(node.getAttribute(attr.name)!==attr.value)node.setAttribute(attr.name,attr.value);syncTextMarkup(node,fresh);}
  wanted.push(node);
 }
 syncChildren(target,wanted);
}
