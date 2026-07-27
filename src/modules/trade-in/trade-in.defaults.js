const option = (label, value) => ({ id: `option_${value}`, label, value });
const condition = (fieldKey = '', value = '') => ({ fieldKey, operator: 'equals', value });

export const defaultTradeInConfig = {
  version: 1,
  theme: {
    fontFamily: 'Inter',
    backgroundColor: '#f6f7fb',
    surfaceColor: '#ffffff',
    textColor: '#172033',
    mutedColor: '#667085',
    primaryColor: '#6d5dfc',
    primaryTextColor: '#ffffff',
    borderColor: '#e4e7ec',
    successColor: '#0f8a5f',
    maxWidth: 1180,
    borderRadius: 24,
    buttonRadius: 14,
    sectionSpacing: 88
  },
  header: {
    visible: true,
    sticky: true,
    brandName: 'Mobile Trend',
    sectionLabel: 'Trade-in',
    ctaLabel: 'Оцінити пристрій'
  },
  hero: {
    visible: true,
    eyebrow: 'Trade-in у Mobile Trend',
    title: 'Обміняйте стару техніку на нові можливості',
    description: 'Заповніть коротку покрокову анкету. Менеджер отримає характеристики пристрою, підготує попередню оцінку та звʼяжеться з вами.',
    primaryActionLabel: 'Оцінити пристрій',
    secondaryText: 'Фінальна вартість визначається після огляду пристрою',
    badge: 'Попередня оцінка онлайн'
  },
  stats: {
    visible: true,
    items: [
      { id: 'stat_years', value: '15+', label: 'років на українському ринку' },
      { id: 'stat_shops', value: '114+', label: 'магазинів мережі' },
      { id: 'stat_regions', value: '21', label: 'область України' }
    ]
  },
  process: {
    visible: true,
    eyebrow: 'Як це працює',
    title: 'Від анкети до вигідної пропозиції',
    description: 'Проста послідовність без автоматичного заниження вартості.',
    items: [
      { id: 'process_form', title: 'Опишіть пристрій', text: 'Оберіть категорію та вкажіть модель, комплектацію і стан техніки.' },
      { id: 'process_manager', title: 'Отримайте консультацію', text: 'Менеджер перегляне заявку та звʼяжеться з вами для уточнення деталей.' },
      { id: 'process_check', title: 'Пройдіть діагностику', text: 'Остаточна вартість визначається після фізичного огляду пристрою.' }
    ]
  },
  benefits: {
    visible: true,
    eyebrow: 'Чому Mobile Trend',
    title: 'Зрозумілий Trade-in без зайвих кроків',
    items: [
      { id: 'benefit_fast', title: 'Швидкий старт', text: 'Анкета адаптується до категорії та показує лише потрібні питання.' },
      { id: 'benefit_clear', title: 'Чесна комунікація', text: 'Онлайн-анкета є попередньою оцінкою, а не остаточною ціною.' },
      { id: 'benefit_contact', title: 'Живий менеджер', text: 'Після відправлення заявки з вами звʼяжеться спеціаліст Mobile Trend.' }
    ]
  },
  faq: {
    visible: true,
    eyebrow: 'Поширені питання',
    title: 'Що варто знати до оцінки',
    items: [
      { id: 'faq_price', question: 'Чи є онлайн-оцінка остаточною?', answer: 'Ні. Остаточна сума залежить від результатів діагностики та фактичного стану пристрою.' },
      { id: 'faq_data', question: 'Що буде з моїми даними?', answer: 'Контактні дані використовуються для опрацювання Trade-in заявки та зворотного звʼязку.' },
      { id: 'faq_accessories', question: 'Чи впливає комплектація на оцінку?', answer: 'Так, наявність зарядного пристрою, коробки та документів може враховуватися менеджером.' }
    ]
  },
  contact: {
    visible: true,
    eyebrow: 'Готові почати?',
    title: 'Розкажіть про свій пристрій',
    description: 'Почніть анкету зараз — відповіді автоматично потраплять менеджеру.',
    buttonLabel: 'Перейти до анкети'
  },
  footer: {
    visible: true,
    companyName: 'Mobile Trend',
    description: 'Попередня оцінка техніки для Trade-in.',
    phone: '',
    email: '',
    legalText: 'Інформація на сторінці не є публічною офертою.'
  },
  seo: {
    title: 'Trade-in Mobile Trend — попередня оцінка техніки',
    description: 'Оцініть смартфон або ноутбук онлайн та отримайте пропозицію від менеджера Mobile Trend.',
    robots: 'index, follow'
  },
  form: {
    title: 'Попередня оцінка пристрою',
    description: 'Відповідайте чесно — це допоможе менеджеру підготувати точнішу пропозицію.',
    showProgress: true,
    showStepNumbers: true,
    showSummary: true,
    backLabel: 'Назад',
    nextLabel: 'Далі',
    submitLabel: 'Надіслати заявку',
    successTitle: 'Дякуємо! Заявку прийнято',
    successText: 'Менеджер Mobile Trend перегляне відповіді та звʼяжеться з вами.',
    steps: [
      {
        id: 'step_category',
        title: 'Що будемо оцінювати?',
        description: 'Оберіть категорію пристрою.',
        condition: condition(),
        fields: [
          {
            id: 'field_category',
            key: 'category',
            label: 'Категорія',
            type: 'radio',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: [
              option('Смартфон', 'smartphone'),
              option('Смартфон Apple', 'apple'),
              option('Ноутбук', 'laptop')
            ]
          }
        ]
      },
      {
        id: 'step_device',
        title: 'Розкажіть про пристрій',
        description: 'Основні характеристики для попередньої оцінки.',
        condition: condition(),
        fields: [
          {
            id: 'field_operation',
            key: 'operation',
            label: 'Що ви хочете зробити?',
            type: 'radio',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: [option('Обміняти на інший товар', 'exchange'), option('Продати пристрій', 'sell')]
          },
          {
            id: 'field_brand',
            key: 'brand',
            label: 'Бренд',
            type: 'select',
            placeholder: 'Оберіть бренд',
            helpText: '',
            required: true,
            width: 'half',
            showInSummary: true,
            systemFieldType: null,
            condition: { fieldKey: 'category', operator: 'not_equals', value: 'apple' },
            options: [
              option('Samsung', 'Samsung'),
              option('Xiaomi', 'Xiaomi'),
              option('Google', 'Google'),
              option('Lenovo', 'Lenovo'),
              option('HP', 'HP'),
              option('ASUS', 'ASUS'),
              option('Acer', 'Acer'),
              option('Dell', 'Dell'),
              option('Інший', 'other')
            ]
          },
          {
            id: 'field_model',
            key: 'model',
            label: 'Модель',
            type: 'text',
            placeholder: 'Наприклад, Galaxy S24 або MacBook Air M2',
            helpText: 'Вкажіть точну модель, якщо вона відома.',
            required: true,
            width: 'half',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: []
          },
          {
            id: 'field_memory',
            key: 'memory',
            label: 'Обсяг памʼяті',
            type: 'select',
            placeholder: 'Оберіть памʼять',
            helpText: '',
            required: true,
            width: 'half',
            showInSummary: true,
            systemFieldType: null,
            condition: { fieldKey: 'category', operator: 'not_equals', value: 'laptop' },
            options: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'].map((value) => option(value, value))
          },
          {
            id: 'field_sim',
            key: 'sim_type',
            label: 'Тип SIM',
            type: 'radio',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: { fieldKey: 'category', operator: 'equals', value: 'apple' },
            options: [option('Фізична SIM', 'physical'), option('eSIM', 'esim'), option('Фізична SIM + eSIM', 'both')]
          }
        ]
      },
      {
        id: 'step_phone_condition',
        title: 'Стан смартфона',
        description: 'Оцініть зовнішній стан пристрою.',
        condition: { fieldKey: 'category', operator: 'one_of', value: 'smartphone,apple' },
        fields: [
          {
            id: 'field_device_condition',
            key: 'device_condition',
            label: 'Загальний стан пристрою',
            type: 'radio',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: [option('Затертий', 'worn'), option('Нормальний', 'normal'), option('Ідеальний', 'ideal')]
          },
          {
            id: 'field_screen_condition',
            key: 'screen_condition',
            label: 'Стан екрана',
            type: 'radio',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: [option('Розбитий', 'broken'), option('Є подряпини', 'scratched'), option('Ідеальний', 'ideal')]
          },
          {
            id: 'field_battery_health',
            key: 'battery_health',
            label: 'Стан АКБ, %',
            type: 'number',
            placeholder: 'Наприклад, 87',
            helpText: 'Battery Health у налаштуваннях iPhone.',
            required: true,
            width: 'half',
            showInSummary: true,
            systemFieldType: null,
            min: 1,
            max: 100,
            condition: { fieldKey: 'category', operator: 'equals', value: 'apple' },
            options: []
          }
        ]
      },
      {
        id: 'step_laptop_condition',
        title: 'Стан і комплектація ноутбука',
        description: 'Комплектація та дефекти впливають на фінальну оцінку.',
        condition: { fieldKey: 'category', operator: 'equals', value: 'laptop' },
        fields: [
          ...['charger|Є зарядка?', 'box|Є коробка?', 'documents|Є документи?', 'windows|Встановлений Windows?'].map((item) => {
            const [key, label] = item.split('|');
            return {
              id: `field_${key}`,
              key,
              label,
              type: 'radio',
              placeholder: '',
              helpText: '',
              required: true,
              width: 'half',
              showInSummary: true,
              systemFieldType: null,
              condition: condition(),
              options: [option('Так', 'yes'), option('Ні', 'no')]
            };
          }),
          {
            id: 'field_laptop_defects',
            key: 'laptop_defects',
            label: 'Дефекти ноутбука',
            type: 'checkbox',
            placeholder: '',
            helpText: 'Можна обрати кілька варіантів.',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: [option('Корпус', 'body'), option('Дисплей', 'display'), option('Клавіатура', 'keyboard'), option('Дефектів немає', 'none')]
          },
          {
            id: 'field_laptop_battery',
            key: 'laptop_battery',
            label: 'Стан АКБ',
            type: 'radio',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: [option('Слабкий', 'weak'), option('Нормальний', 'normal'), option('Ідеальний', 'ideal')]
          }
        ]
      },
      {
        id: 'step_contacts',
        title: 'Контакти й підсумок',
        description: 'Менеджер використає ці дані тільки для звʼязку щодо Trade-in.',
        condition: condition(),
        fields: [
          {
            id: 'field_first_name',
            key: 'first_name',
            label: 'Імʼя',
            type: 'text',
            placeholder: 'Як до вас звертатися',
            helpText: '',
            required: true,
            width: 'half',
            showInSummary: false,
            systemFieldType: 'first_name',
            condition: condition(),
            options: []
          },
          {
            id: 'field_phone',
            key: 'phone',
            label: 'Номер телефону',
            type: 'phone',
            placeholder: '+380 (__) ___-__-__',
            helpText: '',
            required: true,
            width: 'half',
            showInSummary: false,
            systemFieldType: 'phone',
            condition: condition(),
            options: []
          },
          {
            id: 'field_comment',
            key: 'comment',
            label: 'Коментар',
            type: 'textarea',
            placeholder: 'Що ще варто знати менеджеру?',
            helpText: '',
            required: false,
            width: 'full',
            showInSummary: true,
            systemFieldType: null,
            condition: condition(),
            options: []
          },
          {
            id: 'field_consent',
            key: 'consent',
            label: 'Погоджуюся на обробку контактних даних для зворотного звʼязку щодо Trade-in.',
            type: 'checkbox',
            placeholder: '',
            helpText: '',
            required: true,
            width: 'full',
            showInSummary: false,
            systemFieldType: null,
            condition: condition(),
            options: []
          }
        ]
      }
    ]
  }
};

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function text(value, fallback = '', max = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function boolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeCondition(value) {
  const source = object(value);
  const operators = ['equals', 'not_equals', 'one_of', 'contains', 'answered'];
  return {
    fieldKey: text(source.fieldKey, '', 80),
    operator: operators.includes(source.operator) ? source.operator : 'equals',
    value: text(source.value, '', 500)
  };
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => {
    const source = object(item);
    const label = text(source.label, `Варіант ${index + 1}`, 160);
    return {
      id: text(source.id, `option_${index}_${Date.now()}`, 120),
      label,
      value: text(source.value, label, 120)
    };
  });
}

function normalizeFields(value, keys = new Set()) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item, index) => {
    const source = object(item);
    let key = text(source.key, `field_${index + 1}`, 80).replace(/[^a-zA-Z0-9_]/g, '_');
    if (!key) key = `field_${index + 1}`;
    while (keys.has(key)) key = `${key}_${index + 1}`;
    keys.add(key);
    const types = ['text', 'textarea', 'select', 'radio', 'checkbox', 'email', 'phone', 'number'];
    const systems = ['first_name', 'last_name', 'phone'];
    return {
      id: text(source.id, `field_${index}_${Date.now()}`, 120),
      key,
      label: text(source.label, `Поле ${index + 1}`, 160),
      type: types.includes(source.type) ? source.type : 'text',
      placeholder: text(source.placeholder, '', 180),
      helpText: text(source.helpText, '', 240),
      required: boolean(source.required, false),
      width: source.width === 'half' ? 'half' : 'full',
      showInSummary: boolean(source.showInSummary, false),
      systemFieldType: systems.includes(source.systemFieldType) ? source.systemFieldType : null,
      min: source.min === '' || source.min == null ? null : number(source.min, 0, -1_000_000, 1_000_000),
      max: source.max === '' || source.max == null ? null : number(source.max, 100, -1_000_000, 1_000_000),
      condition: normalizeCondition(source.condition),
      options: normalizeOptions(source.options)
    };
  });
}

function normalizeSteps(value) {
  if (!Array.isArray(value) || value.length === 0) return structuredClone(defaultTradeInConfig.form.steps);
  const keys = new Set();
  return value.slice(0, 30).map((item, index) => {
    const source = object(item);
    return {
      id: text(source.id, `step_${index}_${Date.now()}`, 120),
      title: text(source.title, `Крок ${index + 1}`, 220),
      description: text(source.description, '', 800),
      condition: normalizeCondition(source.condition),
      fields: normalizeFields(source.fields, keys)
    };
  });
}

function normalizeItems(value, defaults, shape) {
  if (!Array.isArray(value)) return structuredClone(defaults);
  return value.slice(0, 30).map((item, index) => {
    const source = object(item);
    return {
      id: text(source.id, `${shape}_${index}_${Date.now()}`, 120),
      ...Object.fromEntries(Object.entries(shape === 'faq'
        ? { question: '', answer: '' }
        : shape === 'stat'
          ? { value: '', label: '' }
          : { title: '', text: '' }).map(([key, fallback]) => [key, text(source[key], fallback, 1200)]))
    };
  });
}

export function normalizeTradeInConfig(value) {
  const source = object(value);
  const theme = object(source.theme);
  const header = object(source.header);
  const hero = object(source.hero);
  const stats = object(source.stats);
  const process = object(source.process);
  const benefits = object(source.benefits);
  const faq = object(source.faq);
  const contact = object(source.contact);
  const footer = object(source.footer);
  const seo = object(source.seo);
  const form = object(source.form);
  const defaults = defaultTradeInConfig;

  return {
    version: 1,
    theme: {
      fontFamily: text(theme.fontFamily, defaults.theme.fontFamily, 80),
      backgroundColor: text(theme.backgroundColor, defaults.theme.backgroundColor, 40),
      surfaceColor: text(theme.surfaceColor, defaults.theme.surfaceColor, 40),
      textColor: text(theme.textColor, defaults.theme.textColor, 40),
      mutedColor: text(theme.mutedColor, defaults.theme.mutedColor, 40),
      primaryColor: text(theme.primaryColor, defaults.theme.primaryColor, 40),
      primaryTextColor: text(theme.primaryTextColor, defaults.theme.primaryTextColor, 40),
      borderColor: text(theme.borderColor, defaults.theme.borderColor, 40),
      successColor: text(theme.successColor, defaults.theme.successColor, 40),
      maxWidth: number(theme.maxWidth, defaults.theme.maxWidth, 720, 1800),
      borderRadius: number(theme.borderRadius, defaults.theme.borderRadius, 0, 60),
      buttonRadius: number(theme.buttonRadius, defaults.theme.buttonRadius, 0, 60),
      sectionSpacing: number(theme.sectionSpacing, defaults.theme.sectionSpacing, 24, 180)
    },
    header: {
      visible: boolean(header.visible, defaults.header.visible),
      sticky: boolean(header.sticky, defaults.header.sticky),
      brandName: text(header.brandName, defaults.header.brandName, 120),
      sectionLabel: text(header.sectionLabel, defaults.header.sectionLabel, 120),
      ctaLabel: text(header.ctaLabel, defaults.header.ctaLabel, 120)
    },
    hero: {
      visible: boolean(hero.visible, defaults.hero.visible),
      eyebrow: text(hero.eyebrow, defaults.hero.eyebrow, 180),
      title: text(hero.title, defaults.hero.title, 300),
      description: text(hero.description, defaults.hero.description, 1200),
      primaryActionLabel: text(hero.primaryActionLabel, defaults.hero.primaryActionLabel, 120),
      secondaryText: text(hero.secondaryText, defaults.hero.secondaryText, 500),
      badge: text(hero.badge, defaults.hero.badge, 160)
    },
    stats: {
      visible: boolean(stats.visible, defaults.stats.visible),
      items: normalizeItems(stats.items, defaults.stats.items, 'stat')
    },
    process: {
      visible: boolean(process.visible, defaults.process.visible),
      eyebrow: text(process.eyebrow, defaults.process.eyebrow, 180),
      title: text(process.title, defaults.process.title, 300),
      description: text(process.description, defaults.process.description, 1200),
      items: normalizeItems(process.items, defaults.process.items, 'process')
    },
    benefits: {
      visible: boolean(benefits.visible, defaults.benefits.visible),
      eyebrow: text(benefits.eyebrow, defaults.benefits.eyebrow, 180),
      title: text(benefits.title, defaults.benefits.title, 300),
      items: normalizeItems(benefits.items, defaults.benefits.items, 'benefit')
    },
    faq: {
      visible: boolean(faq.visible, defaults.faq.visible),
      eyebrow: text(faq.eyebrow, defaults.faq.eyebrow, 180),
      title: text(faq.title, defaults.faq.title, 300),
      items: normalizeItems(faq.items, defaults.faq.items, 'faq')
    },
    contact: {
      visible: boolean(contact.visible, defaults.contact.visible),
      eyebrow: text(contact.eyebrow, defaults.contact.eyebrow, 180),
      title: text(contact.title, defaults.contact.title, 300),
      description: text(contact.description, defaults.contact.description, 1200),
      buttonLabel: text(contact.buttonLabel, defaults.contact.buttonLabel, 120)
    },
    footer: {
      visible: boolean(footer.visible, defaults.footer.visible),
      companyName: text(footer.companyName, defaults.footer.companyName, 160),
      description: text(footer.description, defaults.footer.description, 600),
      phone: text(footer.phone, defaults.footer.phone, 80),
      email: text(footer.email, defaults.footer.email, 160),
      legalText: text(footer.legalText, defaults.footer.legalText, 800)
    },
    seo: {
      title: text(seo.title, defaults.seo.title, 240),
      description: text(seo.description, defaults.seo.description, 500),
      robots: text(seo.robots, defaults.seo.robots, 80)
    },
    form: {
      title: text(form.title, defaults.form.title, 220),
      description: text(form.description, defaults.form.description, 1200),
      showProgress: boolean(form.showProgress, defaults.form.showProgress),
      showStepNumbers: boolean(form.showStepNumbers, defaults.form.showStepNumbers),
      showSummary: boolean(form.showSummary, defaults.form.showSummary),
      backLabel: text(form.backLabel, defaults.form.backLabel, 80),
      nextLabel: text(form.nextLabel, defaults.form.nextLabel, 80),
      submitLabel: text(form.submitLabel, defaults.form.submitLabel, 120),
      successTitle: text(form.successTitle, defaults.form.successTitle, 240),
      successText: text(form.successText, defaults.form.successText, 800),
      steps: normalizeSteps(form.steps)
    }
  };
}

export function matchesTradeInCondition(value, answers = {}) {
  const conditionValue = object(value);
  const key = text(conditionValue.fieldKey, '', 80);
  if (!key) return true;
  const actual = answers[key];
  const expected = text(conditionValue.value, '', 500);
  if (conditionValue.operator === 'answered') {
    return Array.isArray(actual) ? actual.length > 0 : Boolean(String(actual ?? '').trim());
  }
  if (conditionValue.operator === 'not_equals') return String(actual ?? '') !== expected;
  if (conditionValue.operator === 'one_of') {
    return expected.split(',').map((item) => item.trim()).filter(Boolean).includes(String(actual ?? ''));
  }
  if (conditionValue.operator === 'contains') {
    return Array.isArray(actual)
      ? actual.map(String).includes(expected)
      : String(actual ?? '').includes(expected);
  }
  return String(actual ?? '') === expected;
}
