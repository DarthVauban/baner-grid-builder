export const storefrontFontFamilies = ['Inter', 'Unbounded', 'Montserrat', 'Roboto'];

export const defaultStorefrontTheme = {
  version: 1,
  typography: {
    bodyFontFamily: 'Inter',
    headingFontFamily: 'Inter',
    bodyWeight: 400,
    headingWeight: 800,
    baseSize: 16
  },
  colors: {
    pageBackground: '#f5f7f6',
    surface: '#ffffff',
    text: '#162033',
    muted: '#788493',
    accent: '#6c5ce7',
    action: '#ffd400',
    border: '#dde5e3'
  },
  layout: {
    maxWidth: 1480,
    pagePaddingDesktop: 54,
    pagePaddingTablet: 24,
    pagePaddingMobile: 14,
    sectionGap: 28,
    catalogGap: 18,
    gridGap: 14,
    filterWidth: 260,
    columnsDesktop: 4,
    columnsTablet: 3,
    columnsMobile: 1
  },
  header: {
    visible: true,
    sticky: false,
    height: 58,
    paddingX: 0,
    paddingY: 0,
    background: '#f5f7f6',
    borderColor: '#f5f7f6',
    borderWidth: 0,
    radius: 0,
    shadow: 'none',
    brandText: 'Mobile Trend',
    brandMark: 'MT',
    logoUrl: '',
    logoLink: '',
    logoHeight: 42,
    brandSize: 15,
    actionVisible: true
  },
  hero: {
    visible: true,
    eyebrowVisible: true,
    eyebrowText: 'USED & REFURBISHED',
    title: 'Смартфони з перевіреним станом',
    subtitle: '',
    alignment: 'left',
    titleSizeDesktop: 35,
    titleSizeMobile: 30,
    paddingX: 0,
    paddingY: 0,
    backgroundStart: '#f5f7f6',
    backgroundEnd: '#f5f7f6',
    gradientAngle: 135,
    radius: 0
  },
  controls: {
    searchPlaceholder: 'iPhone, Samsung, код товару',
    sortVisible: true,
    height: 44,
    radius: 8,
    background: '#ffffff',
    borderColor: '#d9e1e7'
  },
  filters: {
    visible: true,
    sticky: true,
    background: '#ffffff',
    borderColor: '#dde5e3',
    radius: 8,
    padding: 16,
    groupGap: 16,
    shadow: 'soft',
    showCounts: true
  }
};

export const defaultProductCardTheme = {
  version: 1,
  container: {
    background: '#ffffff',
    borderColor: '#dde5e3',
    borderWidth: 1,
    radius: 8,
    padding: 14,
    gap: 12,
    shadow: 'soft',
    hoverShadow: 'strong',
    hoverLift: 2
  },
  image: {
    aspectRatio: '1 / 1',
    fit: 'contain',
    background: '#eef2f4',
    radius: 8,
    padding: 0,
    hoverZoom: 1
  },
  visibility: {
    image: true,
    badge: true,
    brand: true,
    title: true,
    meta: true,
    availability: true,
    modifications: true,
    price: true,
    button: true
  },
  contentOrder: ['image', 'badge', 'brand', 'title', 'meta'],
  badge: {
    textColor: '#2f5e46',
    background: '#e9f6ef',
    radius: 999,
    fontSize: 10,
    fontWeight: 800,
    paddingX: 8,
    paddingY: 5
  },
  typography: {
    brandColor: '#162033',
    brandSize: 14,
    brandWeight: 800,
    titleColor: '#162033',
    titleSize: 14,
    titleWeight: 700,
    titleLines: 2,
    metaColor: '#788493',
    metaSize: 11,
    priceColor: '#1f2f46',
    priceSize: 19,
    priceWeight: 800
  },
  button: {
    label: 'Купити',
    unavailableLabel: 'Немає в наявності',
    background: '#ffd400',
    hoverBackground: '#f5c900',
    textColor: '#111827',
    radius: 9,
    height: 36,
    fontSize: 15,
    fontWeight: 800,
    fullWidth: false
  },
  modifications: {
    mode: 'hover',
    labelColor: '#39465a',
    optionBackground: '#ffffff',
    optionTextColor: '#263248',
    optionBorderColor: '#b8c2ce',
    activeBackground: '#111827',
    activeTextColor: '#ffffff',
    activeBorderColor: '#111827',
    radius: 8,
    optionHeight: 30,
    swatchSize: 34
  }
};

export const defaultProductPageTheme = {
  version: 1,
  layout: { galleryWidth: 50, gap: 22, sectionGap: 22 },
  gallery: {
    background: '#ffffff',
    borderColor: '#dde5e3',
    borderWidth: 1,
    radius: 8,
    padding: 0,
    imageFit: 'contain',
    imageScale: 72,
    thumbnailHeight: 91,
    thumbnailGap: 8,
    showThumbnails: true,
    showArrows: true,
    showCounter: true
  },
  details: {
    background: '#ffffff',
    borderColor: '#dde5e3',
    borderWidth: 1,
    radius: 8,
    padding: 36,
    gap: 24,
    shadow: 'soft'
  },
  visibility: {
    backLink: true,
    meta: true,
    shortDescription: true,
    quickSpecs: true,
    modifications: true,
    tabs: true
  },
  typography: {
    titleColor: '#162033',
    titleSizeDesktop: 52,
    titleSizeMobile: 36,
    titleWeight: 800,
    priceColor: '#111827',
    priceSize: 38,
    priceWeight: 800,
    leadColor: '#667085',
    leadSize: 14
  },
  button: {
    label: 'Оформити заявку',
    unavailableLabel: 'Немає в наявності',
    previewLabel: 'Preview без заявки',
    background: '#6c5ce7',
    hoverBackground: '#5b4bd6',
    textColor: '#ffffff',
    radius: 10,
    height: 50,
    fontSize: 16,
    fontWeight: 800
  },
  tabs: {
    descriptionLabel: 'Опис товару',
    characteristicsLabel: 'Характеристики',
    background: '#ffffff',
    borderColor: '#dde5e3',
    textColor: '#697586',
    activeColor: '#4f46e5',
    radius: 8,
    padding: 42
  }
};

function mergeTheme(defaults, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(defaults);
  const result = structuredClone(defaults);
  for (const [key, candidate] of Object.entries(value)) {
    if (!Object.hasOwn(result, key)) continue;
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate) && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = mergeTheme(result[key], candidate);
    } else {
      result[key] = candidate;
    }
  }
  return result;
}

export function normalizeStorefrontTheme(value) {
  return mergeTheme(defaultStorefrontTheme, value);
}

export function normalizeProductCardTheme(value) {
  const theme = mergeTheme(defaultProductCardTheme, value);
  const requestedOrder = Array.isArray(theme.contentOrder) ? theme.contentOrder : [];
  const validOrder = requestedOrder.filter((item, index) => (
    defaultProductCardTheme.contentOrder.includes(item)
    && requestedOrder.indexOf(item) === index
  ));
  theme.contentOrder = [...validOrder, ...defaultProductCardTheme.contentOrder.filter((item) => !validOrder.includes(item))];
  return theme;
}

export function normalizeProductPageTheme(value) {
  return mergeTheme(defaultProductPageTheme, value);
}
