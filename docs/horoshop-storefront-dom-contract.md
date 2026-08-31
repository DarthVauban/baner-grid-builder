# DOM-контракт вітрини Хорошоп: desktop і mobile

Актуально станом на 2026-08-31. Це канонічний cross-cutting контракт для всіх скриптів, які
вбудовуються у публічну вітрину Хорошопа: `popup-banners`, `horoshop-cart-theme`,
`horoshop-catalog-menu` та майбутніх storefront-адаптерів.

Класи й структура DOM Хорошопа не є нашим публічним API та можуть змінитися після оновлення
платформи або теми. Фактичний код і перевірена розмітка мають пріоритет, але будь-яка розбіжність
із цим документом вважається зміною контракту: код, fixtures, тести й цей документ оновлюються
разом.

## Головне правило

**Мобільна вітрина Хорошопа — окрема DOM- та interaction-поверхня, а не лише responsive-варіант
desktop DOM.**

Звідси випливають обов'язкові правила:

1. Не переносити desktop-селектори, DOM-переміщення або сценарії кліку на mobile без окремої
   перевірки мобільної розмітки.
2. Не визначати surface лише через `innerWidth`, CSS breakpoint або viewport. У поточній вітрині
   Хорошоп може віддавати інший HTML залежно від User-Agent; viewport без mobile User-Agent не є
   валідною мобільною перевіркою.
3. Визначати surface за її семантичним DOM-коренем. Якщо обидва корені присутні одночасно,
   обробляти кожен своїм адаптером і не вважати прихований desktop/mobile корінь активним.
4. Будь-яка інтеграція має або підтримувати й тестувати обидві поверхні, або бути явно позначена
   як `desktop-only` чи `mobile-only` і не змінювати DOM іншої поверхні.
5. Селектори Хорошопа централізуються у відповідному embed-адаптері. Не розкидати альтернативні
   селектори по event handlers і не використовувати глобальний «перший схожий елемент».

CSS media queries дозволено використовувати для візуального компонування вже визначеної
поверхні. Вони не замінюють DOM-discovery та перевірку функціонального сценарію.

## Поточна матриця поверхонь

| Область | Desktop | Mobile | Правило |
| --- | --- | --- | --- |
| Корінь кошика | `.popup.__cart`, fallback `#cart.popup` | `#cart-drawer.cart`, fallback `#cart-drawer` | Surface визначається коренем, а не шириною екрана |
| Затемнення кошика | найближчий `.overlay` | не використовувати desktop overlay-контракт | Стан overlay синхронізується лише з desktop popup |
| Список товарів кошика | `.cart-content`, `.cart-items`, `.cart-section`, `.cart-item` | `.cart__block`, `.cart__body`, mobile cart items | Власником вертикального scroll має бути внутрішній контейнер відповідної surface |
| Рекомендації кошика | `.j-cart-additional`, `.cart-recommended`, `.productsSlider*` | `.cart__related-goods`, `.carousel*`, `.catalog-card--small` | Desktop carousel controller не підключати до mobile carousel |
| Оформлення замовлення | `.cart-btnOrder .btn` у `.cart-foot` | `.cart__order` | Не переносити desktop footer DOM у mobile drawer |
| Головний buy box товару | `.product-order__block--buy`, compatibility fallback-и `.product-order` і `.product__section--order` | `.product__block--orderBox [data-view-block="orderBox"] .product-card--main[itemprop="offers"] .product-card__buy-button` | Кнопка має бути scoped до головного товару |
| Меню каталогу | `.j-products-menu` і `.productsMenu-*` | не модифікується | Поточний catalog-menu adapter є `desktop-only` і обмежений `min-width: 1024px` |

`horoshop-cart-theme` позначає знайдені roots атрибутом `data-mt-cart-surface="desktop|mobile"`.
Він може мінімально перемістити вже наявний desktop footer для компонування, але не відтворює
native markup через `innerHTML` і не замінює нативні вузли, посилання чи event handlers.

## Сторінка товару та кнопка «Купити»

### Desktop

Кнопку головного товару шукаємо в такому порядку:

```css
.product-order__block--buy .j-buy-button-add[id^="j-buy-button-widget-"]
.product-order .j-buy-button-add[id^="j-buy-button-widget-"]
.product__section--order .j-buy-button-add[id^="j-buy-button-widget-"]
```

Для стану «вже в кошику» використовуються ті самі контейнери з
`.j-buy-button-remove[id^="j-buy-button-widget-"]`.

### Mobile

Основна кнопка має бути обмежена mobile order box і `.product-card--main`:

```css
.product__block--orderBox [data-view-block="orderBox"]
  .product-card--main[itemprop="offers"]
  .product-card__buy-button > .j-buy-button-add[id^="j-buy-button-widget-"]
```

Стан «вже в кошику» визначається відповідною `.j-buy-button-remove`. Допускається семантичний
fallback усередині `[itemtype$="/Product"] [itemprop="offers"] .product-card__buy-button`, але не
глобальний `.j-buy-button-add`: перед головним buy box можуть бути кнопки слайдерів або супутніх
товарів.

### Native descriptor

- нативний cart ID береться тільки з `id="j-buy-button-widget-<digits>"`;
- `buyId` із нашого каталогу може бути артикулом/SKU. Ненумерований `buyId` **ніколи** не можна
  передавати в кошик як native ID;
- для додавання `data-quantity` має бути числом більше нуля; заборонено мовчки підставляти `1`;
- тип береться з `data-cartproducttype` (`dataset.cartproducttype`), а не hardcode-иться за
  зовнішньою назвою товару;
- `data-skin` відрізняється між surface (`mobile`, `small_mobile` тощо) і не є ознакою головного
  товару;
- URL рекомендації, артикул сторінки та числовий native ID, якщо він наданий, перевіряються до
  будь-якої операції запису.

Артикул сторінки визначається через налаштований `data-article-selector`, потім через
`[itemprop="sku"]`, `meta[property="product:retailer_item_id"]`, `[data-product-article]` або JSON-LD.
Ці fallback-и є спільними, але їх треба перевіряти окремо на desktop і mobile HTML.

Стан наявності спочатку визначається через
`.product-header__availability--out-of-stock` або `[data-availability="out-of-stock"]`, а далі —
через семантичні `itemprop`, `href`, `data-product-availability`, `data-availability` і текст.
Відсутність buy button сама по собі не означає `out_of_stock`: потрібний вузол може просто мати
іншу структуру на mobile.

## Native cart contract

Для desktop і mobile використовується нативний runtime Хорошопа, якщо він підтримує обидва методи
`appendProduct` і `getProductById`:

```js
const instance = window.AjaxCart?.getInstance?.();
const cart = [instance, instance?.Cart].find((candidate) => candidate
  && typeof candidate.appendProduct === 'function'
  && typeof candidate.getProductById === 'function');

window.AjaxCart.openCartOnAdd = true;
cart.appendProduct({ type, quantity: Number(quantity), id }, []);
```

Факт успішного виклику `appendProduct` ще не означає успіх. Додавання підтверджується тільки після
того, як `getProductById(id, type)` повернув товар або збільшену кількість. Поточний timeout
спостереження — 4,5 секунди.

Заборонено:

- викликати приватний `_widget/ajax_cart` напряму;
- емулювати native ID з артикулу, URL чи локального UUID;
- створювати приховану proxy-кнопку замість перевіреного native descriptor;
- вважати cart operation успішною лише тому, що клік або метод не кинув exception;
- повторно додавати товар, якщо native cart або `.j-buy-button-remove` уже показує його в кошику.

## Discovery та fallback

Безпечний порядок для кнопки в popup-рекомендації:

1. Нормалізувати same-store URL. `www` та apex можуть вважатися одним магазином, але foreign origin
   заборонений; path і query цільового товару мають збігатися точно.
2. Спробувати знайти кнопку у вже наявній картці цього самого товару в поточному DOM.
3. Якщо її немає, виконати same-origin `fetch` сторінки товару з timeout 4,5 секунди. Fetch
   успадковує поточний User-Agent, тому mobile browser має отримати mobile HTML.
4. Перевірити redirect URL, артикул і, коли `buyId` числовий, native ID.
5. Розібрати descriptor за окремими desktop/mobile selector families.
6. Викликати native cart і дочекатися підтвердженої зміни.

Для операцій запису діє **fail-closed**: якщо surface, товар, quantity, ID або native cart не
підтверджені, товар не додається, popup залишається відкритим і показує «Спробувати ще».
Звичайні посилання на назві та фото товару залишаються працездатним fail-open шляхом до його
сторінки. Помилка embed-адаптера не повинна блокувати нативну вітрину.

## Lifecycle і MutationObserver

Кошик та частини сторінки Хорошоп може створювати, видаляти або перемальовувати після завантаження.
Тому адаптер:

- запускає discovery одразу й повторює його після релевантних DOM-змін;
- є idempotent і не додає дублікати style/embed listeners;
- відстежує desktop і mobile roots окремо;
- після закриття/видалення desktop popup скидає власний стан overlay, щоб він не блокував сторінку;
- не реагує нескінченно на власні службові атрибути;
- припиняє асинхронну дію, якщо popup або цільовий host уже видалено.

## Обов'язкова перевірка змін

Кожна зміна Horoshop embed, selector map, cart flow, scroll або layout повинна мати:

1. Окремий desktop fixture і окремий mobile fixture. Один responsive fixture не покриває обидві
   поверхні.
2. Перевірку головного product scope із decoy-кнопкою супутнього товару перед основною кнопкою.
3. Позитивний сценарій і негативні сценарії: відсутній native cart, неправильний артикул/ID,
   невалідна quantity, redirect на інший path, exception та cart без підтвердженої зміни.
4. Перевірку already-in-cart без повторного `appendProduct`.
5. Перевірку збереження native links, nodes і event handlers після підключення теми.
6. Перевірку власника scroll: внутрішній список/сітка прокручується, зовнішній popup не обрізає
   доступний контент, фон сторінки не перехоплює scroll відкритого modal/drawer.
7. Реальну browser-перевірку щонайменше у такій матриці:

| Surface | User-Agent | Viewport | Що перевірити |
| --- | --- | --- | --- |
| Desktop laptop | desktop | `1366×768` | popup/cart уміщується, CTA доступний, список і рекомендації мають правильний scroll |
| Desktop | desktop | `1920×1080` | структура, carousel, overlay lifecycle, додавання в кошик |
| Mobile | mobile Android/iOS | близько `390×844` | саме mobile HTML, сітка popup, touch scroll, native cart count/drawer |

Mobile-перевірка лише через DevTools viewport зі збереженим desktop User-Agent не приймається.
Після зміни теми або platform markup Хорошопа live-перевірка обох поверхонь повторюється, а дата й
нові selectors фіксуються тут разом із regression fixtures.

## Поточне покриття

- `tests/popup-banners.integration.test.js` перевіряє desktop buy box, mobile order box,
  decoy-кнопку, ID/quantity validation, native rejection, already-in-cart і підтверджений cart add;
- `tests/horoshop-cart-theme.integration.test.js` перевіряє обидва корені кошика, збереження markup,
  links та listeners, desktop layout/carousel, mobile scroll і lifecycle overlay;
- `docs/horoshop-catalog-menu/README.md` описує окремий `desktop-only` контракт меню каталогу.

JSDOM fixtures є regression-контрактом репозиторію, але не замінюють live browser-перевірку після
зміни Хорошопом своєї теми або runtime.
