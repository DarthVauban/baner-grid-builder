import { measureButtonContent,measureTextContent } from '@zero/renderer.mjs';
import type { PopupDocument } from './types';
import {fitDocumentImages} from '@zero/images.mjs';
import { isZeroForm } from '@zero/zero-form.mjs';
import {resolveProductElement} from '@zero/product-bindings.mjs';
import {textValues} from '@zero/text.mjs';
import {buttonValues,isStyledButton} from '@zero/button.mjs';
import {isStyledPromo} from '@zero/promo.mjs';
import type {ProductMap} from '@zero/product-types';

/** Mutates only the cloned draft. The public renderer uses the same measurement. */
export function enforceButtonMinimums(document: PopupDocument, rejectOversized = true, products:ProductMap = {}) {
  fitDocumentImages(document,products);
  for(const item of document.elements.filter(item=>item.type==='text'))for(const device of ['desktop','mobile'] as const){
    const fit=textValues(item.content,device).fit;if(fit==='fixed')continue;
    const measured=measureTextContent(resolveProductElement(item,products[document.productId||'']),device);
    if(measured.width>3000||measured.height>3000){if(rejectOversized)throw new Error('Текст потребує розміру понад 3000 px. Змініть ширину, шрифт або вміст.');continue;}
    const prior=(device==='mobile'?item.mobile:item.desktop)||item.desktop;
    if(prior.width===measured.width&&prior.height===measured.height)continue;
    const box=device==='mobile'?(item.mobile||={...item.desktop}):item.desktop;box.width=measured.width;box.height=measured.height;
  }
  for (const item of document.elements) if (item.type === 'button' || item.type === 'form'||item.type==='product'&&!!products[String(item.content.productId)]||item.type==='promo'&&isStyledPromo(item.content)) {
    for (const device of ['desktop', 'mobile'] as const) {
      const minimum = measureButtonContent(item, device, products);
      if (minimum.width > 3000 || minimum.height > 3000) {
        if (rejectOversized) throw new Error(item.type === 'product' ? 'Товарна картка потребує розміру понад 3000 px. Змініть ширину, шрифт або відступи.' : item.type === 'form' ? 'Форма потребує висоти понад 3000 px. Скоротіть підписи або кількість варіантів.' : 'Підпис кнопки потребує розміру понад 3000 px. Скоротіть підпис або зменште шрифт.');
        continue;
      }
      if(item.type==='button'&&isStyledButton(item.content)){
        const source=(device==='mobile'?item.mobile:item.desktop)||item.desktop,fit=buttonValues(item.content,device).fit;
        const width=fit==='auto-width'?minimum.width:Math.max(minimum.width,source.width),widthChanged=width!==source.width;let height=fit==='fixed'?Math.max(minimum.height,source.height):minimum.height;
        if(source.width===width&&source.height===height)continue;
        const box=device==='mobile'?(item.mobile||={...item.desktop}):item.desktop;box.width=width;
        if(fit!=='fixed'&&widthChanged)height=measureButtonContent(item,device).height;
        if(height>3000){if(rejectOversized)throw new Error('Кнопка потребує висоти понад 3000 px. Скоротіть підпис або змініть ширину.');continue;}
        box.height=height;continue;
      }
      const autoHeight=item.type==='product'||item.type==='form'&&isZeroForm(item.content);
      if (device === 'mobile' && !item.mobile) {
        if (minimum.width <= item.desktop.width && (autoHeight?minimum.height===item.desktop.height:minimum.height<=item.desktop.height)) continue;
        item.mobile = { ...item.desktop };
      }
      const box = device === 'mobile' ? item.mobile! : item.desktop;
      box.width = Math.max(minimum.width, box.width); box.height = autoHeight?minimum.height:Math.max(minimum.height, box.height);
    }
  }
  return document;
}
