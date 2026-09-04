# Практичний гайд: розмітка та embed-скрипти для Хорошопа

> **Призначення документа.** Це довідковий технічний контекст для розробника або іншого AI-чату,
> а не самостійне завдання на зміну коду. Конкретну роботу визначає окремий запит користувача.
> Перед реалізацією потрібно звірити наведені селектори з актуальним DOM магазину.

Актуально станом на **2026-09-04**. Документ описує перевірені правила роботи MT Workspace з
публічною вітриною Хорошопа. Канонічним внутрішнім контрактом репозиторію залишається
[horoshop-storefront-dom-contract.md](horoshop-storefront-dom-contract.md).

## 1. Найважливіше правило

**Desktop і mobile у Хорошопі — дві різні DOM- та interaction-поверхні. Mobile не можна вважати
responsive-версією desktop HTML.** Хорошоп може віддавати різну розмітку залежно від User-Agent.

З цього випливає:

1. Для desktop і mobile створюються окремі adapter descriptors із власними root, target і link
   selectors.
2. Не можна переносити desktop-селектор або сценарій кліку на mobile без перевірки mobile HTML.
3. `window.innerWidth`, CSS breakpoint або вузький viewport не визначають тип DOM-поверхні.
4. Мобільна browser-перевірка потребує одночасно mobile User-Agent і mobile viewport.
5. Якщо підтримується лише одна поверхня, межа позначається явно як `desktop-only` або
   `mobile-only`, а код не торкається іншої поверхні.
6. Якщо в DOM одночасно присутні прихований desktop root і активний mobile root, кожен
   обробляється лише своїм адаптером. Видимість або активність перевіряється окремо.

CSS media queries можна використовувати для компонування вже знайденої поверхні, але не для
вибору функціонального DOM-контракту.

## 2. Терміни

- **Surface** — окрема поверхня Хорошопа: `desktop-product`, `mobile-product`, `desktop-card`,
  `mobile-card`, `desktop-cart`, `mobile-cart`.
- **Root** — найвужчий стабільний контейнер, усередині якого дозволено шукати цільові вузли.
- **Target** — нативний вузол, біля якого або всередині якого додається наше оформлення.
- **Adapter descriptor** — централізований опис surface: root, target, link і fallback selectors.
- **Native descriptor** — підтверджені дані для нативної дії Хорошопа: числовий cart ID, тип і
  quantity.
- **Fail-open** — за помилки наш скрипт нічого не змінює, а нативна сторінка продовжує працювати.
- **Fail-closed** — потенційна операція запису не виконується, поки всі дані не підтверджені.

## 3. Поточна карта перевірених поверхонь

| Область | Desktop | Mobile | Ключове правило |
| --- | --- | --- | --- |
| Корінь кошика | `.popup.__cart`, fallback `#cart.popup` | `#cart-drawer.cart`, fallback `#cart-drawer` | Surface визначається root, не viewport |
| Список кошика | `.cart-content`, `.cart-items`, `.cart-section`, `.cart-item` | `.cart__block`, `.cart__body`, mobile cart items | Вертикальний scroll належить внутрішньому списку |
| Рекомендації кошика | `.j-cart-additional`, `.cart-recommended`, `.productsSlider*` | `.cart__related-goods`, `.carousel*`, `.catalog-card--small` | Не підключати desktop carousel controller до mobile |
| CTA оформлення | `.cart-btnOrder .btn` усередині `.cart-foot` | `.cart__order` | Не переносити desktop footer у mobile drawer |
| Головний buy box | `.product-order__block--buy`; fallback `.product-order`, `.product__section--order` | `.product__block--orderBox [data-view-block="orderBox"] .product-card--main[itemprop="offers"] .product-card__buy-button` | Кнопка scoped до головного товару |
| Price box | `.product-price__box`; поточна `.product-price__item` | `.product-card__price-box`; поточна `.product-card__price` | Ціну читати з `meta[itemprop="price"]` |
| Заголовок товару | `h1.product-title[itemprop="name"]` | `h1.heading.heading--xl[itemprop="name"]` | Нативний текст не переписувати |
| Назва товарної картки | `.productsSlider-title`, `.catalogCard-title`, `.productsList-title` | `.catalog-card__title`; URL із `.catalog-card__link[href]` | Пошук лише всередині root картки |
| Назва в кошику | `.popup.__cart .cart-title`; URL із `.cart-title a[href]`, fallback `.cart-image a[href]` | `#cart-drawer .cart-item__link[href]` | Ідентифікація через same-store URL |
| Меню каталогу | `.j-products-menu`, `.productsMenu-*` | не модифікується | Поточний адаптер `desktop-only` |

Це не універсальний список класів Хорошопа. Він фіксує лише перевірені контракти конкретної теми.
Після оновлення теми або платформи селектори потрібно повторно перевірити на live DOM.

## 4. Як починати будь-яку зміну

### Крок 1. Зафіксувати ціль

До кодування потрібно відповісти:

- де має працювати функція: product page, product card, modal, desktop cart чи mobile drawer;
- чи є дія лише візуальною, чи вона змінює кошик/замовлення;
- який нативний вузол має залишитися власником кліку, посилання та стану;
- який контейнер створюється асинхронно або перемальовується Хорошопом.

### Крок 2. Зібрати окремі DOM-докази

Потрібні мінімум два snapshots/fixtures:

- desktop HTML із desktop User-Agent;
- mobile HTML із mobile User-Agent та mobile viewport.

Зберігати треба найменший фрагмент, що містить root, target, product URL/ID та нативну кнопку.
Не копіювати в документацію cookies, токени, персональні дані або повний HTML сторінки.

### Крок 3. Описати адаптери

Замість одного глобального селектора використовувати явну карту:

```js
const adapters = [
  {
    surface: 'desktop-card',
    root: '.catalogCard, .productsList-item',
    target: '.catalogCard-title, .productsList-title',
    link: 'a[href]'
  },
  {
    surface: 'mobile-card',
    root: '.catalog-card',
    target: '.catalog-card__title',
    link: '.catalog-card__link[href]'
  }
];
```

Усі `querySelector` для target/link виконуються від знайденого root. Заборонено шукати глобальний
«перший схожий елемент».

### Крок 4. Визначити політику помилки

- Візуальні покращення — fail-open: не знайдено target, нічого не змінюємо.
- Додавання в кошик та інші записи — fail-closed: без підтвердженого descriptor дія не виконується.
- У будь-якому випадку помилка embed не повинна ламати нативну сторінку Хорошопа.

## 5. Безпечна робота з DOM

### Дозволено

- створювати власні вузли через `document.createElement`;
- додавати текст через `textContent`;
- додавати службові `data-mt-*` атрибути та власні CSS-класи;
- вставляти власний sibling/child, не замінюючи нативний target;
- мінімально переміщати вже наявний вузол лише коли це задокументована частина конкретного
  адаптера;
- зберігати посилання, кнопки й event handlers Хорошопа без змін.

### Заборонено

- переписувати нативний контейнер через `innerHTML`;
- клонувати або замінювати нативну кнопку «Купити»;
- переносити нативні вузли між desktop і mobile roots;
- будувати селектори на випадковому тексті або позиції `:nth-child`, якщо є семантичний атрибут;
- вважати відсутність одного desktop-класу доказом mobile surface;
- приховувати помилку так, що нативне посилання або кошик перестає працювати.

Кожен доданий вузол повинен мати стабільний marker, наприклад:

```html
<span data-mt-title-label="v1" data-mt-label-id="…">Вживаний</span>
```

Повторний запуск скрипта має оновити або пропустити власний вузол, а не створити дублікат.

## 6. Async embed: рекомендована архітектура

У шаблон Хорошопа вставляється лише короткий асинхронний loader:

```html
<script async src="https://workspace.example.com/api/public/module/embed.js?site=PUBLIC_ID"></script>
```

Сам embed повинен:

1. перевірити host магазину;
2. завершитися без DOM-змін, якщо конфігурація невалідна або вимкнена;
3. знищити попередній runtime цієї ж версії;
4. один раз додати style element зі стабільним ID;
5. виконати первинний discovery;
6. повторювати discovery лише після релевантних AJAX-змін;
7. мати `destroy()` для observer і listeners.

Базовий шаблон:

```js
(() => {
  'use strict';

  const runtimeKey = '__mtFeatureV1';
  const styleId = 'mt-feature-v1';
  const previous = window[runtimeKey];
  if (previous?.destroy) previous.destroy();

  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = '[data-mt-feature="v1"]{box-sizing:border-box}';
    document.head.appendChild(style);
  }

  let queued = false;
  const apply = () => {
    queued = false;
    // Окремо застосувати desktop і mobile adapters.
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    Promise.resolve().then(apply);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window[runtimeKey] = {
    destroy() {
      observer.disconnect();
      document.querySelectorAll('[data-mt-feature="v1"]').forEach((node) => node.remove());
    }
  };

  apply();
})();
```

Body-wide observer допустимий лише для discovery динамічних roots і має бути дешевим та
idempotent. Для косметичної ціни дозволений лише observer конкретного price box.

## 7. Сторінка товару і кнопка «Купити»

### Desktop selectors

```css
.product-order__block--buy .j-buy-button-add[id^="j-buy-button-widget-"]
.product-order .j-buy-button-add[id^="j-buy-button-widget-"]
.product__section--order .j-buy-button-add[id^="j-buy-button-widget-"]
```

Стан «у кошику» перевіряється в тих самих roots через
`.j-buy-button-remove[id^="j-buy-button-widget-"]`.

### Mobile selector

```css
.product__block--orderBox [data-view-block="orderBox"]
  .product-card--main[itemprop="offers"]
  .product-card__buy-button > .j-buy-button-add[id^="j-buy-button-widget-"]
```

Допускається fallback усередині `[itemtype$="/Product"] [itemprop="offers"]`, але не глобальний
`.j-buy-button-add`: вище головного buy box можуть бути кнопки рекомендацій.

### Native descriptor

- cart ID береться лише з `id="j-buy-button-widget-<digits>"`;
- SKU, артикул, локальний UUID або `buyId` каталогу не перетворюються на native cart ID;
- `data-quantity` повинно бути валідним числом більше нуля;
- тип береться з `data-cartproducttype`;
- URL, артикул сторінки і native ID перевіряються до операції запису;
- відсутність кнопки сама по собі не доводить стан `out_of_stock`.

Артикул сторінки шукається через налаштований selector, `[itemprop="sku"]`,
`meta[property="product:retailer_item_id"]`, `[data-product-article]` або JSON-LD. Кожен fallback
потрібно перевірити окремо на desktop і mobile HTML.

## 8. Нативний кошик Хорошопа

Для обох поверхонь використовується нативний runtime, якщо присутні обидва методи:

```js
const instance = window.AjaxCart?.getInstance?.();
const cart = [instance, instance?.Cart].find((candidate) => candidate
  && typeof candidate.appendProduct === 'function'
  && typeof candidate.getProductById === 'function');

window.AjaxCart.openCartOnAdd = true;
cart.appendProduct({ type, quantity: Number(quantity), id }, []);
```

Виклик `appendProduct` не є доказом успіху. Протягом поточного timeout `4.5s` потрібно перевірити,
що `getProductById(id, type)` повернув товар або збільшену quantity.

Не можна:

- напряму викликати приватний `_widget/ajax_cart`;
- емулювати native ID;
- створювати приховану proxy-кнопку;
- повторно додавати позицію, якщо native cart або remove-button уже підтверджує її наявність;
- показувати успіх лише тому, що метод не кинув exception.

## 9. Scroll і layout модальних вікон та кошика

Власник вертикального scroll — внутрішній список товарів або сітка, а не весь popup/drawer.

Перевіряти потрібно:

- заголовок і CTA залишаються доступними;
- внутрішній список має визначену доступну висоту та `overflow-y: auto`;
- зовнішній modal не створює другий конкуруючий scrollbar;
- при відкритому modal/drawer фон сторінки не перехоплює touch/wheel scroll;
- закриття або AJAX-видалення desktop popup скидає власний overlay/scroll-lock;
- горизонтальний slider не змінює накопичувальний `margin-left` карток і не пропускає позиції;
- desktop carousel controller не керує mobile carousel.

## 10. Ціни та косметична стара ціна

Desktop і mobile price boxes:

```css
/* desktop */
.product-price__box
.product-price__item

/* mobile */
.product-card__price-box
.product-card__price
```

Правила:

- актуальну числову ціну читати з `meta[itemprop="price"]`;
- стару ціну додавати окремим sibling-вузлом;
- не переміщати й не переписувати нативний price node;
- червоний колір актуальної ціни задавати власним службовим класом;
- не визначати price adapter через viewport;
- observer обмежувати конкретним price box;
- косметична стара ціна ніколи не змінює суму, яку Хорошоп/1С передає до кошика чи замовлення.

У вибірках товарів посилання використовує непрозорий `mt_promo=<uuid>`. Відсоток або сума
надбавки не повинні передаватися відкритими URL-параметрами. Глобальний `promo-loader.js`
встановлюється окремо у desktop і mobile шаблони та перевіряє host/path перед DOM-змінами.

## 11. Лейбли у назвах товарів

Лейбли визначаються серверною same-store URL-мапою, побудованою із синхронізованого каталогу та
стікерів. Це дозволяє показувати їх у кошику, де стікери можуть бути відсутні в DOM.

Adapter families:

- desktop product: `h1.product-title[itemprop="name"]`;
- desktop cards: `.productsSlider-i`, `.catalogCard`, `.productsList-item`;
- desktop cart: `.popup.__cart .cart-item.j-cart-product`, target `.cart-title`;
- mobile product: `h1.heading.heading--xl[itemprop="name"]`;
- mobile cards: `.catalog-card`, target `.catalog-card__title`;
- mobile cart: `#cart-drawer .cart__item.j-cart-product`, target `.cart-item__link[href]`.

Лейбл додається власним `span[data-mt-title-label="v1"]` як перший дочірній вузол. Нативний текст,
посилання і listeners не замінюються. Кольори валідовуються як `#RRGGBB`. Розмір тексту
налаштовується окремо для product page, cards і cart у діапазоні `8–32px`, а потрібне значення
передається через `--mt-label-font-size` відповідно до adapter surface.

## 12. URL та ідентичність товару

Перед будь-яким зіставленням:

1. побудувати URL через `new URL(value, window.location.href)`;
2. нормалізувати `www`/apex відповідно до контракту магазину;
3. відхилити foreign origin;
4. нормалізувати подвійні й кінцеві `/` у path;
5. не втрачати query, якщо він є частиною ідентичності сценарію;
6. не ототожнювати різні модифікації лише через схожу назву.

Для візуального оформлення відсутній мапінг означає fail-open. Для cart action будь-яка
невідповідність URL, SKU, ID або redirect означає fail-closed.

## 13. MutationObserver і життєвий цикл

Хорошоп може створювати, видаляти та перемальовувати кошик, картки й buy box після `DOMContentLoaded`.
Тому embed повинен:

- запускати discovery одразу;
- планувати не більше одного повторного apply на microtask/frame;
- бути idempotent;
- не реагувати нескінченно на власні marker/style зміни;
- перевіряти, що асинхронна ціль усе ще підключена до DOM;
- зупиняти observer/listeners у `destroy()`;
- відстежувати desktop і mobile roots незалежно.

Не використовувати безумовний interval для постійного сканування всього документа.

## 14. Обов’язкове тестування

Кожна зміна embed, selector map, cart flow, scroll або layout повинна мати:

1. окремий desktop fixture;
2. окремий mobile fixture;
3. decoy-кнопку рекомендації перед кнопкою головного товару;
4. позитивний сценарій;
5. негативні сценарії: відсутній native cart, неправильний SKU/ID, невалідна quantity, foreign
   redirect, exception, відсутність підтвердженої cart mutation;
6. already-in-cart сценарій без повторного `appendProduct`;
7. перевірку збереження native links, nodes і event handlers;
8. перевірку AJAX-перемальовування без дублікатів;
9. перевірку власника scroll.

### Мінімальна browser-матриця

| Surface | User-Agent | Viewport | Перевірка |
| --- | --- | --- | --- |
| Desktop laptop | desktop | `1366×768` | popup/cart, CTA, внутрішній scroll, рекомендації |
| Desktop | desktop | `1920×1080` | структура, carousel, overlay lifecycle, cart add |
| Mobile | Android/iOS mobile | близько `390×844` | саме mobile HTML, touch scroll, сітка, cart count/drawer |

JSDOM/regression fixtures не замінюють live-перевірку після зміни теми або runtime Хорошопа.

## 15. Definition of Done

- [ ] Desktop і mobile DOM перевірені окремо.
- [ ] Селектори scoped до правильного root.
- [ ] Нативні links/buttons/listeners не замінені.
- [ ] Повторний запуск не створює дублікати.
- [ ] AJAX redraw відновлює оформлення.
- [ ] Візуальна помилка працює fail-open.
- [ ] Операція запису працює fail-closed.
- [ ] Cart action підтверджена через нативний стан.
- [ ] Внутрішній контейнер є єдиним власником scroll.
- [ ] Є окремі desktop/mobile fixtures і live browser-перевірка.
- [ ] Після зміни селекторів оновлені код, тести й канонічна документація.

## 16. Як передати цей документ в інший чат

Разом із файлом дайте новому чату конкретний запит і, за можливості, screenshots/HTML fragments
обох поверхонь. Рекомендований вступ:

> Прикріплений Markdown — довідковий контракт поточної інтеграції з Хорошопом, а не окреме
> завдання. Використай його як обмеження й джерело перевірених селекторів. Моє актуальне завдання:
> … Перед змінами окремо перевір desktop і mobile DOM; якщо live-розмітка суперечить документу,
> спочатку зафіксуй розбіжність і онови адаптер, fixtures та документацію разом.

Для діагностики бажано додати:

- URL сторінки;
- де відтворюється проблема: desktop/mobile/обидва;
- User-Agent і viewport;
- screenshot;
- мінімальний DOM-фрагмент root/target;
- очікувану та фактичну поведінку;
- чи встановлені інші кастомні глобальні скрипти Хорошопа.

