import { type DragEvent, useEffect, useMemo, useState } from 'react';
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
import { api } from '../lib/api';
import {
  cloneProductCardTheme,
  defaultProductCardTheme,
  defaultStorefrontTheme,
  fontWeightOptions
} from '../lib/storefront-theme';
import { useUndoableState } from '../lib/use-undoable-state';
import { useToast } from '../toast/ToastContext';
import type { CatalogProductCardContentKey, CatalogProductCardTheme } from '../types/catalog';

const shadowOptions = [
  { value: 'none', label: 'Без тіні' },
  { value: 'soft', label: 'М’яка' },
  { value: 'strong', label: 'Виразна' }
];
const contentLabels: Record<CatalogProductCardContentKey, string> = {
  image: 'Фото',
  badge: 'Бейдж стану',
  brand: 'Бренд',
  title: 'Назва товару',
  meta: 'Код і наявність'
};

type ContentDropTarget = {
  index: number;
  placement: 'before' | 'after';
};

export function CatalogProductCardSettingsPage() {
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
  } = useUndoableState<CatalogProductCardTheme>(() => cloneProductCardTheme());
  const [device, setDevice] = useState<CatalogThemeDevice>('desktop');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [draggedContentIndex, setDraggedContentIndex] = useState<number | null>(null);
  const [contentDropTarget, setContentDropTarget] = useState<ContentDropTarget | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    const next = cloneProductCardTheme(settings.data.productCardTheme);
    replaceTheme(next);
    setSavedSnapshot(JSON.stringify(next));
  }, [replaceTheme, settings.data]);

  const currentSnapshot = useMemo(() => JSON.stringify(theme), [theme]);
  const hasUnsavedChanges = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const storefrontTheme = settings.data?.storefrontTheme || defaultStorefrontTheme;

  function updateTheme<K extends keyof CatalogProductCardTheme>(section: K, value: CatalogProductCardTheme[K]) {
    setTheme((current) => ({ ...current, [section]: value }));
  }

  function moveContent(key: CatalogProductCardContentKey, direction: -1 | 1) {
    setTheme((current) => {
      const order = [...current.contentOrder];
      const index = order.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return current;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...current, contentOrder: order };
    });
  }

  function reorderContent(fromIndex: number, toIndex: number) {
    setTheme((current) => {
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= current.contentOrder.length || toIndex >= current.contentOrder.length) return current;
      const contentOrder = [...current.contentOrder];
      const [content] = contentOrder.splice(fromIndex, 1);
      contentOrder.splice(toIndex, 0, content);
      return { ...current, contentOrder };
    });
  }

  function startContentDrag(event: DragEvent<HTMLElement>, index: number) {
    setDraggedContentIndex(index);
    setContentDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function overContent(event: DragEvent<HTMLElement>, index: number) {
    if (draggedContentIndex === null) return;
    if (draggedContentIndex === index) {
      setContentDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setContentDropTarget({ index, placement: draggedContentIndex < index ? 'after' : 'before' });
  }

  function dropContent(event: DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const transferredIndex = event.dataTransfer.getData('text/plain');
    const parsedIndex = transferredIndex.trim() ? Number(transferredIndex) : Number.NaN;
    const fromIndex = draggedContentIndex ?? parsedIndex;
    if (Number.isInteger(fromIndex) && fromIndex !== index) reorderContent(fromIndex, index);
    setDraggedContentIndex(null);
    setContentDropTarget(null);
  }

  function finishContentDrag() {
    setDraggedContentIndex(null);
    setContentDropTarget(null);
  }

  async function submit() {
    try {
      const saved = await saveSettings.mutateAsync({ productCardTheme: theme });
      const next = cloneProductCardTheme(saved.productCardTheme);
      replaceTheme(next);
      setSavedSnapshot(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey: ['catalog-storefront-settings'] });
      showToast('Дизайн картки товару збережено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти дизайн картки.', 'error');
    }
  }

  return <div className="catalog-theme-page">
    <section className="task-toolbar catalog-theme-page__header">
      <div><p className="eyebrow">Product card builder</p><h1>Картка товару</h1><p>Контейнер, фото, порядок елементів, типографіка, кнопка та перемикачі модифікацій.</p></div>
      <div className="task-toolbar__controls">
        <span className={`catalog-unsaved-badge${hasUnsavedChanges ? '' : ' catalog-unsaved-badge--hidden'}`} aria-hidden={!hasUnsavedChanges}><Icon name="schedule" size={15} /> Незбережені зміни</span>
        <button className="button button--secondary" type="button" disabled={!canUndo} onClick={undo} title={canUndo ? `Скасувати останню дію (${historyDepth}/15) · Ctrl+Z` : 'Немає дій для скасування'}><Icon name="undo" size={16} /> Скасувати</button>
        <a className="button button--secondary" href="/catalog/preview/storefront" target="_blank" rel="noreferrer"><Icon name="openInNew" size={16} /> Відкрити preview</a>
        <button className="button button--secondary" type="button" onClick={() => setTheme(cloneProductCardTheme(defaultProductCardTheme))}><Icon name="reply" size={16} /> Стандартна картка</button>
        <button className="button button--primary" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}><Icon name="save" size={16} /> Зберегти</button>
      </div>
    </section>

    {settings.isError ? <section className="catalog-placeholder"><h2>Не вдалося завантажити налаштування</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><button className="button button--secondary" type="button" onClick={() => void settings.refetch()}>Повторити</button></section>
      : settings.isLoading ? <section className="catalog-placeholder"><h2>Завантаження конструктора…</h2></section> : <div className="catalog-theme-builder">
      <div className="catalog-theme-builder__controls">
        <ThemeSection title="Контейнер картки" description="Фон, рамка, радіус, відступи та поведінка при наведенні.">
          <ThemeColorField label="Фон" value={theme.container.background} onChange={(value) => updateTheme('container', { ...theme.container, background: value })} />
          <ThemeColorField label="Рамка" value={theme.container.borderColor} onChange={(value) => updateTheme('container', { ...theme.container, borderColor: value })} />
          <ThemeRangeField label="Товщина рамки" value={theme.container.borderWidth} min={0} max={6} onChange={(value) => updateTheme('container', { ...theme.container, borderWidth: value })} />
          <ThemeRangeField label="Радіус" value={theme.container.radius} min={0} max={48} onChange={(value) => updateTheme('container', { ...theme.container, radius: value })} />
          <ThemeRangeField label="Внутрішній відступ" value={theme.container.padding} min={0} max={48} onChange={(value) => updateTheme('container', { ...theme.container, padding: value })} />
          <ThemeRangeField label="Проміжок елементів" value={theme.container.gap} min={0} max={40} onChange={(value) => updateTheme('container', { ...theme.container, gap: value })} />
          <ThemeRangeField label="Підняття при hover" value={theme.container.hoverLift} min={0} max={16} onChange={(value) => updateTheme('container', { ...theme.container, hoverLift: value })} />
          <ThemeSelectField label="Тінь" value={theme.container.shadow} options={shadowOptions} onChange={(value) => updateTheme('container', { ...theme.container, shadow: value as CatalogProductCardTheme['container']['shadow'] })} />
          <ThemeSelectField label="Тінь при hover" value={theme.container.hoverShadow} options={shadowOptions} onChange={(value) => updateTheme('container', { ...theme.container, hoverShadow: value as CatalogProductCardTheme['container']['hoverShadow'] })} />
        </ThemeSection>

        <ThemeSection title="Фото товару" description="Зображення завжди залишається в межах свого контейнера.">
          <ThemeToggle label="Показувати фото" checked={theme.visibility.image} onChange={(value) => updateTheme('visibility', { ...theme.visibility, image: value })} />
          <ThemeSelectField label="Співвідношення сторін" value={theme.image.aspectRatio} options={[{ value: '1 / 1', label: '1:1' }, { value: '4 / 3', label: '4:3' }, { value: '3 / 4', label: '3:4' }, { value: '16 / 9', label: '16:9' }]} onChange={(value) => updateTheme('image', { ...theme.image, aspectRatio: value as CatalogProductCardTheme['image']['aspectRatio'] })} />
          <ThemeSelectField label="Заповнення" value={theme.image.fit} options={[{ value: 'contain', label: 'Вмістити повністю' }, { value: 'cover', label: 'Заповнити контейнер' }]} onChange={(value) => updateTheme('image', { ...theme.image, fit: value as CatalogProductCardTheme['image']['fit'] })} />
          <ThemeColorField label="Фон фото" value={theme.image.background} onChange={(value) => updateTheme('image', { ...theme.image, background: value })} />
          <ThemeRangeField label="Радіус" value={theme.image.radius} min={0} max={48} onChange={(value) => updateTheme('image', { ...theme.image, radius: value })} />
          <ThemeRangeField label="Внутрішній відступ" value={theme.image.padding} min={0} max={48} onChange={(value) => updateTheme('image', { ...theme.image, padding: value })} />
          <ThemeRangeField label="Масштаб при hover" value={theme.image.hoverZoom} min={1} max={1.2} step={0.01} suffix="×" onChange={(value) => updateTheme('image', { ...theme.image, hoverZoom: value })} />
        </ThemeSection>

        <ThemeSection title="Склад картки" description="Вмикайте елементи та змінюйте порядок основного контенту.">
          <div className="catalog-theme-order catalog-theme-control--wide">
            {theme.contentOrder.map((key, index) => <div
              className={`catalog-theme-order__item${draggedContentIndex === index ? ' catalog-theme-order__item--dragging' : ''}${contentDropTarget?.index === index ? ` catalog-theme-order__item--drop-${contentDropTarget.placement}` : ''}`}
              key={key}
              onDragOver={(event) => overContent(event, index)}
              onDrop={(event) => dropContent(event, index)}
              onDragEnd={finishContentDrag}
            >
              <span
                className="catalog-theme-order__handle"
                draggable={theme.contentOrder.length > 1}
                aria-disabled={theme.contentOrder.length <= 1}
                aria-label={`Перетягнути ${contentLabels[key]}`}
                title={`Перетягнути ${contentLabels[key]}`}
                onDragStart={(event) => startContentDrag(event, index)}
              ><Icon name="menu" size={16} /><strong>{contentLabels[key]}</strong></span>
              <div>
                <button className="icon-button" type="button" disabled={index === 0} aria-label={`Підняти ${contentLabels[key]}`} onClick={() => moveContent(key, -1)}><Icon name="arrowUp" size={16} /></button>
                <button className="icon-button" type="button" disabled={index === theme.contentOrder.length - 1} aria-label={`Опустити ${contentLabels[key]}`} onClick={() => moveContent(key, 1)}><Icon name="arrowDown" size={16} /></button>
                <input type="checkbox" checked={theme.visibility[key]} aria-label={`Показувати ${contentLabels[key]}`} onChange={(event) => updateTheme('visibility', { ...theme.visibility, [key]: event.target.checked })} />
              </div>
            </div>)}
          </div>
          <ThemeToggle label="Показувати ціну" checked={theme.visibility.price} onChange={(value) => updateTheme('visibility', { ...theme.visibility, price: value })} />
          <ThemeToggle label="Показувати кнопку" checked={theme.visibility.button} onChange={(value) => updateTheme('visibility', { ...theme.visibility, button: value })} />
          <ThemeToggle label="Показувати наявність" checked={theme.visibility.availability} onChange={(value) => updateTheme('visibility', { ...theme.visibility, availability: value })} />
          <ThemeToggle label="Показувати модифікації" checked={theme.visibility.modifications} onChange={(value) => updateTheme('visibility', { ...theme.visibility, modifications: value })} />
        </ThemeSection>

        <ThemeSection title="Бейдж стану">
          <ThemeColorField label="Колір тексту" value={theme.badge.textColor} onChange={(value) => updateTheme('badge', { ...theme.badge, textColor: value })} />
          <ThemeColorField label="Фон" value={theme.badge.background} onChange={(value) => updateTheme('badge', { ...theme.badge, background: value })} />
          <ThemeRangeField label="Розмір тексту" value={theme.badge.fontSize} min={8} max={22} onChange={(value) => updateTheme('badge', { ...theme.badge, fontSize: value })} />
          <ThemeSelectField label="Вага" value={String(theme.badge.fontWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('badge', { ...theme.badge, fontWeight: Number(value) })} />
          <ThemeRangeField label="Радіус" value={theme.badge.radius} min={0} max={999} onChange={(value) => updateTheme('badge', { ...theme.badge, radius: value })} />
          <ThemeRangeField label="Відступ по горизонталі" value={theme.badge.paddingX} min={0} max={30} onChange={(value) => updateTheme('badge', { ...theme.badge, paddingX: value })} />
          <ThemeRangeField label="Відступ по вертикалі" value={theme.badge.paddingY} min={0} max={20} onChange={(value) => updateTheme('badge', { ...theme.badge, paddingY: value })} />
        </ThemeSection>

        <ThemeSection title="Типографіка картки">
          <ThemeColorField label="Колір бренду" value={theme.typography.brandColor} onChange={(value) => updateTheme('typography', { ...theme.typography, brandColor: value })} />
          <ThemeRangeField label="Розмір бренду" value={theme.typography.brandSize} min={9} max={28} onChange={(value) => updateTheme('typography', { ...theme.typography, brandSize: value })} />
          <ThemeSelectField label="Вага бренду" value={String(theme.typography.brandWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, brandWeight: Number(value) })} />
          <ThemeColorField label="Колір назви" value={theme.typography.titleColor} onChange={(value) => updateTheme('typography', { ...theme.typography, titleColor: value })} />
          <ThemeRangeField label="Розмір назви" value={theme.typography.titleSize} min={10} max={34} onChange={(value) => updateTheme('typography', { ...theme.typography, titleSize: value })} />
          <ThemeSelectField label="Вага назви" value={String(theme.typography.titleWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, titleWeight: Number(value) })} />
          <ThemeRangeField label="Рядків назви" value={theme.typography.titleLines} min={1} max={5} suffix="" onChange={(value) => updateTheme('typography', { ...theme.typography, titleLines: value })} />
          <ThemeColorField label="Колір службових даних" value={theme.typography.metaColor} onChange={(value) => updateTheme('typography', { ...theme.typography, metaColor: value })} />
          <ThemeRangeField label="Розмір службових даних" value={theme.typography.metaSize} min={8} max={22} onChange={(value) => updateTheme('typography', { ...theme.typography, metaSize: value })} />
          <ThemeColorField label="Колір ціни" value={theme.typography.priceColor} onChange={(value) => updateTheme('typography', { ...theme.typography, priceColor: value })} />
          <ThemeRangeField label="Розмір ціни" value={theme.typography.priceSize} min={12} max={42} onChange={(value) => updateTheme('typography', { ...theme.typography, priceSize: value })} />
          <ThemeSelectField label="Вага ціни" value={String(theme.typography.priceWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('typography', { ...theme.typography, priceWeight: Number(value) })} />
        </ThemeSection>

        <ThemeSection title="Кнопка покупки">
          <ThemeTextField label="Текст кнопки" value={theme.button.label} onChange={(value) => updateTheme('button', { ...theme.button, label: value })} />
          <ThemeTextField label="Текст недоступного товару" value={theme.button.unavailableLabel} onChange={(value) => updateTheme('button', { ...theme.button, unavailableLabel: value })} />
          <ThemeToggle label="На всю ширину" checked={theme.button.fullWidth} onChange={(value) => updateTheme('button', { ...theme.button, fullWidth: value })} />
          <ThemeColorField label="Фон" value={theme.button.background} onChange={(value) => updateTheme('button', { ...theme.button, background: value })} />
          <ThemeColorField label="Фон при hover" value={theme.button.hoverBackground} onChange={(value) => updateTheme('button', { ...theme.button, hoverBackground: value })} />
          <ThemeColorField label="Колір тексту" value={theme.button.textColor} onChange={(value) => updateTheme('button', { ...theme.button, textColor: value })} />
          <ThemeRangeField label="Висота" value={theme.button.height} min={30} max={72} onChange={(value) => updateTheme('button', { ...theme.button, height: value })} />
          <ThemeRangeField label="Радіус" value={theme.button.radius} min={0} max={40} onChange={(value) => updateTheme('button', { ...theme.button, radius: value })} />
          <ThemeRangeField label="Розмір тексту" value={theme.button.fontSize} min={9} max={24} onChange={(value) => updateTheme('button', { ...theme.button, fontSize: value })} />
          <ThemeSelectField label="Вага" value={String(theme.button.fontWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('button', { ...theme.button, fontWeight: Number(value) })} />
        </ThemeSection>

        <ThemeSection title="Модифікації">
          <ThemeSelectField label="Режим відображення" value={theme.modifications.mode} options={[{ value: 'hover', label: 'При наведенні' }, { value: 'always', label: 'Завжди' }, { value: 'hidden', label: 'Приховано' }]} onChange={(value) => updateTheme('modifications', { ...theme.modifications, mode: value as CatalogProductCardTheme['modifications']['mode'] })} />
          <ThemeColorField label="Колір підпису" value={theme.modifications.labelColor} onChange={(value) => updateTheme('modifications', { ...theme.modifications, labelColor: value })} />
          <ThemeColorField label="Фон варіанта" value={theme.modifications.optionBackground} onChange={(value) => updateTheme('modifications', { ...theme.modifications, optionBackground: value })} />
          <ThemeColorField label="Текст варіанта" value={theme.modifications.optionTextColor} onChange={(value) => updateTheme('modifications', { ...theme.modifications, optionTextColor: value })} />
          <ThemeColorField label="Рамка варіанта" value={theme.modifications.optionBorderColor} onChange={(value) => updateTheme('modifications', { ...theme.modifications, optionBorderColor: value })} />
          <ThemeColorField label="Фон активного" value={theme.modifications.activeBackground} onChange={(value) => updateTheme('modifications', { ...theme.modifications, activeBackground: value })} />
          <ThemeColorField label="Текст активного" value={theme.modifications.activeTextColor} onChange={(value) => updateTheme('modifications', { ...theme.modifications, activeTextColor: value })} />
          <ThemeColorField label="Рамка активного" value={theme.modifications.activeBorderColor} onChange={(value) => updateTheme('modifications', { ...theme.modifications, activeBorderColor: value })} />
          <ThemeRangeField label="Радіус" value={theme.modifications.radius} min={0} max={32} onChange={(value) => updateTheme('modifications', { ...theme.modifications, radius: value })} />
          <ThemeRangeField label="Висота варіанта" value={theme.modifications.optionHeight} min={24} max={60} onChange={(value) => updateTheme('modifications', { ...theme.modifications, optionHeight: value })} />
          <ThemeRangeField label="Розмір кольору" value={theme.modifications.swatchSize} min={24} max={60} onChange={(value) => updateTheme('modifications', { ...theme.modifications, swatchSize: value })} />
        </ThemeSection>
      </div>

      <aside className="catalog-theme-builder__preview">
        <header>
          <div><strong>Живий preview картки</strong><span>Використовує активну тему вітрини</span></div>
          <div className="catalog-theme-builder__preview-actions">
            <button className="button button--primary catalog-theme-builder__preview-save" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}><Icon name="save" size={16} /> {saveSettings.isPending ? 'Збереження…' : 'Зберегти'}</button>
            <CatalogThemeDeviceSwitch device={device} onChange={setDevice} />
          </div>
        </header>
        <CatalogThemePreview storefrontTheme={storefrontTheme} cardTheme={theme} device={device} cardOnly />
      </aside>
    </div>}
  </div>;
}
