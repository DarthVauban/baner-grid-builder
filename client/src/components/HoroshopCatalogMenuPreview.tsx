import type { HoroshopCatalogMenuThemeId } from '../types/horoshop-catalog-menu';

const rootCategories = [
  ['％', 'Знижки від Тренді'],
  ['▯', 'Смартфони та телефони'],
  ['↺', 'Вживана техніка'],
  ['▰', 'Ноутбуки та планшети'],
  ['◉', 'Смарт-годинники'],
  ['◇', 'Аксесуари для смартфонів'],
  ['⌨', 'Комп’ютери та периферія'],
  ['□', 'Програмне забезпечення'],
  ['⌁', 'Геймінг'],
  ['ϟ', 'Зарядка та живлення'],
  ['◖', 'Навушники та аудіо'],
  ['☀', 'Енергостійкість'],
  ['▣', 'ТВ та Smart TV'],
  ['▧', 'Фото та відео'],
  ['▤', 'Побутова техніка'],
  ['⌁', 'Кабелі та перехідники'],
  ['◈', 'Автотовари']
];

const groups = [
  { title: 'Смартфони', items: ['Apple', 'Samsung', 'Xiaomi', 'Redmi', 'Motorola', 'Tecno', 'Infinix', 'ZTE', 'Poco', 'Doogee', 'Oppo', 'Realme'] },
  { title: 'Захищені смартфони', items: ['Oscal', 'Doogee'] },
  { title: 'Кнопкові телефони', items: ['Nomi', 'Sigma', 'Ergo'] },
  { title: 'Аксесуари', items: ['Чохли', 'Захист екрана', 'Кабелі', 'Зарядні пристрої'] }
];

interface Props {
  themeId: HoroshopCatalogMenuThemeId;
  compact?: boolean;
  viewport?: 'laptop' | 'desktop';
}

export function HoroshopCatalogMenuPreview({ themeId, compact = false, viewport = 'laptop' }: Props) {
  const shownRoots = compact ? rootCategories.slice(0, 7) : rootCategories;
  const shownGroups = compact ? groups.slice(0, 3) : groups;

  return <div className={`catalog-menu-preview is-${themeId} is-${viewport}${compact ? ' is-compact' : ''}`} aria-hidden={compact || undefined}>
    {!compact && <div className="catalog-menu-preview__browser">
      <span /><span /><span /><b>mobiletrend.com.ua</b>
    </div>}
    <div className="catalog-menu-preview__header">
      <span className="catalog-menu-preview__trigger"><i>▦</i> Каталог <b>⌃</b></span>
      <span className="catalog-menu-preview__search">Пошук товарів <i>⌕</i></span>
      <strong className="catalog-menu-preview__logo">MOBILE<br />TREND</strong>
      <span className="catalog-menu-preview__header-dot" />
    </div>
    <div className="catalog-menu-preview__menu">
      <div className="catalog-menu-preview__roots">
        {shownRoots.map(([icon, label], index) => <div className={index === 1 ? 'is-active' : ''} key={label}>
          <span>{icon}</span><b>{label}</b><i>›</i>
        </div>)}
      </div>
      <div className="catalog-menu-preview__content">
        {shownGroups.map((group) => <section key={group.title}>
          <h3>{group.title}</h3>
          <div>{group.items.map((item) => <span key={item}>{item}</span>)}</div>
        </section>)}
      </div>
    </div>
  </div>;
}
