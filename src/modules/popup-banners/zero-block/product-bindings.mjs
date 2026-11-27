import {productPrice,productUrl} from './product.mjs';
import {productFieldLabel} from './product-fields.mjs';
import {richTextPlain,richTextFromPlain} from './rich-text.mjs';

export function productPhotos(product){return [...new Set((product?.photoUrls??[product?.photoUrl]).map(productUrl).filter(Boolean))];}
export function documentProductIds(document){return [...new Set([document?.productId,...(document?.elements||[]).filter(item=>item.type==='product').map(item=>item.content.productId)].filter(Boolean))];}
export function hasProductBindings(document){return !!document?.productId||(document?.elements||[]).some(item=>item.action?.type==='product'||item.content.productImage||item.content.richText?.blocks?.some(block=>block.runs.some(run=>run.productField)));}
export function productFieldValue(product,field){if(!product)return '';return field==='price'?productPrice(product.price):field==='availability'?product.availabilityLabel||'Невідомо':String(product[field]||'');}
export function resolveProductText(content,product,clear=false){
 const rich=structuredClone(content.richText||richTextFromPlain(content.text));
 for(const block of rich.blocks)for(const run of block.runs)if(run.productField){run.text=clear?'':product?productFieldValue(product,run.productField):run.text;delete run.productField;}
 return {...content,text:richTextPlain(rich),richText:rich};
}
export function productImageUrl(content,product){
 const image=content.productImage;
 if(!image)return productUrl(content.externalUrl);
 if(image.mode==='main')return productUrl(product?.photoUrl);
 const url=productUrl(image.url);return productPhotos(product).includes(url)?url:null;
}
export function resolveProductElement(element,product){
 const boundText=element.type==='text'&&element.content.richText?.blocks.some(block=>block.runs.some(run=>run.productField));
 const next={...element,content:boundText?resolveProductText(element.content,product):element.content};
 if(element.action?.type==='product')next.action={type:'navigate',url:productUrl(product?.productUrl)||'',target:element.action.target};
 return next;
}
export function bindingDiagnostics(document,products){
 const errors=[],product=products?.[document.productId],add=(elementId,code,message)=>errors.push({...(elementId?{elementId}:{}),code,message});
 if(document.productId&&!product)add(null,'banner_product_unavailable','Прив’язаний товар недоступний у каталозі. Оберіть інший товар або відв’яжіть його.');
 for(const item of document.elements){
  const fields=item.type==='text'&&item.content.richText?.blocks.some(block=>block.runs.some(run=>productFieldLabel(run.productField)));
  if((fields||item.content.productImage||item.action?.type==='product')&&!document.productId)add(item.id,'banner_product_missing','Прив’яжіть товар у налаштуваннях банера.');
  if(fields&&product&&resolveProductText(item.content,product).text.length>5000)add(item.id,'banner_product_text_limit','Текст із даними товару перевищує 5000 символів. Скоротіть текст або кількість вставок.');
  if(item.action?.type==='product'&&product&&!productUrl(product.productUrl))add(item.id,'banner_product_url_missing','У товару немає посилання. Оновіть каталог або змініть дію.');
  if(item.content.productImage&&product&&!productImageUrl(item.content,product))add(item.id,'banner_product_photo_missing','Фото товару недоступне. Оберіть інше фото або оновіть каталог.');
 }
 return errors;
}
/** Returns one new document for one undo operation. Never freezes stale/missing data. */
export function detachBannerProduct(document,products,keep){
 if(keep&&(!products?.[document.productId]||bindingDiagnostics(document,products).length))throw Error('Не вдалося отримати актуальний товар. Оберіть очищення прив’язаних даних.');
 const next=structuredClone(document),product=products?.[document.productId];delete next.productId;
 for(const item of next.elements){
  if(item.type==='text'&&item.content.richText?.blocks.some(block=>block.runs.some(run=>run.productField)))item.content=resolveProductText(item.content,product,!keep);
  if(item.action?.type==='product'){if(keep)item.action={type:'navigate',url:productUrl(product.productUrl),target:item.action.target};else{item.action=null;if(item.role==='link')item.role='decorative';}}
  if(item.content.productImage){const url=keep?productImageUrl(item.content,product):null;delete item.content.productImage;delete item.content.externalUrl;item.content.resourceId=null;if(url)item.content.externalUrl=url;}
 }
 return next;
}
export function bindBannerProduct(document,id){const next=structuredClone(document);if(next.productId!==id)for(const item of next.elements)if(item.content.productImage)item.content.productImage={version:1,mode:'main'};next.productId=id;return next;}
