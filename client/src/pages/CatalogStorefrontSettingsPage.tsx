import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CatalogThemeDeviceSwitch,
  CatalogThemePreview,
  ThemeColorField,
  ThemeRangeField,
  ThemeSection,
  ThemeSelectField,
  ThemeTextField,
  ThemeToggle,
  type CatalogThemeDevice
} from '../components/CatalogThemeBuilder';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { api } from '../lib/api';
import {
  cloneStorefrontTheme,
  defaultProductCardTheme,
  defaultStorefrontTheme,
  fontWeightOptions,
  storefrontFontOptions
} from '../lib/storefront-theme';
import { useToast } from '../toast/ToastContext';
import type { CatalogStorefrontTheme } from '../types/catalog';

const shadowOptions = [
  { value: 'none', label: 'Без тіні' },
  { value: 'soft', label: 'М’яка' },
  { value: 'strong', label: 'Виразна' }
];

export function CatalogStorefrontSettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settings = useQuery({ queryKey: ['catalog-storefront-settings'], queryFn: api.catalog.storefrontSettings });
  const forms = useQuery({ queryKey: ['forms'], queryFn: api.forms.list });
  const saveSettings = useMutation({ mutationFn: api.catalog.updateStorefrontSettings });
  const [theme, setTheme] = useState<CatalogStorefrontTheme>(() => cloneStorefrontTheme());
  const [formId, setFormId] = useState('');
  const [origin, setOrigin] = useState('');
  const [device, setDevice] = useState<CatalogThemeDevice>('desktop');
  const [savedSnapshot, setSavedSnapshot] = useState('');

  useEffect(() => {
    if (!settings.data) return;
    const nextTheme = cloneStorefrontTheme(settings.data.storefrontTheme);
    setTheme(nextTheme);
    setFormId(settings.data.selectedFormPublicId || '');
    setOrigin(settings.data.publicOrigin || '');
    setSavedSnapshot(JSON.stringify({ theme: nextTheme, formId: settings.data.selectedFormPublicId || '', origin: settings.data.publicOrigin || '' }));
  }, [settings.data]);

  const currentSnapshot = useMemo(() => JSON.stringify({ theme, formId, origin }), [formId, origin, theme]);
  const hasUnsavedChanges = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const cardTheme = settings.data?.productCardTheme || defaultProductCardTheme;
  const publishedForms = (forms.data || []).filter((form) => form.status === 'published');

  function updateTheme<K extends keyof CatalogStorefrontTheme>(section: K, value: CatalogStorefrontTheme[K]) {
    setTheme((current) => ({ ...current, [section]: value }));
  }

  async function submit() {
    try {
      const saved = await saveSettings.mutateAsync({
        selectedFormPublicId: formId || null,
        publicOrigin: origin,
        storefrontTheme: theme
      });
      const nextTheme = cloneStorefrontTheme(saved.storefrontTheme);
      setTheme(nextTheme);
      setSavedSnapshot(JSON.stringify({ theme: nextTheme, formId: saved.selectedFormPublicId || '', origin: saved.publicOrigin || '' }));
      await queryClient.invalidateQueries({ queryKey: ['catalog-storefront-settings'] });
      showToast('Дизайн вітрини збережено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти дизайн вітрини.', 'error');
    }
  }

  function resetTheme() {
    setTheme(cloneStorefrontTheme(defaultStorefrontTheme));
  }

  return <div className="catalog-theme-page">
    <section className="task-toolbar catalog-theme-page__header">
      <div><p className="eyebrow">Storefront builder</p><h1>Налаштування вітрини</h1><p>Глобальний стиль, компонування каталогу, шапка, hero, пошук і фільтри.</p></div>
      <div className="task-toolbar__controls">
        <span className={`catalog-unsaved-badge${hasUnsavedChanges ? '' : ' catalog-unsaved-badge--hidden'}`} aria-hidden={!hasUnsavedChanges}><Icon name="schedule" size={15} /> Незбережені зміни</span>
        <a className="button button--secondary" href="/catalog/preview/storefront" target="_blank" rel="noreferrer"><Icon name="openInNew" size={16} /> Відкрити preview</a>
        <button className="button button--secondary" type="button" onClick={resetTheme}><Icon name="reply" size={16} /> Стандартна тема</button>
        <button className="button button--primary" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}><Icon name="save" size={16} /> Зберегти</button>
      </div>
    </section>

    {settings.isError ? <section className="catalog-placeholder"><h2>Не вдалося завантажити налаштування</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><button className="button button--secondary" type="button" onClick={() => void settings.refetch()}>Повторити</button></section>
      : settings.isLoading ? <section className="catalog-placeholder"><h2>Завантаження конструктора…</h2></section> : <div className="catalog-theme-builder">
      <div className="catalog-theme-builder__controls">
        <ThemeSection title="Підключення" description="Форма замовлення та публічна адреса вітрини.">
          <label className="field catalog-theme-control--wide"><span>Форма заявок</span><StyledSelect value={formId} options={[{ value: '', label: 'Не обрано' }, ...publishedForms.map((form) => ({ value: form.publicId, label: form.name }))]} onChange={(value) => setFormId(String(value))} /></label>
          <ThemeTextField label="Публічний origin" value={origin} placeholder="https://example.com" onChange={setOrigin} />
        </ThemeSection>

        <ThemeSection title="Типографіка" description="Чотири оптимізовані Google Fonts. Unbounded доступний у всіх вагах 200–900.">
          <ThemeSelectField label="Основний шрифт" value={theme.typography.bodyFontFamily} options={storefrontFontOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, bodyFontFamily: value as CatalogStorefrontTheme['typography']['bodyFontFamily'] })} />
          <ThemeSelectField label="Шрифт заголовків" value={theme.typography.headingFontFamily} options={storefrontFontOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, headingFontFamily: value as CatalogStorefrontTheme['typography']['headingFontFamily'] })} />
          <ThemeSelectField label="Вага основного" value={String(theme.typography.bodyWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, bodyWeight: Number(value) })} />
          <ThemeSelectField label="Вага заголовків" value={String(theme.typography.headingWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, headingWeight: Number(value) })} />
          <ThemeRangeField label="Базовий розмір" value={theme.typography.baseSize} min={12} max={22} onChange={(value) => updateTheme('typography', { ...theme.typography, baseSize: value })} />
        </ThemeSection>

        <ThemeSection title="Кольори" description="Базові токени використовуються всіма елементами вітрини.">
          <ThemeColorField label="Фон сторінки" value={theme.colors.pageBackground} onChange={(value) => updateTheme('colors', { ...theme.colors, pageBackground: value })} />
          <ThemeColorField label="Поверхні" value={theme.colors.surface} onChange={(value) => updateTheme('colors', { ...theme.colors, surface: value })} />
          <ThemeColorField label="Основний текст" value={theme.colors.text} onChange={(value) => updateTheme('colors', { ...theme.colors, text: value })} />
          <ThemeColorField label="Приглушений текст" value={theme.colors.muted} onChange={(value) => updateTheme('colors', { ...theme.colors, muted: value })} />
          <ThemeColorField label="Акцент" value={theme.colors.accent} onChange={(value) => updateTheme('colors', { ...theme.colors, accent: value })} />
          <ThemeColorField label="Кнопки покупки" value={theme.colors.action} onChange={(value) => updateTheme('colors', { ...theme.colors, action: value })} />
          <ThemeColorField label="Рамки" value={theme.colors.border} onChange={(value) => updateTheme('colors', { ...theme.colors, border: value })} />
        </ThemeSection>

        <ThemeSection title="Компонування" description="Ширина контейнера, відступи та сітка для кожного пристрою.">
          <ThemeRangeField label="Максимальна ширина" value={theme.layout.maxWidth} min={960} max={1920} step={20} onChange={(value) => updateTheme('layout', { ...theme.layout, maxWidth: value })} />
          <ThemeRangeField label="Відступ desktop" value={theme.layout.pagePaddingDesktop} min={0} max={120} onChange={(value) => updateTheme('layout', { ...theme.layout, pagePaddingDesktop: value })} />
          <ThemeRangeField label="Відступ tablet" value={theme.layout.pagePaddingTablet} min={0} max={80} onChange={(value) => updateTheme('layout', { ...theme.layout, pagePaddingTablet: value })} />
          <ThemeRangeField label="Відступ mobile" value={theme.layout.pagePaddingMobile} min={0} max={40} onChange={(value) => updateTheme('layout', { ...theme.layout, pagePaddingMobile: value })} />
          <ThemeRangeField label="Відстань між секціями" value={theme.layout.sectionGap} min={0} max={80} onChange={(value) => updateTheme('layout', { ...theme.layout, sectionGap: value })} />
          <ThemeRangeField label="Ширина фільтрів" value={theme.layout.filterWidth} min={200} max={420} onChange={(value) => updateTheme('layout', { ...theme.layout, filterWidth: value })} />
          <ThemeRangeField label="Проміжок каталогу" value={theme.layout.catalogGap} min={0} max={60} onChange={(value) => updateTheme('layout', { ...theme.layout, catalogGap: value })} />
          <ThemeRangeField label="Проміжок карток" value={theme.layout.gridGap} min={0} max={48} onChange={(value) => updateTheme('layout', { ...theme.layout, gridGap: value })} />
          <ThemeRangeField label="Колонки desktop" value={theme.layout.columnsDesktop} min={2} max={6} suffix="" onChange={(value) => updateTheme('layout', { ...theme.layout, columnsDesktop: value })} />
          <ThemeRangeField label="Колонки tablet" value={theme.layout.columnsTablet} min={1} max={4} suffix="" onChange={(value) => updateTheme('layout', { ...theme.layout, columnsTablet: value })} />
          <ThemeRangeField label="Колонки mobile" value={theme.layout.columnsMobile} min={1} max={2} suffix="" onChange={(value) => updateTheme('layout', { ...theme.layout, columnsMobile: value })} />
        </ThemeSection>

        <ThemeSection title="Шапка" description="Брендинг і поведінка верхньої частини вітрини.">
          <ThemeToggle label="Показувати шапку" checked={theme.header.visible} onChange={(value) => updateTheme('header', { ...theme.header, visible: value })} />
          <ThemeToggle label="Закріпити при прокручуванні" checked={theme.header.sticky} onChange={(value) => updateTheme('header', { ...theme.header, sticky: value })} />
          <ThemeToggle label="Показувати кнопку Workspace" checked={theme.header.actionVisible} onChange={(value) => updateTheme('header', { ...theme.header, actionVisible: value })} />
          <ThemeTextField label="Назва бренду" value={theme.header.brandText} onChange={(value) => updateTheme('header', { ...theme.header, brandText: value })} />
          <ThemeTextField label="Знак бренду" value={theme.header.brandMark} onChange={(value) => updateTheme('header', { ...theme.header, brandMark: value.slice(0, 8) })} />
          <ThemeColorField label="Фон" value={theme.header.background} onChange={(value) => updateTheme('header', { ...theme.header, background: value })} />
          <ThemeColorField label="Рамка" value={theme.header.borderColor} onChange={(value) => updateTheme('header', { ...theme.header, borderColor: value })} />
          <ThemeRangeField label="Висота" value={theme.header.height} min={44} max={140} onChange={(value) => updateTheme('header', { ...theme.header, height: value })} />
          <ThemeRangeField label="Горизонтальний відступ" value={theme.header.paddingX} min={0} max={80} onChange={(value) => updateTheme('header', { ...theme.header, paddingX: value })} />
          <ThemeRangeField label="Вертикальний відступ" value={theme.header.paddingY} min={0} max={50} onChange={(value) => updateTheme('header', { ...theme.header, paddingY: value })} />
          <ThemeRangeField label="Радіус" value={theme.header.radius} min={0} max={40} onChange={(value) => updateTheme('header', { ...theme.header, radius: value })} />
          <ThemeRangeField label="Товщина рамки" value={theme.header.borderWidth} min={0} max={6} onChange={(value) => updateTheme('header', { ...theme.header, borderWidth: value })} />
          <ThemeRangeField label="Розмір назви" value={theme.header.brandSize} min={10} max={34} onChange={(value) => updateTheme('header', { ...theme.header, brandSize: value })} />
          <ThemeSelectField label="Тінь" value={theme.header.shadow} options={shadowOptions} onChange={(value) => updateTheme('header', { ...theme.header, shadow: value as CatalogStorefrontTheme['header']['shadow'] })} />
        </ThemeSection>

        <ThemeSection title="Hero-блок" description="Головний вступний блок над каталогом.">
          <ThemeToggle label="Показувати hero" checked={theme.hero.visible} onChange={(value) => updateTheme('hero', { ...theme.hero, visible: value })} />
          <ThemeToggle label="Показувати eyebrow" checked={theme.hero.eyebrowVisible} onChange={(value) => updateTheme('hero', { ...theme.hero, eyebrowVisible: value })} />
          <ThemeTextField label="Eyebrow" value={theme.hero.eyebrowText} onChange={(value) => updateTheme('hero', { ...theme.hero, eyebrowText: value })} />
          <ThemeTextField label="Заголовок" value={theme.hero.title} onChange={(value) => updateTheme('hero', { ...theme.hero, title: value })} />
          <ThemeTextField label="Підзаголовок" value={theme.hero.subtitle} onChange={(value) => updateTheme('hero', { ...theme.hero, subtitle: value })} />
          <ThemeSelectField label="Вирівнювання" value={theme.hero.alignment} options={[{ value: 'left', label: 'Ліворуч' }, { value: 'center', label: 'По центру' }, { value: 'right', label: 'Праворуч' }]} onChange={(value) => updateTheme('hero', { ...theme.hero, alignment: value as CatalogStorefrontTheme['hero']['alignment'] })} />
          <ThemeColorField label="Початок градієнта" value={theme.hero.backgroundStart} onChange={(value) => updateTheme('hero', { ...theme.hero, backgroundStart: value })} />
          <ThemeColorField label="Кінець градієнта" value={theme.hero.backgroundEnd} onChange={(value) => updateTheme('hero', { ...theme.hero, backgroundEnd: value })} />
          <ThemeRangeField label="Кут градієнта" value={theme.hero.gradientAngle} min={0} max={360} suffix="°" onChange={(value) => updateTheme('hero', { ...theme.hero, gradientAngle: value })} />
          <ThemeRangeField label="Заголовок desktop" value={theme.hero.titleSizeDesktop} min={22} max={80} onChange={(value) => updateTheme('hero', { ...theme.hero, titleSizeDesktop: value })} />
          <ThemeRangeField label="Заголовок mobile" value={theme.hero.titleSizeMobile} min={20} max={56} onChange={(value) => updateTheme('hero', { ...theme.hero, titleSizeMobile: value })} />
          <ThemeRangeField label="Горизонтальний відступ" value={theme.hero.paddingX} min={0} max={120} onChange={(value) => updateTheme('hero', { ...theme.hero, paddingX: value })} />
          <ThemeRangeField label="Вертикальний відступ" value={theme.hero.paddingY} min={0} max={120} onChange={(value) => updateTheme('hero', { ...theme.hero, paddingY: value })} />
          <ThemeRangeField label="Радіус" value={theme.hero.radius} min={0} max={60} onChange={(value) => updateTheme('hero', { ...theme.hero, radius: value })} />
        </ThemeSection>

        <ThemeSection title="Пошук і сортування">
          <ThemeToggle label="Показувати сортування" checked={theme.controls.sortVisible} onChange={(value) => updateTheme('controls', { ...theme.controls, sortVisible: value })} />
          <ThemeTextField label="Placeholder пошуку" value={theme.controls.searchPlaceholder} onChange={(value) => updateTheme('controls', { ...theme.controls, searchPlaceholder: value })} />
          <ThemeColorField label="Фон полів" value={theme.controls.background} onChange={(value) => updateTheme('controls', { ...theme.controls, background: value })} />
          <ThemeColorField label="Рамка полів" value={theme.controls.borderColor} onChange={(value) => updateTheme('controls', { ...theme.controls, borderColor: value })} />
          <ThemeRangeField label="Висота" value={theme.controls.height} min={34} max={72} onChange={(value) => updateTheme('controls', { ...theme.controls, height: value })} />
          <ThemeRangeField label="Радіус" value={theme.controls.radius} min={0} max={36} onChange={(value) => updateTheme('controls', { ...theme.controls, radius: value })} />
        </ThemeSection>

        <ThemeSection title="Фільтри">
          <ThemeToggle label="Показувати фільтри" checked={theme.filters.visible} onChange={(value) => updateTheme('filters', { ...theme.filters, visible: value })} />
          <ThemeToggle label="Закріпити панель" checked={theme.filters.sticky} onChange={(value) => updateTheme('filters', { ...theme.filters, sticky: value })} />
          <ThemeToggle label="Показувати лічильники" checked={theme.filters.showCounts} onChange={(value) => updateTheme('filters', { ...theme.filters, showCounts: value })} />
          <ThemeColorField label="Фон" value={theme.filters.background} onChange={(value) => updateTheme('filters', { ...theme.filters, background: value })} />
          <ThemeColorField label="Рамка" value={theme.filters.borderColor} onChange={(value) => updateTheme('filters', { ...theme.filters, borderColor: value })} />
          <ThemeRangeField label="Внутрішній відступ" value={theme.filters.padding} min={0} max={48} onChange={(value) => updateTheme('filters', { ...theme.filters, padding: value })} />
          <ThemeRangeField label="Проміжок груп" value={theme.filters.groupGap} min={0} max={40} onChange={(value) => updateTheme('filters', { ...theme.filters, groupGap: value })} />
          <ThemeRangeField label="Радіус" value={theme.filters.radius} min={0} max={40} onChange={(value) => updateTheme('filters', { ...theme.filters, radius: value })} />
          <ThemeSelectField label="Тінь" value={theme.filters.shadow} options={shadowOptions} onChange={(value) => updateTheme('filters', { ...theme.filters, shadow: value as CatalogStorefrontTheme['filters']['shadow'] })} />
        </ThemeSection>
      </div>

      <aside className="catalog-theme-builder__preview">
        <header><div><strong>Живий preview</strong><span>Зміни застосовуються одразу</span></div><CatalogThemeDeviceSwitch device={device} onChange={setDevice} /></header>
        <CatalogThemePreview storefrontTheme={theme} cardTheme={cardTheme} device={device} />
      </aside>
    </div>}
  </div>;
}
