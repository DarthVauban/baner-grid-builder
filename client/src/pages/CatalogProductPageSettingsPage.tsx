import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CatalogProductPagePreview,
  CatalogThemeDeviceSwitch,
  ThemeColorField,
  ThemeRangeField,
  ThemeSection,
  ThemeSelectField,
  ThemeTextField,
  ThemeToggle,
  type CatalogThemeDevice
} from '../components/CatalogThemeBuilder';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import {
  cloneProductPageTheme,
  defaultProductPageTheme,
  defaultStorefrontTheme,
  fontWeightOptions
} from '../lib/storefront-theme';
import { useUndoableState } from '../lib/use-undoable-state';
import { useToast } from '../toast/ToastContext';
import type { CatalogProductPageTheme } from '../types/catalog';

const shadowOptions = [
  { value: 'none', label: 'Без тіні' },
  { value: 'soft', label: 'М’яка' },
  { value: 'strong', label: 'Виразна' }
];

export function CatalogProductPageSettingsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const settings = useQuery({ queryKey: ['catalog-storefront-settings'], queryFn: api.catalog.storefrontSettings });
  const saveSettings = useMutation({ mutationFn: api.catalog.updateStorefrontSettings });
  const {
    state: theme,
    setState: setTheme,
    replaceState: replaceTheme,
    undo,
    canUndo,
    historyDepth
  } = useUndoableState<CatalogProductPageTheme>(() => cloneProductPageTheme());
  const [device, setDevice] = useState<CatalogThemeDevice>('desktop');
  const [savedSnapshot, setSavedSnapshot] = useState('');

  useEffect(() => {
    if (!settings.data) return;
    const nextTheme = cloneProductPageTheme(settings.data.productPageTheme);
    replaceTheme(nextTheme);
    setSavedSnapshot(JSON.stringify(nextTheme));
  }, [replaceTheme, settings.data]);

  const currentSnapshot = useMemo(() => JSON.stringify(theme), [theme]);
  const hasUnsavedChanges = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const storefrontTheme = settings.data?.storefrontTheme || defaultStorefrontTheme;

  function updateTheme<K extends keyof CatalogProductPageTheme>(section: K, value: CatalogProductPageTheme[K]) {
    setTheme((current) => ({ ...current, [section]: value }));
  }

  async function submit() {
    try {
      const saved = await saveSettings.mutateAsync({ productPageTheme: theme });
      const nextTheme = cloneProductPageTheme(saved.productPageTheme);
      replaceTheme(nextTheme);
      setSavedSnapshot(JSON.stringify(nextTheme));
      await queryClient.invalidateQueries({ queryKey: ['catalog-storefront-settings'] });
      showToast('Дизайн сторінки товару збережено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти дизайн сторінки товару.', 'error');
    }
  }

  function resetTheme() {
    setTheme(cloneProductPageTheme(defaultProductPageTheme));
  }

  const saveButton = <button className="button button--primary" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}>
    <Icon name="save" size={16} /> {saveSettings.isPending ? 'Збереження…' : 'Зберегти'}
  </button>;

  return <div className="catalog-theme-page">
    <section className="task-toolbar catalog-theme-page__header">
      <div><p className="eyebrow">Product page builder</p><h1>Сторінка товару</h1><p>Компонування галереї та даних товару, типографіка, видимість блоків, кнопка замовлення й інформаційні таби.</p></div>
      <div className="task-toolbar__controls">
        <span className={`catalog-unsaved-badge${hasUnsavedChanges ? '' : ' catalog-unsaved-badge--hidden'}`} aria-hidden={!hasUnsavedChanges}><Icon name="schedule" size={15} /> Незбережені зміни</span>
        <button className="button button--secondary" type="button" disabled={!canUndo} onClick={undo} title={canUndo ? `Скасувати останню дію (${historyDepth}/15) · Ctrl+Z` : 'Немає дій для скасування'}><Icon name="undo" size={16} /> Скасувати</button>
        <a className="button button--secondary" href="/catalog/preview/storefront" target="_blank" rel="noreferrer"><Icon name="openInNew" size={16} /> Відкрити preview</a>
        <button className="button button--secondary" type="button" onClick={resetTheme}><Icon name="reply" size={16} /> Стандартна тема</button>
        {saveButton}
      </div>
    </section>

    {settings.isError ? <section className="catalog-placeholder"><h2>Не вдалося завантажити налаштування</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><button className="button button--secondary" type="button" onClick={() => void settings.refetch()}>Повторити</button></section>
      : settings.isLoading ? <section className="catalog-placeholder"><h2>Завантаження конструктора…</h2></section> : <div className="catalog-theme-builder">
      <div className="catalog-theme-builder__controls">
        <ThemeSection title="Компонування" description="Співвідношення галереї та інформаційного блоку зберігається в межах однієї горизонтальної секції.">
          <ThemeRangeField label="Ширина галереї" value={theme.layout.galleryWidth} min={35} max={65} suffix="%" onChange={(value) => updateTheme('layout', { ...theme.layout, galleryWidth: value })} />
          <ThemeRangeField label="Відстань між колонками" value={theme.layout.gap} min={0} max={60} onChange={(value) => updateTheme('layout', { ...theme.layout, gap: value })} />
          <ThemeRangeField label="Відстань до опису" value={theme.layout.sectionGap} min={0} max={80} onChange={(value) => updateTheme('layout', { ...theme.layout, sectionGap: value })} />
        </ThemeSection>

        <ThemeSection title="Галерея" description="Фото завжди підлаштовується під контейнер; окремо керуються навігація та мініатюри.">
          <ThemeColorField label="Фон" value={theme.gallery.background} onChange={(value) => updateTheme('gallery', { ...theme.gallery, background: value })} />
          <ThemeColorField label="Рамка" value={theme.gallery.borderColor} onChange={(value) => updateTheme('gallery', { ...theme.gallery, borderColor: value })} />
          <ThemeRangeField label="Товщина рамки" value={theme.gallery.borderWidth} min={0} max={6} onChange={(value) => updateTheme('gallery', { ...theme.gallery, borderWidth: value })} />
          <ThemeRangeField label="Радіус" value={theme.gallery.radius} min={0} max={48} onChange={(value) => updateTheme('gallery', { ...theme.gallery, radius: value })} />
          <ThemeRangeField label="Внутрішній відступ" value={theme.gallery.padding} min={0} max={48} onChange={(value) => updateTheme('gallery', { ...theme.gallery, padding: value })} />
          <ThemeSelectField label="Заповнення фото" value={theme.gallery.imageFit} options={[{ value: 'contain', label: 'Вмістити повністю' }, { value: 'cover', label: 'Заповнити контейнер' }]} onChange={(value) => updateTheme('gallery', { ...theme.gallery, imageFit: value as CatalogProductPageTheme['gallery']['imageFit'] })} />
          <ThemeRangeField label="Масштаб фото" value={theme.gallery.imageScale} min={35} max={100} suffix="%" onChange={(value) => updateTheme('gallery', { ...theme.gallery, imageScale: value })} />
          <ThemeRangeField label="Висота мініатюр" value={theme.gallery.thumbnailHeight} min={54} max={160} onChange={(value) => updateTheme('gallery', { ...theme.gallery, thumbnailHeight: value })} />
          <ThemeRangeField label="Відстань між мініатюрами" value={theme.gallery.thumbnailGap} min={0} max={32} onChange={(value) => updateTheme('gallery', { ...theme.gallery, thumbnailGap: value })} />
          <ThemeToggle label="Показувати мініатюри" checked={theme.gallery.showThumbnails} onChange={(value) => updateTheme('gallery', { ...theme.gallery, showThumbnails: value })} />
          <ThemeToggle label="Показувати стрілки" checked={theme.gallery.showArrows} onChange={(value) => updateTheme('gallery', { ...theme.gallery, showArrows: value })} />
          <ThemeToggle label="Показувати лічильник фото" checked={theme.gallery.showCounter} onChange={(value) => updateTheme('gallery', { ...theme.gallery, showCounter: value })} />
        </ThemeSection>

        <ThemeSection title="Блок інформації">
          <ThemeColorField label="Фон" value={theme.details.background} onChange={(value) => updateTheme('details', { ...theme.details, background: value })} />
          <ThemeColorField label="Рамка" value={theme.details.borderColor} onChange={(value) => updateTheme('details', { ...theme.details, borderColor: value })} />
          <ThemeRangeField label="Товщина рамки" value={theme.details.borderWidth} min={0} max={6} onChange={(value) => updateTheme('details', { ...theme.details, borderWidth: value })} />
          <ThemeRangeField label="Радіус" value={theme.details.radius} min={0} max={48} onChange={(value) => updateTheme('details', { ...theme.details, radius: value })} />
          <ThemeRangeField label="Внутрішній відступ" value={theme.details.padding} min={0} max={72} onChange={(value) => updateTheme('details', { ...theme.details, padding: value })} />
          <ThemeRangeField label="Проміжок елементів" value={theme.details.gap} min={0} max={48} onChange={(value) => updateTheme('details', { ...theme.details, gap: value })} />
          <ThemeSelectField label="Тінь" value={theme.details.shadow} options={shadowOptions} onChange={(value) => updateTheme('details', { ...theme.details, shadow: value as CatalogProductPageTheme['details']['shadow'] })} />
        </ThemeSection>

        <ThemeSection title="Видимість елементів" description="Основна назва, ціна, наявність і кнопка замовлення залишаються обов’язковими.">
          <ThemeToggle label="Посилання «До каталогу»" checked={theme.visibility.backLink} onChange={(value) => updateTheme('visibility', { ...theme.visibility, backLink: value })} />
          <ThemeToggle label="Код, стан і бренд" checked={theme.visibility.meta} onChange={(value) => updateTheme('visibility', { ...theme.visibility, meta: value })} />
          <ThemeToggle label="Короткий опис" checked={theme.visibility.shortDescription} onChange={(value) => updateTheme('visibility', { ...theme.visibility, shortDescription: value })} />
          <ThemeToggle label="Короткі характеристики" checked={theme.visibility.quickSpecs} onChange={(value) => updateTheme('visibility', { ...theme.visibility, quickSpecs: value })} />
          <ThemeToggle label="Модифікації товару" checked={theme.visibility.modifications} onChange={(value) => updateTheme('visibility', { ...theme.visibility, modifications: value })} />
          <ThemeToggle label="Опис і характеристики" checked={theme.visibility.tabs} onChange={(value) => updateTheme('visibility', { ...theme.visibility, tabs: value })} />
        </ThemeSection>

        <ThemeSection title="Типографіка">
          <ThemeColorField label="Колір назви" value={theme.typography.titleColor} onChange={(value) => updateTheme('typography', { ...theme.typography, titleColor: value })} />
          <ThemeRangeField label="Назва на desktop" value={theme.typography.titleSizeDesktop} min={24} max={80} onChange={(value) => updateTheme('typography', { ...theme.typography, titleSizeDesktop: value })} />
          <ThemeRangeField label="Назва на mobile" value={theme.typography.titleSizeMobile} min={22} max={56} onChange={(value) => updateTheme('typography', { ...theme.typography, titleSizeMobile: value })} />
          <ThemeSelectField label="Вага назви" value={String(theme.typography.titleWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, titleWeight: Number(value) })} />
          <ThemeColorField label="Колір ціни" value={theme.typography.priceColor} onChange={(value) => updateTheme('typography', { ...theme.typography, priceColor: value })} />
          <ThemeRangeField label="Розмір ціни" value={theme.typography.priceSize} min={20} max={64} onChange={(value) => updateTheme('typography', { ...theme.typography, priceSize: value })} />
          <ThemeSelectField label="Вага ціни" value={String(theme.typography.priceWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, priceWeight: Number(value) })} />
          <ThemeColorField label="Колір короткого опису" value={theme.typography.leadColor} onChange={(value) => updateTheme('typography', { ...theme.typography, leadColor: value })} />
          <ThemeRangeField label="Розмір короткого опису" value={theme.typography.leadSize} min={11} max={24} onChange={(value) => updateTheme('typography', { ...theme.typography, leadSize: value })} />
        </ThemeSection>

        <ThemeSection title="Кнопка замовлення">
          <ThemeTextField label="Текст кнопки" value={theme.button.label} onChange={(value) => updateTheme('button', { ...theme.button, label: value })} />
          <ThemeTextField label="Немає в наявності" value={theme.button.unavailableLabel} onChange={(value) => updateTheme('button', { ...theme.button, unavailableLabel: value })} />
          <ThemeTextField label="Текст у preview" value={theme.button.previewLabel} onChange={(value) => updateTheme('button', { ...theme.button, previewLabel: value })} />
          <ThemeColorField label="Фон" value={theme.button.background} onChange={(value) => updateTheme('button', { ...theme.button, background: value })} />
          <ThemeColorField label="Фон при hover" value={theme.button.hoverBackground} onChange={(value) => updateTheme('button', { ...theme.button, hoverBackground: value })} />
          <ThemeColorField label="Колір тексту" value={theme.button.textColor} onChange={(value) => updateTheme('button', { ...theme.button, textColor: value })} />
          <ThemeRangeField label="Висота" value={theme.button.height} min={36} max={80} onChange={(value) => updateTheme('button', { ...theme.button, height: value })} />
          <ThemeRangeField label="Радіус" value={theme.button.radius} min={0} max={40} onChange={(value) => updateTheme('button', { ...theme.button, radius: value })} />
          <ThemeRangeField label="Розмір тексту" value={theme.button.fontSize} min={11} max={26} onChange={(value) => updateTheme('button', { ...theme.button, fontSize: value })} />
          <ThemeSelectField label="Вага" value={String(theme.button.fontWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('button', { ...theme.button, fontWeight: Number(value) })} />
        </ThemeSection>

        <ThemeSection title="Таби опису">
          <ThemeTextField label="Назва опису" value={theme.tabs.descriptionLabel} onChange={(value) => updateTheme('tabs', { ...theme.tabs, descriptionLabel: value })} />
          <ThemeTextField label="Назва характеристик" value={theme.tabs.characteristicsLabel} onChange={(value) => updateTheme('tabs', { ...theme.tabs, characteristicsLabel: value })} />
          <ThemeColorField label="Фон" value={theme.tabs.background} onChange={(value) => updateTheme('tabs', { ...theme.tabs, background: value })} />
          <ThemeColorField label="Рамка" value={theme.tabs.borderColor} onChange={(value) => updateTheme('tabs', { ...theme.tabs, borderColor: value })} />
          <ThemeColorField label="Колір тексту" value={theme.tabs.textColor} onChange={(value) => updateTheme('tabs', { ...theme.tabs, textColor: value })} />
          <ThemeColorField label="Активний колір" value={theme.tabs.activeColor} onChange={(value) => updateTheme('tabs', { ...theme.tabs, activeColor: value })} />
          <ThemeRangeField label="Радіус контейнера" value={theme.tabs.radius} min={0} max={40} onChange={(value) => updateTheme('tabs', { ...theme.tabs, radius: value })} />
          <ThemeRangeField label="Горизонтальний відступ" value={theme.tabs.padding} min={12} max={72} onChange={(value) => updateTheme('tabs', { ...theme.tabs, padding: value })} />
        </ThemeSection>
      </div>

      <aside className="catalog-theme-builder__preview">
        <header>
          <div><strong>Живий preview сторінки</strong><span>Використовує активну тему вітрини</span></div>
          <div className="catalog-theme-builder__preview-actions">
            <button className="button button--primary catalog-theme-builder__preview-save" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}><Icon name="save" size={16} /> {saveSettings.isPending ? 'Збереження…' : 'Зберегти'}</button>
            <CatalogThemeDeviceSwitch device={device} onChange={setDevice} />
          </div>
        </header>
        <CatalogProductPagePreview storefrontTheme={storefrontTheme} productPageTheme={theme} device={device} />
      </aside>
    </div>}
  </div>;
}
