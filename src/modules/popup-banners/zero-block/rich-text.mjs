import {paintInline,paintForeground} from './paint-runtime.mjs';
import {isPaint} from './paint.mjs';
import {productFieldLabel,productFieldText} from './product-fields.mjs';
/** Small, data-only rich text contract shared by authoring, validation and customer DOM. */
import {ensureRichFonts,runtimeFontFamily,sourceFontFamily} from './text-fonts.mjs';
export const RICH_FONTS=['inherit','Arial','Inter','Roboto','Montserrat','Proxima Nova','Georgia','Verdana','Tahoma','Trebuchet MS','Times New Roman','Courier New'];
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const keys=(value,allowed)=>Object.keys(value).every(key=>allowed.includes(key));
const text=value=>typeof value==='string'&&!/[\u0000-\u0008\u000e-\u001f]/.test(value);
export function safeTextLink(value){
  if(typeof value!=='string'||value.length>2048||/[\u0000-\u0020\u007f\\]/.test(value))return false;
  if(/^\/(?!\/)|^#[^#]/.test(value))return true;
  try{const url=new URL(value);return ['http:','https:','mailto:','tel:'].includes(url.protocol)&&!url.username&&!url.password&&!value.includes('\\');}catch{return false;}
}
export function safeSuccessUrl(value){return value===''||safeTextLink(value)&&!/^mailto:|^tel:/i.test(value);}
/** @returns {{version:1,blocks:{runs:{text:string}[]}[]}} */
export function richTextFromPlain(value=''){const plain=String(value).replace(/\r\n?/g,'\n'),lines=plain.split('\n');return {version:1,blocks:(lines.length>100?[plain]:lines).map(text=>({runs:[{text}]}))};}
export function richTextPlain(value){return typeof value==='string'?value:(value?.blocks||[]).map(block=>(block.runs||[]).map(run=>run.text||'').join('')).join('\n');}
export function validateRichText(value,max=5000){
  if(!object(value)||!keys(value,['version','blocks'])||value.version!==1||!Array.isArray(value.blocks)||value.blocks.length>100)throw new Error('Некоректний форматований текст');
  let size=0,count=0;
  for(const block of value.blocks){
    if(!object(block)||!keys(block,['runs','list','align','indent','lineHeight','letterSpacing'])||!Array.isArray(block.runs)||block.runs.length>300||block.list!==undefined&&!['bullet','ordered'].includes(block.list)||block.align!==undefined&&!['left','center','right','justify'].includes(block.align)||block.indent!==undefined&&(!Number.isInteger(block.indent)||block.indent<0||block.indent>4)||block.lineHeight!==undefined&&(!Number.isFinite(block.lineHeight)||block.lineHeight<.8||block.lineHeight>3)||block.letterSpacing!==undefined&&(!Number.isFinite(block.letterSpacing)||block.letterSpacing< -2||block.letterSpacing>10))throw new Error('Некоректний абзац');
    for(const run of block.runs){
      if(!object(run)||!keys(run,['text','productField','bold','italic','underline','strike','link','color','fontSize','fontFamily','fontWeight','highlight','letterSpacing','script','linkTarget','nofollow','lineColor','lineWidth','collapse'])||!text(run.text)||['bold','italic','underline','strike','nofollow'].some(key=>run[key]!==undefined&&typeof run[key]!=='boolean')||run.link!==undefined&&!safeTextLink(run.link)||['color','highlight','lineColor'].some(key=>run[key]!==undefined&&!isPaint(run[key]))||run.fontSize!==undefined&&(!Number.isFinite(run.fontSize)||run.fontSize<8||run.fontSize>300)||run.fontFamily!==undefined&&!RICH_FONTS.includes(run.fontFamily)||run.fontWeight!==undefined&&(!Number.isInteger(run.fontWeight)||run.fontWeight<100||run.fontWeight>900)||run.letterSpacing!==undefined&&(!Number.isFinite(run.letterSpacing)||run.letterSpacing< -10||run.letterSpacing>100)||run.script!==undefined&&!['super','sub','baseline'].includes(run.script)||run.linkTarget!==undefined&&!['same_tab','new_tab'].includes(run.linkTarget)||run.lineWidth!==undefined&&(!Number.isFinite(run.lineWidth)||run.lineWidth<0||run.lineWidth>20))throw new Error('Некоректне форматування');
      if(run.collapse!==undefined){const c=run.collapse;if(!object(c)||!keys(c,['expand','collapse','color','underline'])||!text(c.expand)||!c.expand.trim()||c.expand.length>80||!text(c.collapse)||c.collapse.length>80||c.color!==undefined&&!isPaint(c.color)||!['none','solid','dashed','dotted'].includes(c.underline))throw new Error('Некоректне згортання тексту');}
      if(run.productField!==undefined&&(!productFieldLabel(run.productField)||run.text!==productFieldText(run.productField)))throw Error('Некоректне поле товару');
      size+=run.text.length;if(++count>1500||size>max)throw new Error(`Текст — до ${max} символів`);
    }
  }
  return value;
}
/** Never injects owner HTML, style strings, event handlers or external embeds. */
export function renderRichText(target,value,options={}){
  target.replaceChildren();if(!value)return;validateRichText(value,options.maxLength||5000);ensureRichFonts(value,options.apiBase);let list=null,listKind='';
  for(const block of value.blocks){
    const node=document.createElement(block.list?'li':'p');node.style.margin='0';
    if(block.align)node.style.textAlign=block.align;if(block.indent)node.style.marginInlineStart=`${block.indent*1.5}em`;if(block.lineHeight)node.style.lineHeight=String(block.lineHeight);if(block.letterSpacing!==undefined)node.style.letterSpacing=`${block.letterSpacing}px`;
    let collapsed=null,collapseKey='';
    for(const run of block.runs){
      const link=run.link&&(options.interactive!==false||options.editing),span=document.createElement(link?'a':'span');span.textContent=run.text;
      if(run.productField&&options.editing){span.dataset.productField=run.productField;span.contentEditable='false';span.setAttribute('aria-label',`Поле товару: ${productFieldLabel(run.productField)}`);span.style.outline='1px dashed currentColor';span.style.borderRadius='3px';}
      if(run.bold)span.style.fontWeight='700';if(run.fontWeight){span.style.fontWeight=String(run.fontWeight);if(options.editing)span.dataset.richWeight=String(run.fontWeight);}if(run.italic)span.style.fontStyle='italic';span.style.textDecoration=[run.underline?'underline':'',run.strike?'line-through':''].filter(Boolean).join(' ');
      if(run.color)span.style.color=run.color;if(run.highlight)span.style.backgroundColor=run.highlight;if(run.fontSize)span.style.fontSize=`${run.fontSize*(options.scale||1)}px`;if(run.fontFamily&&run.fontFamily!=='inherit')span.style.fontFamily=runtimeFontFamily(run.fontFamily);if(run.letterSpacing!==undefined)span.style.letterSpacing=`${run.letterSpacing*(options.scale||1)}px`;if(run.script){span.style.verticalAlign=run.script;span.style.fontSize=run.script==='baseline'?'inherit':'.75em';}
      if(run.lineColor)span.style.textDecorationColor=run.lineColor;if(run.lineWidth!==undefined){span.style.textDecorationLine=run.lineWidth?'underline':'none';span.style.textDecorationThickness=`${run.lineWidth}px`;}
      if(link){span.href=run.link;span.target=run.linkTarget==='new_tab'?'_blank':'_self';span.rel=['noopener','noreferrer',run.nofollow?'nofollow':''].filter(Boolean).join(' ');span.style.color=run.color||'inherit';if(options.editing){span.tabIndex=-1;span.addEventListener('click',event=>event.preventDefault());}}
      paintInline(span,run);
      if(run.collapse){
        const key=JSON.stringify(run.collapse);
        if(options.editing){span.dataset.richCollapse=key;node.append(span);}
        else if(options.interactive!==false){
          if(key!==collapseKey){const c=run.collapse,wrap=document.createElement('span'),body=document.createElement('span'),button=document.createElement('button');body.hidden=true;button.type='button';button.textContent=c.expand;button.setAttribute('aria-expanded','false');button.style.cssText='border:0;padding:0;background:transparent;font:inherit;cursor:pointer';button.style.color=c.color||'inherit';if(c.color)paintForeground(button,c.color);button.style.textDecoration=c.underline==='none'?'none':`underline ${c.underline}`;button.addEventListener('click',event=>{event.stopPropagation();body.hidden=!body.hidden;button.textContent=body.hidden?c.expand:c.collapse||c.expand;button.setAttribute('aria-expanded',String(!body.hidden));});wrap.append(body,button);node.append(wrap);collapsed=body;collapseKey=key;}
          collapsed.append(span);
        }else node.append(span);
      }else{collapseKey='';collapsed=null;node.append(span);}
    }
    if(!node.textContent)node.append(document.createElement('br'));
    if(block.list){if(listKind!==block.list){list=document.createElement(block.list==='bullet'?'ul':'ol');list.style.margin='0';target.append(list);listKind=block.list;}list.append(node);}else{listKind='';list=null;target.append(node);}
  }
}
const colorHex=value=>{if(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value))return value.toUpperCase();const rgb=value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);return rgb?'#'+rgb.slice(1,4).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join('').toUpperCase()+(rgb[4]!==undefined?Math.round(Math.min(1,Number(rgb[4]))*255).toString(16).padStart(2,'0').toUpperCase():''):undefined;};
/** Converts the editable DOM/paste to the same allowlist; markup is never a stored value. */
export function richTextFromDom(root,options={}){
  const blocks=[];let current=null;
  function block(node,list,defaults={}){const style=node.style||{};const result={...defaults,runs:[]};if(list)result.list=list;if(['left','center','right','justify'].includes(style.textAlign))result.align=style.textAlign;const lh=Number(style.lineHeight);if(lh>=.8&&lh<=3)result.lineHeight=lh;const ls=parseFloat(style.letterSpacing);if(ls>=-2&&ls<=10)result.letterSpacing=ls;const indent=parseFloat(style.marginInlineStart)/1.5;if(Number.isInteger(indent)&&indent>=1&&indent<=4)result.indent=indent;blocks.push(result);return result;}
  const blockTags=['P','DIV','LI','H1','H2','H3','H4','BLOCKQUOTE'];
  function marksFor(node,marks){const tag=node.tagName;
    const next={...marks},style=node.style||{};if(style.fontWeight&&Number(style.fontWeight)<600||style.fontWeight==='normal')delete next.bold;if(style.fontStyle==='normal')delete next.italic;if(style.textDecoration==='none'){delete next.underline;delete next.strike;}if(['B','STRONG'].includes(tag)||Number(style.fontWeight)>=600)next.bold=true;if(['I','EM'].includes(tag)||style.fontStyle==='italic')next.italic=true;if(tag==='U'||style.textDecoration.includes('underline'))next.underline=true;if(['S','STRIKE','DEL'].includes(tag)||style.textDecoration.includes('line-through'))next.strike=true;
    if(style.fontWeight==='inherit'){delete next.fontWeight;delete next.bold;}const weight=Number(style.fontWeight);if(weight>=100&&weight<=900&&Number.isInteger(weight))next.fontWeight=weight;
    if(style.fontWeight==='normal'){delete next.bold;next.fontWeight=400;}if(style.fontWeight==='bold'){next.bold=true;delete next.fontWeight;}
    if(['B','STRONG'].includes(tag)&&!style.fontWeight){next.bold=true;delete next.fontWeight;}
    const explicitWeight=Number(node.dataset.richWeight);if(Number.isInteger(explicitWeight)&&explicitWeight>=100&&explicitWeight<=900){next.fontWeight=explicitWeight;if(explicitWeight<600)delete next.bold;}
    const link=tag==='A'?node.getAttribute('href'):undefined;if(link&&safeTextLink(link)){next.link=link;if(node.target==='_blank')next.linkTarget='new_tab';if(node.rel?.split(/\s+/).includes('nofollow'))next.nofollow=true;}
    const color=isPaint(node.dataset.richPaintColor)?node.dataset.richPaintColor:node.dataset.kkInheritedPaint?undefined:colorHex(style.color||node.getAttribute('color')||'');if(color)next.color=color;
    const size=parseFloat(style.fontSize)/(options.scale||1);if(size>=8&&size<=300&&style.fontSize.endsWith('px'))next.fontSize=size;
    const highlight=isPaint(node.dataset.richPaintHighlight)?node.dataset.richPaintHighlight:colorHex(style.backgroundColor||'');if(highlight)next.highlight=highlight;
    const spacing=parseFloat(style.letterSpacing)/(options.scale||1);if(spacing>=-10&&spacing<=100)next.letterSpacing=spacing;
    if(['super','sub','baseline'].includes(style.verticalAlign))next.script=style.verticalAlign;else if(tag==='SUP'||tag==='SUB')next.script=tag==='SUP'?'super':'sub';
    const lineColor=isPaint(node.dataset.richPaintLineColor)?node.dataset.richPaintLineColor:colorHex(style.textDecorationColor||'');if(lineColor)next.lineColor=lineColor;const lineWidth=parseFloat(style.textDecorationThickness);if(lineWidth>=0&&lineWidth<=20)next.lineWidth=lineWidth;
    if(node.dataset.richCollapse){try{next.collapse=JSON.parse(node.dataset.richCollapse);}catch{/* Invalid paste metadata is discarded. */}}
    if(node.dataset.richClearWeight==='true'){delete next.fontWeight;delete next.bold;}
    const family=sourceFontFamily((style.fontFamily||node.getAttribute('face')||'').replace(/^["']|["']$/g,''));if(RICH_FONTS.includes(family))next.fontFamily=family;
    if(node.dataset.richClear==='true')for(const key of Object.keys(next))delete next[key];
    return next;
  }
  function visit(node,marks={},list,defaults={}){
    if(node.nodeType===3){if(!node.textContent)return;current||=block(root,list,defaults);current.runs.push({...marks,text:node.textContent});return;}
    if(node.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','TEMPLATE','BUTTON'].includes(node.tagName))return;
    const tag=node.tagName,next=marksFor(node,marks),inherited={...defaults};if(['left','center','right','justify'].includes(node.style?.textAlign))inherited.align=node.style.textAlign;
    if(productFieldLabel(node.dataset.productField)){current||=block(root,list,defaults);current.runs.push({...next,text:productFieldText(node.dataset.productField),productField:node.dataset.productField});return;}
    if(tag==='UL'||tag==='OL'){current=null;for(const child of node.children)visit(child,next,tag==='UL'?'bullet':'ordered',inherited);current=null;return;}
    if(blockTags.includes(tag)){current=null;if(!node.childNodes.length)block(node,list,inherited);for(const child of node.childNodes){if(child.nodeType===1&&(blockTags.includes(child.tagName)||['UL','OL'].includes(child.tagName))){current=null;visit(child,next,list,inherited);current=null;}else{current||=block(node,list,inherited);visit(child,next,list,inherited);}}current=null;return;}
    if(tag==='BR'){current||=block(root,list,defaults);if(current.runs.length)current.runs.push({text:'\n'});return;}
    for(const child of node.childNodes)visit(child,next,list,defaults);
  }
  for(const child of root.childNodes)visit(child);
  const value={version:1,blocks:blocks.length?blocks:[{runs:[{text:''}]}]};validateRichText(value);return value;
}
/** A detached template keeps embedded resources inert while the allowlist is read. */
export function richTextFromHtml(html){const template=document.createElement('template');template.innerHTML=html;return richTextFromDom(template.content);}
