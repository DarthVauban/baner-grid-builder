import type { IconName } from '../components/Icon';
import type { ToolId } from '../types/tool';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  path: string;
  icon: IconName;
}

export const tools: ToolDefinition[] = [
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
    icon: 'tasks'
  },
  {
    id: 'form_builder',
    name: 'Конструктор форм',
    description: 'Форми, банки, поля, дизайн pop-up і скрипти кнопок для Хорошоп.',
    path: '/tools/forms',
    icon: 'formBuilder'
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
