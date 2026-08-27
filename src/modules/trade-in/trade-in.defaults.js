const option = (label, value) => ({ id: `option_${value}`, label, value });
const condition = (fieldKey = '', value = '') => ({ fieldKey, operator: 'equals', value });
const typography = (headingFontSize, bodyFontSize, headingFontWeight = 700, bodyFontWeight = 400) => ({
  headingFontFamily: 'Unbounded',
  headingFontSize,
  headingFontWeight,
  bodyFontFamily: 'Garet',
  bodyFontSize,
  bodyFontWeight
});

export const defaultTradeInConfig = {
  version: 6,
  formReference: {
    formId: '',
    formName: ''
  },
  theme: {
    fontFamily: 'Garet',
    backgroundColor: '#f6f7fb',
    surfaceColor: '#ffffff',
    textColor: '#000000',
    mutedColor: '#667085',
    primaryColor: '#ffe101',
    primaryTextColor: '#000000',
    borderColor: '#e4e7ec',
    successColor: '#000000',
    maxWidth: 1180,
    borderRadius: 24,
    buttonRadius: 14,
    sectionSpacing: 88
  },
  typography: {
    header: typography(17, 12),
    hero: typography(78, 20),
    stats: typography(45, 13, 800),
    process: typography(52, 17),
    form: typography(44, 13),
    benefits: typography(52, 14),
    faq: typography(52, 14),
    contact: typography(52, 16),
    footer: typography(18, 12)
  },
  header: {
    visible: true,
    sticky: true,
    brandName: 'Mobile Trend',
    sectionLabel: 'Trade-in',
    ctaLabel: 'Почати оцінку'
  },
  hero: {
    visible: true,
    eyebrow: 'Trade-in у Mobile Trend',
    title: 'Ваша техніка ще має цінність',
    description: 'Розкажіть нам про пристрій. Ми переглянемо дані, підготуємо попередню оцінку й пояснимо наступний крок — просто, чесно та без складних термінів.',
    primaryActionLabel: 'Почати оцінку',
    secondaryText: 'Онлайн — попередньо. Остаточна вартість — після огляду пристрою.',
    badge: 'Попередня оцінка онлайн'
  },
  stats: {
    visible: true,
    items: [
      { id: 'stat_years', value: '15+', label: 'років допомагаємо розібратися з технікою' },
      { id: 'stat_shops', value: '114+', label: 'магазинів Mobile Trend' },
      { id: 'stat_regions', value: '21', label: 'область України' }
    ]
  },
  process: {
    visible: true,
    eyebrow: 'Усе просто',
    title: 'Від анкети до оцінки — три зрозумілі кроки',
    description: 'Ви розповідаєте про техніку. Ми розбираємося в деталях і пояснюємо, що далі.',
    items: [
      { id: 'process_form', title: 'Розкажіть про пристрій', text: 'Оберіть категорію, вкажіть модель, комплектацію та опишіть стан так, як бачите його Ви. Анкета покаже лише потрібні запитання.' },
      { id: 'process_manager', title: 'Ми переглянемо заявку', text: 'Менеджер перевірить відповіді та звʼяжеться з Вами, якщо потрібно щось уточнити.' },
      { id: 'process_check', title: 'Узгодимо остаточну вартість', text: 'Після огляду пристрою назвемо фінальну суму й пояснимо, від чого вона залежить.' }
    ]
  },
  benefits: {
    visible: true,
    eyebrow: 'Чому Mobile Trend',
    title: 'Trade-in, у якому все зрозуміло',
    items: [
      { id: 'benefit_fast', title: 'Лише потрібні запитання', text: 'Анкета підлаштовується під Ваш пристрій і не змушує відповідати на те, що його не стосується.' },
      { id: 'benefit_contact', title: 'Розбираємося разом', text: 'Заявку переглядає менеджер. Якщо є нюанси — уточнить деталі та все пояснить.' },
      { id: 'benefit_clear', title: 'Чесно про оцінку', text: 'Одразу кажемо: онлайн-оцінка попередня. Остаточна сума залежить від фактичного стану пристрою.' }
    ]
  },
  faq: {
    visible: true,
    eyebrow: 'Відповідаємо просто',
    title: 'Що варто знати про Trade-in',
    items: [
      { id: 'faq_price', question: 'Чи є онлайн-оцінка остаточною?', answer: 'Ні. За анкетою ми готуємо попередню оцінку. Остаточну вартість називаємо після огляду пристрою.' },
      { id: 'faq_factors', question: 'Що впливає на вартість?', answer: 'Модель, обсяг памʼяті, технічний і зовнішній стан, батарея та комплектація. Для різних категорій набір критеріїв відрізняється.' },
      { id: 'faq_unknown_details', question: 'Що робити, якщо я не знаю точну модель або характеристики?', answer: 'Вкажіть те, що знаєте. Решту допоможе уточнити менеджер — розбиратися в усьому самостійно не потрібно.' },
      { id: 'faq_accessories', question: 'Чи потрібні коробка, зарядка та документи?', answer: 'Заявку можна надіслати й без них, але комплектація може вплинути на оцінку. Просто вкажіть, що залишилося.' },
      { id: 'faq_data', question: 'Як використовуватимуть мої контактні дані?', answer: 'Тільки для опрацювання Trade-in заявки та звʼязку з Вами.' }
    ]
  },
  contact: {
    visible: true,
    eyebrow: 'Почнемо?',
    title: 'Розкажіть про техніку — далі допоможемо ми',
    description: 'Кілька хвилин на анкету — і заявка вже у менеджера. Він перегляне деталі, звʼяжеться з Вами та все пояснить.',
    buttonLabel: 'Почати оцінку'
  },
  footer: {
    visible: true,
    companyName: 'Mobile Trend',
    description: 'Свої люди у світі технологій. Допомагаємо розібратися, вибрати та користуватися із задоволенням.',
    phone: '',
    email: '',
    legalText: 'Онлайн-оцінка є попередньою. Остаточна вартість визначається після огляду пристрою. Інформація на сторінці не є публічною офертою.'
  },
  seo: {
    title: 'Trade-in Mobile Trend — оцініть свою техніку онлайн',
    description: 'Розкажіть про свій пристрій. Менеджер Mobile Trend перегляне заявку, підготує попередню оцінку та пояснить наступний крок.',
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

const tradeInFontFamilies = ['Garet', 'Inter', 'Montserrat', 'Roboto', 'Unbounded'];

function normalizeFontFamily(value, fallback) {
  return tradeInFontFamilies.includes(value) ? value : fallback;
}

function normalizeTypography(value, fallback) {
  const source = object(value);
  return {
    headingFontFamily: normalizeFontFamily(source.headingFontFamily, fallback.headingFontFamily),
    headingFontSize: number(source.headingFontSize, fallback.headingFontSize, 8, 120),
    headingFontWeight: number(source.headingFontWeight, fallback.headingFontWeight, 100, 900),
    bodyFontFamily: normalizeFontFamily(source.bodyFontFamily, fallback.bodyFontFamily),
    bodyFontSize: number(source.bodyFontSize, fallback.bodyFontSize, 8, 72),
    bodyFontWeight: number(source.bodyFontWeight, fallback.bodyFontWeight, 100, 900)
  };
}

function normalizeCondition(value) {
  const source = object(value);
  const operators = [
    'equals',
    'not_equals',
    'one_of',
    'contains',
    'answered',
    'not_answered',
    'greater_than',
    'greater_or_equal',
    'less_than',
    'less_or_equal'
  ];
  return {
    fieldKey: text(source.fieldKey, '', 80),
    operator: operators.includes(source.operator) ? source.operator : 'equals',
    value: text(source.value, '', 500)
  };
}

function normalizeConditionGroup(value, legacyCondition) {
  const source = object(value);
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.slice(0, 20).map(normalizeCondition)
    : [];
  if (!conditions.length && legacyCondition?.fieldKey) conditions.push(legacyCondition);
  return {
    combinator: source.combinator === 'any' ? 'any' : 'all',
    conditions
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

function legacyStepsToGraph(steps, successTitle, successText) {
  const start = {
    id: 'form_start',
    type: 'start',
    position: { x: 0, y: 180 },
    title: 'Початок',
    description: '',
    fields: [],
    branches: [],
    defaultBranchLabel: ''
  };
  const finish = {
    id: 'form_finish',
    type: 'finish',
    position: { x: Math.max(1, steps.length + 1) * 360, y: 180 },
    title: successTitle || 'Заявку прийнято',
    description: successText || 'Менеджер Mobile Trend звʼяжеться з вами найближчим часом.',
    fields: [],
    branches: [],
    defaultBranchLabel: ''
  };
  const fieldNodes = steps.map((step, index) => ({
    id: step.id,
    type: 'fields',
    position: { x: (index + 1) * 360, y: 180 },
    title: step.title,
    description: step.description,
    fields: structuredClone(step.fields),
    branches: [],
    defaultBranchLabel: ''
  }));
  const nodes = [start, ...fieldNodes, finish];
  const edges = [];
  let nextEntryId = finish.id;

  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    const fieldNode = fieldNodes[index];
    edges.push({
      id: `edge_${fieldNode.id}_${nextEntryId}`,
      source: fieldNode.id,
      target: nextEntryId,
      sourceHandle: 'next'
    });
    if (step.condition.fieldKey) {
      const conditionNode = {
        id: `condition_${step.id}`,
        type: 'condition',
        position: { x: fieldNode.position.x - 170, y: fieldNode.position.y + 250 },
        title: `Умова: ${step.title}`,
        description: '',
        fields: [],
        branches: [{
          id: `branch_${step.id}`,
          label: 'Умова виконується',
          condition: structuredClone(step.condition),
          conditionGroup: {
            combinator: 'all',
            conditions: [structuredClone(step.condition)]
          }
        }],
        defaultBranchLabel: 'Інші випадки'
      };
      nodes.push(conditionNode);
      edges.push({
        id: `edge_${conditionNode.id}_${fieldNode.id}`,
        source: conditionNode.id,
        target: fieldNode.id,
        sourceHandle: conditionNode.branches[0].id
      });
      edges.push({
        id: `edge_${conditionNode.id}_${nextEntryId}_default`,
        source: conditionNode.id,
        target: nextEntryId,
        sourceHandle: 'default'
      });
      nextEntryId = conditionNode.id;
    } else {
      nextEntryId = fieldNode.id;
    }
  }
  edges.push({
    id: `edge_${start.id}_${nextEntryId}`,
    source: start.id,
    target: nextEntryId,
    sourceHandle: 'next'
  });
  return { nodes, edges };
}

function normalizeFormGraph(value, legacySteps, successTitle, successText) {
  const source = object(value);
  if (!Array.isArray(source.nodes) || source.nodes.length === 0) {
    return legacyStepsToGraph(legacySteps, successTitle, successText);
  }

  const nodeIds = new Set();
  const fieldKeys = new Set();
  const nodeTypes = ['start', 'fields', 'condition', 'information', 'finish'];
  const nodes = source.nodes.slice(0, 100).map((item, index) => {
    const node = object(item);
    let id = text(node.id, `form_node_${index}_${Date.now()}`, 120);
    while (nodeIds.has(id)) id = `${id}_${index + 1}`;
    nodeIds.add(id);
    const type = nodeTypes.includes(node.type) ? node.type : 'fields';
    const position = object(node.position);
    const branchIds = new Set();
    return {
      id,
      type,
      position: {
        x: number(position.x, index * 340, -100_000, 100_000),
        y: number(position.y, 180, -100_000, 100_000)
      },
      title: text(node.title, type === 'start' ? 'Початок' : `Нода ${index + 1}`, 220),
      description: text(node.description, '', 1200),
      fields: type === 'fields' ? normalizeFields(node.fields, fieldKeys) : [],
      branches: type === 'condition' && Array.isArray(node.branches)
        ? node.branches.slice(0, 20).map((item, branchIndex) => {
          const branch = object(item);
          let branchId = text(branch.id, `branch_${index}_${branchIndex}_${Date.now()}`, 120);
          while (branchIds.has(branchId)) branchId = `${branchId}_${branchIndex + 1}`;
          branchIds.add(branchId);
          const legacyCondition = normalizeCondition(branch.condition);
          const conditionGroup = normalizeConditionGroup(branch.conditionGroup, legacyCondition);
          return {
            id: branchId,
            label: text(branch.label, `Варіант ${branchIndex + 1}`, 160),
            condition: conditionGroup.conditions[0] || legacyCondition,
            conditionGroup
          };
        })
        : [],
      defaultBranchLabel: type === 'condition'
        ? text(node.defaultBranchLabel, 'Інші випадки', 160)
        : ''
    };
  });

  const validNodeIds = new Set(nodes.map((node) => node.id));
  const edgeIds = new Set();
  const edges = Array.isArray(source.edges) ? source.edges.slice(0, 300).flatMap((item, index) => {
    const edge = object(item);
    const sourceId = text(edge.source, '', 120);
    const targetId = text(edge.target, '', 120);
    if (!validNodeIds.has(sourceId) || !validNodeIds.has(targetId) || sourceId === targetId) return [];
    let id = text(edge.id, `form_edge_${index}_${Date.now()}`, 120);
    while (edgeIds.has(id)) id = `${id}_${index + 1}`;
    edgeIds.add(id);
    return [{
      id,
      source: sourceId,
      target: targetId,
      sourceHandle: text(edge.sourceHandle, 'next', 120)
    }];
  }) : [];
  const latestEdgeByOutput = new Map();
  edges.forEach((edge, index) => {
    latestEdgeByOutput.set(`${edge.source}\u0000${edge.sourceHandle}`, index);
  });
  const normalizedEdges = edges.filter((edge, index) => (
    latestEdgeByOutput.get(`${edge.source}\u0000${edge.sourceHandle}`) === index
  ));

  if (!nodes.some((node) => node.type === 'start')) {
    nodes.unshift({
      id: 'form_start',
      type: 'start',
      position: { x: 0, y: 180 },
      title: 'Початок',
      description: '',
      fields: [],
      branches: [],
      defaultBranchLabel: ''
    });
  }
  return { nodes, edges: normalizedEdges };
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
  const formReference = object(source.formReference);
  const theme = object(source.theme);
  const typographySettings = object(source.typography);
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
  const usesPreBrandPlatformCopy = Number(source.version || 0) < 5;
  const usesPreSectionTypography = Number(source.version || 0) < 6;
  const pageText = (section, key, fallback, maxLength) => text(
    usesPreBrandPlatformCopy ? fallback : section[key],
    fallback,
    maxLength
  );
  const pageItems = (section, fallback, prefix) => normalizeItems(
    usesPreBrandPlatformCopy ? fallback : section.items,
    fallback,
    prefix
  );
  const legacySteps = normalizeSteps(form.steps);
  const normalizedTheme = {
    fontFamily: usesPreSectionTypography
      ? defaults.theme.fontFamily
      : normalizeFontFamily(theme.fontFamily, defaults.theme.fontFamily),
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
  };
  const usesLegacyPalette = normalizedTheme.textColor.toLowerCase() === '#172033'
    && normalizedTheme.primaryColor.toLowerCase() === '#6d5dfc'
    && normalizedTheme.primaryTextColor.toLowerCase() === '#ffffff'
    && normalizedTheme.successColor.toLowerCase() === '#0f8a5f';
  if (usesLegacyPalette) {
    normalizedTheme.textColor = '#000000';
    normalizedTheme.primaryColor = '#ffe101';
    normalizedTheme.primaryTextColor = '#000000';
    normalizedTheme.successColor = '#000000';
  }

  return {
    version: 6,
    formReference: {
      formId: text(formReference.formId, '', 80),
      formName: text(formReference.formName, '', 160)
    },
    theme: normalizedTheme,
    typography: Object.fromEntries(Object.entries(defaults.typography).map(([key, fallback]) => [
      key,
      usesPreSectionTypography
        ? structuredClone(fallback)
        : normalizeTypography(typographySettings[key], fallback)
    ])),
    header: {
      visible: boolean(header.visible, defaults.header.visible),
      sticky: boolean(header.sticky, defaults.header.sticky),
      brandName: text(header.brandName, defaults.header.brandName, 120),
      sectionLabel: text(header.sectionLabel, defaults.header.sectionLabel, 120),
      ctaLabel: pageText(header, 'ctaLabel', defaults.header.ctaLabel, 120)
    },
    hero: {
      visible: boolean(hero.visible, defaults.hero.visible),
      eyebrow: pageText(hero, 'eyebrow', defaults.hero.eyebrow, 180),
      title: pageText(hero, 'title', defaults.hero.title, 300),
      description: pageText(hero, 'description', defaults.hero.description, 1200),
      primaryActionLabel: pageText(hero, 'primaryActionLabel', defaults.hero.primaryActionLabel, 120),
      secondaryText: pageText(hero, 'secondaryText', defaults.hero.secondaryText, 500),
      badge: pageText(hero, 'badge', defaults.hero.badge, 160)
    },
    stats: {
      visible: boolean(stats.visible, defaults.stats.visible),
      items: pageItems(stats, defaults.stats.items, 'stat')
    },
    process: {
      visible: boolean(process.visible, defaults.process.visible),
      eyebrow: pageText(process, 'eyebrow', defaults.process.eyebrow, 180),
      title: pageText(process, 'title', defaults.process.title, 300),
      description: pageText(process, 'description', defaults.process.description, 1200),
      items: pageItems(process, defaults.process.items, 'process')
    },
    benefits: {
      visible: boolean(benefits.visible, defaults.benefits.visible),
      eyebrow: pageText(benefits, 'eyebrow', defaults.benefits.eyebrow, 180),
      title: pageText(benefits, 'title', defaults.benefits.title, 300),
      items: pageItems(benefits, defaults.benefits.items, 'benefit')
    },
    faq: {
      visible: boolean(faq.visible, defaults.faq.visible),
      eyebrow: pageText(faq, 'eyebrow', defaults.faq.eyebrow, 180),
      title: pageText(faq, 'title', defaults.faq.title, 300),
      items: pageItems(faq, defaults.faq.items, 'faq')
    },
    contact: {
      visible: boolean(contact.visible, defaults.contact.visible),
      eyebrow: pageText(contact, 'eyebrow', defaults.contact.eyebrow, 180),
      title: pageText(contact, 'title', defaults.contact.title, 300),
      description: pageText(contact, 'description', defaults.contact.description, 1200),
      buttonLabel: pageText(contact, 'buttonLabel', defaults.contact.buttonLabel, 120)
    },
    footer: {
      visible: boolean(footer.visible, defaults.footer.visible),
      companyName: text(footer.companyName, defaults.footer.companyName, 160),
      description: pageText(footer, 'description', defaults.footer.description, 600),
      phone: text(footer.phone, defaults.footer.phone, 80),
      email: text(footer.email, defaults.footer.email, 160),
      legalText: pageText(footer, 'legalText', defaults.footer.legalText, 800)
    },
    seo: {
      title: pageText(seo, 'title', defaults.seo.title, 240),
      description: pageText(seo, 'description', defaults.seo.description, 500),
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
      graph: normalizeFormGraph(
        form.graph,
        legacySteps,
        text(form.successTitle, defaults.form.successTitle, 240),
        text(form.successText, defaults.form.successText, 800)
      ),
      steps: legacySteps
    }
  };
}

export function matchesTradeInCondition(value, answers = {}) {
  const conditionValue = object(value);
  const key = text(conditionValue.fieldKey, '', 80);
  if (!key) return true;
  const actual = answers[key];
  const expected = text(conditionValue.value, '', 500);
  const answered = Array.isArray(actual) ? actual.length > 0 : Boolean(String(actual ?? '').trim());
  if (conditionValue.operator === 'answered') return answered;
  if (conditionValue.operator === 'not_answered') return !answered;
  const actualValues = Array.isArray(actual) ? actual.map(String) : [String(actual ?? '')];
  if (conditionValue.operator === 'not_equals') return !actualValues.includes(expected);
  if (conditionValue.operator === 'one_of') {
    const expectedValues = expected.split(',').map((item) => item.trim()).filter(Boolean);
    return actualValues.some((item) => expectedValues.includes(item));
  }
  if (conditionValue.operator === 'contains') {
    return actualValues.some((item) => item.includes(expected));
  }
  if (['greater_than', 'greater_or_equal', 'less_than', 'less_or_equal'].includes(conditionValue.operator)) {
    const actualNumber = Number(actual);
    const expectedNumber = Number(expected);
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
    if (conditionValue.operator === 'greater_than') return actualNumber > expectedNumber;
    if (conditionValue.operator === 'greater_or_equal') return actualNumber >= expectedNumber;
    if (conditionValue.operator === 'less_than') return actualNumber < expectedNumber;
    return actualNumber <= expectedNumber;
  }
  return actualValues.includes(expected);
}

export function matchesTradeInConditionGroup(value, answers = {}) {
  const source = object(value);
  const conditions = Array.isArray(source.conditions)
    ? source.conditions.filter((item) => text(object(item).fieldKey, '', 80))
    : [];
  if (!conditions.length) return false;
  return source.combinator === 'any'
    ? conditions.some((item) => matchesTradeInCondition(item, answers))
    : conditions.every((item) => matchesTradeInCondition(item, answers));
}
