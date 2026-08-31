# Документація MT Workspace

Цей індекс визначає призначення документів і допомагає відрізняти поточний стан від планів.
Фактичний код і міграції мають пріоритет, якщо документ тимчасово відстає.

## Поточна система

- [Архітектура](architecture.md) — канонічна карта runtime, модулів, даних, безпеки та розширення.
- [Форми й заявки](application-forms.md) — builder, public embed, submissions і realtime.
- [Мобільна інтеграція](mobile-workspace-integration.md) — pairing, push, mobile approval і QR-вхід.
- [Standalone storefront](standalone-storefront-domain.md) — окремий домен локальної вітрини.
- [Trade-in domain](trade-in-domain.md) — окремий публічний домен Trade-in.
- [Telegram backups](telegram-backups.md) — архіви, розклад і відновлення.

## Хорошоп

- [DOM-контракт desktop/mobile вітрини](horoshop-storefront-dom-contract.md) — обов'язкові правила
  окремих DOM-поверхонь, native cart, selector maps і regression-перевірок.
- [Меню каталогу Хорошоп](horoshop-catalog-menu/README.md) — CSS-only оформлення штатного дерева,
  три теми, install-код і fail-open контракт.
- [Імпорт каталогу й супутні товари](search/HOROSHOP_CATALOG_IMPORT.md) — реалізований контракт.
- [Супутні товари: чинні вимоги](horoshop-related-products/REQUIREMENTS.md) — безпечний Codex-review workflow.
- [Десктопний парсер фото](search/horoshop-photo-desktop-parser.md) — pairing, queue, leases та uploads.

## Intelligent search

- [Поточна/цільова архітектура](search/architecture.md) — межі реалізованого PostgreSQL-контуру й
  майбутнього OpenSearch runtime.
- [План реалізації](search/IMPLEMENTATION_PLAN.md) — актуальний статус етапів.
- [Технічна специфікація](search/TECHNICAL_SPEC.md) — затверджена цільова специфікація; заплановане не
  слід сприймати як уже доступне API.
- [ADR 0001](search/adr/0001-extend-modular-monolith.md) — модульний моноліт.
- [ADR 0002](search/adr/0002-separate-horoshop-catalog.md) — окремий зовнішній каталог.
- [ADR 0003](search/adr/0003-versioned-linguistic-data.md) — immutable rulesets і proposal-only Codex.
- [ADR 0004](search/adr/0004-opt-in-search-infrastructure.md) — opt-in OpenSearch/Redis.

Лінгвістичні політики розміщені у `search-linguistics/policies`. Вони затверджують майбутні правила
даних, але сам search runtime і публікація rulesets ще не реалізовані.

## Правила підтримки документації

- Описуйте реалізовані endpoint-и окремо від запропонованих.
- Після зміни публічного контракту оновлюйте документацію разом із Zod-схемою, serializer, клієнтським
  типом, API-клієнтом і тестом.
- Не копіюйте secrets, raw Horoshop responses, query exports або персональні дані в Markdown.
- Не редагуйте `tmp/`, `dist/`, `storage/` і `test-results/` як документацію: це runtime/generated дані.
- Нові ADR додавайте окремим номером; не переписуйте історичне рішення без позначення superseded.
