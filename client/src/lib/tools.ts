import type { IconName } from '../components/Icon';
import type { ToolId } from '../types/tool';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  path: string;
  icon: IconName;
  showInTools?: boolean;
}

export const tools: ToolDefinition[] = [
  {
    id: 'popup_banners',
    name: 'Попап-банери',
    description: 'Конструктор попапів, точні товарні вибірки, правила за стікерами й каталогом, розклад та статистика показів.',
    path: '/tools/popup-banners',
    icon: 'popup'
  },
  {
    id: 'online_support',
    name: 'Онлайн-підтримка',
    description: 'Діалоги з покупцями сайту, черга звернень, контакти та налаштування віджета.',
    path: '/tools/online-support',
    icon: 'chat'
  },
  {
    id: 'chat',
    name: 'Чат',
    description: 'Особисті діалоги з колегами та інтерактивні картки справ і публікацій у повідомленнях.',
    path: '/chat',
    icon: 'chat'
  },
  {
    id: 'blog_publications',
    name: 'Публікації блогу',
    description: 'Планування статей, передача матеріалів і контроль публікацій команди.',
    path: '/tools/blog-publications',
    icon: 'blogPublications'
  },
  {
    id: 'applications',
    name: 'Заявки',
    description: 'Обробка заявок з форм, статуси, коментарі, товарний snapshot і шерінг у чат.',
    path: '/tools/applications',
    icon: 'tasks',
    showInTools: false
  },
  {
    id: 'form_builder',
    name: 'Конструктор форм',
    description: 'Форми, банки, поля, дизайн pop-up і скрипти кнопок для Хорошоп.',
    path: '/tools/forms',
    icon: 'formBuilder'
  },
  {
    id: 'used_smartphones_catalog',
    name: 'Каталог смартфонів',
    description: 'Корпоративний каталог вживаних і відновлених смартфонів із залишками, імпортом, публікацією та заявками з вітрини.',
    path: '/catalog/products',
    icon: 'phone',
    showInTools: false
  },
  {
    id: 'trade_in',
    name: 'Trade-in',
    description: 'Окремий простір для сценаріїв попередньої оцінки техніки та майбутньої обробки Trade-in заявок.',
    path: '/trade-in/overview',
    icon: 'tradeIn',
    showInTools: false
  },
  {
    id: 'store_map',
    name: 'Мапа магазинів',
    description: 'Торгові точки, XLSX-імпорт, кастомна SVG-мітка та віджет карти для сайту.',
    path: '/tools/store-map',
    icon: 'location'
  },
  {
    id: 'facebook_group_publications',
    name: 'Публікації у міські Facebook-групи',
    description: 'Підготовка локалізованих промопостів, ручна черга публікацій та історія роботи з міськими Facebook-групами.',
    path: '/tools/facebook-publications',
    icon: 'publication',
    showInTools: true
  },
  {
    id: 'horoshop_related_products',
    name: 'Супутні товари Хорошоп',
    description: 'Імпортований каталог Хорошоп, дерево модифікацій і підготовка супутніх товарів.',
    path: '/tools/horoshop-related-products',
    icon: 'storefront'
  },
  {
    id: 'horoshop_photo_parser',
    name: 'Фото товарів Хорошоп',
    description: 'Вибірки за назвами й артикулами, парсинг фотографій, чернетки модифікацій та публікація у Хорошоп.',
    path: '/tools/horoshop-photo-parser',
    icon: 'savedBanners'
  },
  {
    id: 'banner_grid',
    name: 'Банерна сітка',
    description: 'Створення банерних сіток, робота зі збереженими сітками та окремими банерами.',
    path: '/tools/banner-grid',
    icon: 'bannerGrid'
  },
  {
    id: 'product_selection',
    name: 'Вибірка товарів',
    description: 'Підготовка HTML-блоків із супутніми товарами, банерами та цінами.',
    path: '/tools/product-selection',
    icon: 'productSelection'
  },
  {
    id: 'product_tables',
    name: 'Таблиці товарів',
    description: 'Імпорт XLSX, копіювання характеристик та контроль готовності товарів.',
    path: '/tools/product-tables',
    icon: 'productTables'
  }
];
