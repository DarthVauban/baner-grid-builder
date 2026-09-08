import { blankDocument, makeBlock, type BlockDocument, type BlockNode } from './block-model';

function text(value: string, size = 16, weight = 400, color = '#252438'): BlockNode {
  const node = makeBlock('text'); node.props.text = value; node.name = value.slice(0, 36) || 'Текст'; Object.assign(node.style, { fontSize: size, fontWeight: weight, color }); return node;
}
export const templateLabels = { blank: 'Чистий аркуш', promotion: 'Промопропозиція', product: 'Товарна картка', form: 'Форма за промокод', countdown: 'Акція з таймером' } as const;
export type TemplateName = keyof typeof templateLabels;
export function createTemplate(name: TemplateName): BlockDocument {
  const document = blankDocument(); document.name = templateLabels[name];
  if (name === 'blank') return document;
  const eyebrow = text('MOBILE TREND · ОСОБЛИВА ПРОПОЗИЦІЯ', 11, 650, '#6554c0'); eyebrow.name = 'Надзаголовок'; eyebrow.style.letterSpacing = 1.2;
  const title = text('Твій наступний улюблений гаджет', 34, 700); title.name = 'Заголовок'; title.style.lineHeight = 1.15; title.mobile.fontSize = 26;
  const body = text('Створи пропозицію, яку захочеться відкрити. Кожен елемент цього банера можна змінити.', 15, 400, '#817c91');
  body.name = 'Опис'; document.root.children = [eyebrow, title, body];
  if (name === 'product') {
    title.props.text = 'Знайди свій iPhone';
    const product = makeBlock('product');
    const details = product.children[1];
    const badge = text('Вигідна ціна', 11, 500, '#6554c0'); badge.name = 'Позначка товару'; badge.props.binding = 'product.badge';
    const variant = text('', 12, 400, '#817c91'); variant.name = 'Характеристики товару'; variant.props.binding = 'product.variant';
    const oldPrice = text('', 12, 400, '#a5a0af'); oldPrice.name = 'Стара ціна'; oldPrice.props.binding = 'product.oldPrice';
    details.children.splice(0, 0, badge); details.children.splice(2, 0, variant, oldPrice);
    document.root.children.push(product);
  } else if (name === 'form') {
    title.props.text = 'Знайомимось? Тобі −10%'; body.props.text = 'Залиш контакти й отримай промокод на першу покупку.';
    const form = makeBlock('form'); form.children[0].name = 'Email';
    const row = makeBlock('container', 'row'); row.name = 'Контактні дані';
    const nameField = makeBlock('field'); nameField.name = 'Ім’я'; nameField.props.fieldType = 'text'; nameField.props.text = 'Твоє ім’я'; nameField.props.placeholder = 'Як до тебе звертатися?';
    row.children = [nameField, form.children[0]]; form.children = [row, form.children[1]];
    const footnote = text('Демонстрація: дані залишаються в цьому прев’ю.', 11, 400, '#817c91');
    document.root.children.push(form, footnote);
  } else if (name === 'countdown') {
    title.props.text = 'Час для приємної покупки'; body.props.text = 'Спеціальна пропозиція діє обмежений час.';
    document.root.children.push(makeBlock('countdown'), makeBlock('coupon'));
    const button = makeBlock('button'); button.props.text = 'Перейти до пропозиції'; document.root.children.push(button);
  } else {
    const columns = makeBlock('container', 'row'); columns.name = 'Переваги';
    for (const [heading, description] of [['01', 'Техніка, що надихає'], ['02', 'Умови, які радують']]) {
      const card = makeBlock('container'); card.name = 'Перевага ' + heading; Object.assign(card.style, { background: '#f5f2fc', radius: 16, paddingTop: 20, paddingRight: 20, paddingBottom: 20, paddingLeft: 20 });
      card.children = [text(heading, 26, 650, '#6554c0'), text(description, 14, 500)]; columns.children.push(card);
    }
    const button = makeBlock('button'); button.props.text = 'Переглянути пропозицію'; document.root.children.push(columns, button);
  }
  return document;
}
