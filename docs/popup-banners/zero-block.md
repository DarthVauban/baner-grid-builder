# Zero Block у MT Workspace

Zero Block відкривається через **Попап-банери → Нова кампанія → Zero Block**. Кампанії відображаються в загальній бібліотеці. Редактор, API та заявки доступні користувачам із чинним доступом до інструмента попап-банерів. Після видалення кампанії її заявки доступні в розділі **Заявки Zero Block**.

## Матриця перенесення

| Контракт KramKin 2.0, e7e44f0 | Реалізація і докази в MT Workspace |
| --- | --- |
| Постійне полотно, сітка і resize 10 px, незалежні desktop/mobile-композиції та placement | [Редактор](../../client/src/popup-banners/zero-block/editor.tsx), [адаптивність](../../src/modules/popup-banners/zero-block/responsive.mjs), [розміщення](../../src/modules/popup-banners/zero-block/placement.mjs), [Chromium](../../tests/e2e/popup-zero-block.spec.ts) |
| Текст, зображення, кнопка, фігура, промокод, форма, таймер | [Документ і діагностика](../../src/modules/popup-banners/zero-block/document.mjs), [властивості](../../client/src/popup-banners/zero-block/element-properties.tsx), [спільний рендерер](../../src/modules/popup-banners/zero-block/renderer.mjs) |
| Типографіка, кольори й градієнти, медіа, mobile overrides та локальне скидання | [Компоненти редактора](../../client/src/popup-banners/zero-block/ui), [токени MT Workspace](../../client/src/popup-banners/zero-block/workspace-theme.css), [медіа в публікації](../../src/modules/popup-banners/zero-block/workspace.js) |
| Шари, групи, множинний вибір, блокування, clipboard, undo/redo і live preview | [Шари](../../src/modules/popup-banners/zero-block/layers.mjs), [clipboard](../../src/modules/popup-banners/zero-block/clipboard.mjs), [історія і перегляд](../../client/src/popup-banners/zero-block/editor.tsx), [Chromium](../../tests/e2e/popup-zero-block.spec.ts) |
| Чернетка, повторне відкриття, ревізії, повтор публікації, пауза, видалення | [API](../../src/modules/popup-banners/zero-block/admin.routes.js), [PostgreSQL](../../src/migrations/115_popup_zero_block.sql), [HTTP-сценарії](../../tests/popup-zero-block.integration.test.js) |
| Стандартне та власне закриття, серверний publish guard, товарні прив’язки, legacy field/product і колишні адаптивні режими | [Валідатор](../../src/modules/popup-banners/zero-block/document.mjs), [товарні прив’язки](../../src/modules/popup-banners/zero-block/product-bindings.mjs), [контракти API](../../tests/popup-zero-block.integration.test.js) |
| Покрокові форми, умовна видимість, промокод, пропозиція або файл після підтвердження, збереження заявок | [Форми](../../src/modules/popup-banners/zero-block/forms.mjs), [винагороди і заявки](../../src/modules/popup-banners/zero-block/submissions.js), [HTTP-сценарії](../../tests/popup-zero-block.integration.test.js) |
| 12 AND-умов, спільний слот денного й сесійного ліміту, часовий пояс, пріоритет, показ на вітрині | [Умови](../../src/modules/popup-banners/zero-block/rules.mjs), [стан відвідувача](../../src/modules/popup-banners/zero-block/rule-state.mjs), [Chromium desktop і mobile](../../tests/e2e/popup-zero-block.spec.ts) |
| Єдиний embed, сумісність та арбітраж із чинними попапами | [Embed](../../src/modules/popup-banners/popup-banner.service.js), [SHA-384 випуск](../../src/modules/horoshop-widgets/widget-release.service.js), [тести публікатора](../../tests/popup-zero-block.integration.test.js) |

## Дії та показ

- Збереження змінює чернетку за її ревізією. Публікація фіксує документ, правила та файли медіа в тій самій транзакції. Повтор ключа операції повертає її початковий ID публікації. Незмінна чернетка на тому самому поколінні підключення повторно використовує знімок.
- Публікація потребує підключеного магазину та валідного документа. Відсутність стандартного або призначеного закриття блокує публікацію. Сервер приймає заявки від активної версії на HTTPS-домені підключення, включно з його формою з www або без www.
- Високий пріоритет застосовується, коли всі умови кампанії виконано. Готова кампанія з вищим пріоритетом може перебрати показ. За рівного пріоритету перевага у Zero Block. Монтування й облік нового показу мають завершитися до закриття чинного попапа.
- Zero Block перемикає режими за шириною 768 CSS px і читає старі композиції з їхніми історичними межами. Для чинних типів діють їхні поточні правила пристроїв. Денний ліміт і розклад рахуються в часовому поясі кампанії, типово Europe/Kyiv. Початок нової сесії визначають 30 хвилин бездіяльності.
- Штатний випуск віджетів зберігає JS Zero Block як дочірній SHA‑384 asset. Для магазину з уже встановленим версійним кодом потрібен випуск, створений версією MT Workspace з підтримкою Zero Block. Код поточного динамічного embed бере runtime з публічного маршруту попапів.

## Відкат

У PostgreSQL Zero Block позначено окремим прапорцем у зарезервованій сім’ї block. API бібліотеки повертає zero_block. Попередні бінарники і старі маршрути пропускають усю сім’ю block, тому відкат програми приховує Zero Block, зберігаючи його чернетки, публікації та заявки. При відкаті лишіть міграцію 115 застосованою. Для магазину з версійним embed можна повернути попередній SHA‑384 код із журналу випусків.

Перенесення охоплює конструктор і створені ним кампанії. Історичні кампанії та заявки KramKin 2.0 залишаються в джерелі.
