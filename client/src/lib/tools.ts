import type { IconName } from '../components/Icon';
import type { ToolId } from '../types/tool';

export type ToolCategory = 'workspace' | 'horoshop_widgets' | 'horoshop_api';

export interface ToolCategoryDefinition {
  id: ToolCategory;
  name: string;
  description: string;
  icon: IconName;
}

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  path: string;
  icon: IconName;
  category: ToolCategory;
  showInTools?: boolean;
}

export interface WorkspaceSectionDefinition extends Omit<ToolDefinition, 'id'> {
  id: string;
  accessToolId: ToolId;
}

export const toolCategories: ToolCategoryDefinition[] = [
  {
    id: 'workspace',
    name: 'Інструменти робочого простору',
    description: 'Командна робота, контент і локальні інструменти',
    icon: 'tools'
  },
  {
    id: 'horoshop_widgets',
    name: 'Віджети для Хорошопа',
    description: 'Функції, що працюють на вітрині магазину',
    icon: 'storefront'
  },
  {
    id: 'horoshop_api',
    name: 'Керування Хорошопом через API',
    description: 'Каталог, товари й операції магазину',
    icon: 'storefront'
  }
];

export const tools: ToolDefinition[] = [
  {
    id: 'horoshop_stickers',
    name: 'Стікери Хорошоп',
    description: 'Масове додавання та зняття ручних стікерів: вибірки товарів, перегляд змін, історія й повернення операцій.',
    path: '/tools/horoshop-stickers',
    icon: 'productCard',
    category: 'horoshop_api'
  },
  {
    id: 'horoshop_checkout_telegram',
    name: 'Telegram після замовлення',
    description: 'QR-код і кнопка переходу до Telegram-бота на сторінці успішного оформлення замовлення.',
    path: '/tools/horoshop-checkout-telegram',
    icon: 'qrCode',
    category: 'horoshop_widgets'
  },
  {
    id: 'horoshop_title_labels',
    name: 'Лейбли товарів',
    description: 'Конструктор лейблів у назвах товарів за одним або кількома стікерами: сторінка товару, картки вітрини й кошик.',
    path: '/tools/horoshop-title-labels',
    icon: 'productCard',
    category: 'horoshop_widgets'
  },
  {
    id: 'horoshop_cart_theme',
    name: 'Кошик Хорошоп',
    description: 'Широкий кошик із компактним замовленням і великими картками рекомендованих товарів. Окремі теми для десктопа та мобільної версії.',
    path: '/tools/horoshop-cart-theme',
    icon: 'storefront',
    category: 'horoshop_widgets'
  },
  {
    id: 'horoshop_catalog_menu',
    name: 'Меню каталогу Хорошоп',
    description: 'Компактне оформлення чинного меню категорій Хорошоп без зміни дерева, посилань та іконок.',
    path: '/tools/horoshop-catalog-menu',
    icon: 'catalog',
    category: 'horoshop_widgets'
  },
  {
    id: 'popup_banners',
    name: 'Попап-банери',
    description: 'Конструктор попапів, точні товарні вибірки, правила за стікерами й каталогом, розклад та статистика показів.',
    path: '/tools/popup-banners',
    icon: 'popup',
    category: 'horoshop_widgets'
  },
  {
    id: 'online_support',
    name: 'Онлайн-підтримка',
    description: 'Діалоги з покупцями сайту, черга звернень, контакти та налаштування віджета.',
    path: '/tools/online-support',
    icon: 'chat',
    category: 'horoshop_widgets'
  },
  {
    id: 'chat',
    name: 'Чат',
    description: 'Особисті діалоги з колегами та інтерактивні картки справ і публікацій у повідомленнях.',
    path: '/chat',
    icon: 'chat',
    category: 'workspace'
  },
  {
    id: 'blog_publications',
    name: 'Публікації блогу',
    description: 'Планування статей, передача матеріалів і контроль публікацій команди.',
    path: '/tools/blog-publications',
    icon: 'blogPublications',
    category: 'workspace'
  },
  {
    id: 'applications',
    name: 'Заявки',
    description: 'Обробка заявок з форм, статуси, коментарі, товарний snapshot і шерінг у чат.',
    path: '/tools/applications',
    icon: 'tasks',
    category: 'workspace',
    showInTools: false
  },
  {
    id: 'form_builder',
    name: 'Конструктор форм',
    description: 'Прості кастомні форми та покрокові сценарії з окремими редакторами й live preview.',
    path: '/tools/forms',
    icon: 'formBuilder',
    category: 'workspace'
  },
  {
    id: 'used_smartphones_catalog',
    name: 'Каталог смартфонів',
    description: 'Корпоративний каталог вживаних і відновлених смартфонів із залишками, імпортом, публікацією та заявками з вітрини.',
    path: '/catalog/products',
    icon: 'phone',
    category: 'workspace',
    showInTools: false
  },
  {
    id: 'trade_in',
    name: 'Trade-in',
    description: 'Окремий простір для сценаріїв попередньої оцінки техніки та майбутньої обробки Trade-in заявок.',
    path: '/trade-in/overview',
    icon: 'tradeIn',
    category: 'workspace',
    showInTools: false
  },
  {
    id: 'store_map',
    name: 'Мапа магазинів',
    description: 'Торгові точки, XLSX-імпорт, кастомна SVG-мітка та віджет карти для сайту.',
    path: '/tools/store-map',
    icon: 'location',
    category: 'workspace'
  },
  {
    id: 'facebook_group_publications',
    name: 'Публікації у міські Facebook-групи',
    description: 'Підготовка локалізованих промопостів, ручна черга публікацій та історія роботи з міськими Facebook-групами.',
    path: '/tools/facebook-publications',
    icon: 'publication',
    category: 'workspace',
    showInTools: true
  },
  {
    id: 'horoshop_related_products',
    name: 'Супутні товари Хорошоп',
    description: 'Імпортований каталог Хорошоп, дерево модифікацій і підготовка супутніх товарів.',
    path: '/tools/horoshop-related-products',
    icon: 'storefront',
    category: 'horoshop_api'
  },
  {
    id: 'horoshop_photo_parser',
    name: 'Фото товарів Хорошоп',
    description: 'Вибірки за назвами й артикулами, парсинг фотографій, чернетки модифікацій та публікація у Хорошоп.',
    path: '/tools/horoshop-photo-parser',
    icon: 'savedBanners',
    category: 'horoshop_api'
  },
  {
    id: 'banner_grid',
    name: 'Банерна сітка',
    description: 'Створення банерних сіток, робота зі збереженими сітками та окремими банерами.',
    path: '/tools/banner-grid',
    icon: 'bannerGrid',
    category: 'workspace'
  },
  {
    id: 'product_selection',
    name: 'Вибірка товарів',
    description: 'Вибірки із синхронізованого каталогу Хорошоп, async-картки, кнопки купівлі та косметична стара ціна на сторінці товару.',
    path: '/tools/product-selection',
    icon: 'productSelection',
    category: 'horoshop_api'
  }
];

export const workspaceSections: WorkspaceSectionDefinition[] = [
  {
    id: 'form_buttons',
    accessToolId: 'form_builder',
    name: 'Кнопки форм',
    description: 'Кнопки на сторінках товарів Хорошоп: вибір форми, дизайн, розміщення та правила показу за товарами, стікерами або категоріями.',
    path: '/tools/form-buttons',
    icon: 'productPage',
    category: 'horoshop_widgets'
  },
  {
    id: 'promo_codes',
    accessToolId: 'popup_banners',
    name: 'Промокоди',
    description: 'Бібліотека створених у Хорошоп промокодів, строки дії, статуси та кампанії, у яких вони використовуються.',
    path: '/tools/promo-codes',
    icon: 'copy',
    category: 'workspace'
  }
];

export interface HoroshopWidgetDefinition {
  id: string;
  accessToolId: ToolId;
  name: string;
  description: string;
  path: string;
  icon: IconName;
}

export const horoshopWidgetTools: HoroshopWidgetDefinition[] = [
  ...tools.filter((tool) => tool.category === 'horoshop_widgets').map((tool) => ({
    id: tool.id,
    accessToolId: tool.id,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    icon: tool.icon
  })),
  ...workspaceSections.filter((tool) => tool.category === 'horoshop_widgets').map((tool) => ({
    id: tool.id,
    accessToolId: tool.accessToolId,
    name: tool.name,
    description: tool.description,
    path: tool.path,
    icon: tool.icon
  })),
  {
    id: 'product_promo',
    accessToolId: 'product_selection',
    name: 'Промооформлення добірок',
    description: 'Глобальний модуль запускається за mt_promo. Код товарної добірки додається окремо на потрібну сторінку.',
    path: '/tools/product-selection',
    icon: 'productSelection'
  }
];
