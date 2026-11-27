/** Data-only field identifiers; no executable templates or catalogue snapshots. */
export const PRODUCT_FIELDS = [['name','Назва товару'],['availability','Наявність'],['price','Ціна'],['article','Артикул']];
export const productFieldLabel = field => PRODUCT_FIELDS.find(([id])=>id===field)?.[1];
export const productFieldText = field => `[${productFieldLabel(field)}]`;
