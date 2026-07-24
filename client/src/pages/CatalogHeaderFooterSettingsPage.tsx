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
import { convertCatalogImageToWebp, maxCatalogImageBytes } from '../lib/catalog-media';
import { cloneStorefrontTheme, defaultProductCardTheme, defaultStorefrontTheme, fontWeightOptions } from '../lib/storefront-theme';
import { useUndoableState } from '../lib/use-undoable-state';
import { useToast } from '../toast/ToastContext';
import type {
  CatalogStorefrontFooterSection,
  CatalogStorefrontLink,
  CatalogStorefrontSocialLink,
  CatalogStorefrontSocialPlatform,
  CatalogStorefrontTheme
} from '../types/catalog';

const shadowOptions = [
  { value: 'none', label: 'Без тіні' },
  { value: 'soft', label: 'М’яка' },
  { value: 'strong', label: 'Виразна' }
];

const socialOptions: Array<{ value: CatalogStorefrontSocialPlatform; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' }
];

const mobileMenuAlignmentOptions = [
  { value: 'left', label: 'Ліворуч' },
  { value: 'center', label: 'По центру' },
  { value: 'right', label: 'Праворуч' }
];

type LogoTarget = 'header' | 'footer';
type LogoUploadState = { busy: boolean; progress: number; error: string };

function LogoEditor({
  title,
  logoUrl,
  fallback,
  upload,
  onUpload,
  onRemove
}: {
  title: string;
  logoUrl: string;
  fallback: string;
  upload: LogoUploadState;
  onUpload: (file?: File) => void;
  onRemove: () => void;
}) {
  return <div className="catalog-theme-logo catalog-theme-control--wide">
    <span>{title}</span>
    <div className="catalog-theme-logo__body">
      <div className="catalog-theme-logo__preview">
        {logoUrl ? <img src={logoUrl} alt={`Поточний логотип ${title.toLowerCase()}`} /> : <span>{fallback || 'LOGO'}</span>}
      </div>
      <div className="catalog-theme-logo__actions">
        <label className="button button--secondary button--small">
          <Icon name="upload" size={15} /> {upload.busy ? `Завантаження ${upload.progress}%` : logoUrl ? 'Замінити PNG' : 'Завантажити PNG'}
          <input className="visually-hidden" type="file" accept="image/png,.png" disabled={upload.busy} onChange={(event) => {
            onUpload(event.target.files?.[0]);
            event.currentTarget.value = '';
          }} />
        </label>
        {logoUrl && <button className="button button--danger button--small" type="button" disabled={upload.busy} onClick={onRemove}>Видалити</button>}
      </div>
    </div>
    <small>PNG до 5 МБ. Файл автоматично оптимізується у WebP.</small>
    {upload.error && <small className="catalog-theme-logo__error" role="alert">{upload.error}</small>}
  </div>;
}

function createThemeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createLink(prefix = 'link'): CatalogStorefrontLink {
  return { id: createThemeId(prefix), label: 'Нове посилання', url: '/', newTab: false };
}

function createSocial(): CatalogStorefrontSocialLink {
  return { id: createThemeId('social'), platform: 'instagram', label: 'Instagram', url: '' };
}

function reorder<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function ItemActions({
  index,
  count,
  onMove,
  onDelete
}: {
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return <div className="catalog-chrome-item__actions">
    <button type="button" aria-label="Перемістити вище" title="Перемістити вище" disabled={index === 0} onClick={() => onMove(-1)}><Icon name="arrowUp" size={16} /></button>
    <button type="button" aria-label="Перемістити нижче" title="Перемістити нижче" disabled={index === count - 1} onClick={() => onMove(1)}><Icon name="arrowDown" size={16} /></button>
    <button className="catalog-chrome-item__delete" type="button" aria-label="Видалити" title="Видалити" onClick={onDelete}><Icon name="delete" size={16} /></button>
  </div>;
}

function LinksEditor({
  links,
  limit,
  onChange
}: {
  links: CatalogStorefrontLink[];
  limit: number;
  onChange: (links: CatalogStorefrontLink[]) => void;
}) {
  return <div className="catalog-chrome-list catalog-theme-control--wide">
    <div className="catalog-chrome-list__heading">
      <div><strong>Посилання</strong><small>Назва та адреса сторінки або зовнішнього ресурсу.</small></div>
      <button className="button button--secondary button--small" type="button" disabled={links.length >= limit} onClick={() => onChange([...links, createLink()])}><Icon name="add" size={15} /> Додати</button>
    </div>
    {links.length === 0 ? <p className="catalog-chrome-list__empty">Посилань ще немає.</p> : links.map((link, index) => <div className="catalog-chrome-item" key={link.id}>
      <label className="field"><span>Назва</span><input value={link.label} maxLength={80} onChange={(event) => onChange(links.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} /></label>
      <label className="field"><span>URL</span><input value={link.url} maxLength={2000} placeholder="/, /delivery або https://…" onChange={(event) => onChange(links.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} /></label>
      <label className="catalog-chrome-checkbox"><input type="checkbox" checked={link.newTab} onChange={(event) => onChange(links.map((item) => item.id === link.id ? { ...item, newTab: event.target.checked } : item))} /><span>Нова вкладка</span></label>
      <ItemActions index={index} count={links.length} onMove={(direction) => onChange(reorder(links, index, direction))} onDelete={() => onChange(links.filter((item) => item.id !== link.id))} />
    </div>)}
  </div>;
}

function SocialEditor({
  links,
  onChange
}: {
  links: CatalogStorefrontSocialLink[];
  onChange: (links: CatalogStorefrontSocialLink[]) => void;
}) {
  return <div className="catalog-chrome-list catalog-theme-control--wide">
    <div className="catalog-chrome-list__heading">
      <div><strong>Соціальні мережі</strong><small>Іконки відкриватимуться у новій вкладці.</small></div>
      <button className="button button--secondary button--small" type="button" disabled={links.length >= 8} onClick={() => onChange([...links, createSocial()])}><Icon name="add" size={15} /> Додати</button>
    </div>
    {links.length === 0 ? <p className="catalog-chrome-list__empty">Соціальних мереж ще немає.</p> : links.map((link, index) => <div className="catalog-chrome-item catalog-chrome-item--social" key={link.id}>
      <label className="field"><span>Мережа</span><StyledSelect value={link.platform} options={socialOptions} onChange={(value) => {
        const platform = value as CatalogStorefrontSocialPlatform;
        onChange(links.map((item) => item.id === link.id ? { ...item, platform, label: item.label || socialOptions.find((option) => option.value === platform)?.label || '' } : item));
      }} /></label>
      <label className="field"><span>Підпис</span><input value={link.label} maxLength={80} placeholder="Необов’язково" onChange={(event) => onChange(links.map((item) => item.id === link.id ? { ...item, label: event.target.value } : item))} /></label>
      <label className="field catalog-chrome-item__url"><span>URL профілю</span><input value={link.url} maxLength={2000} placeholder="https://…" onChange={(event) => onChange(links.map((item) => item.id === link.id ? { ...item, url: event.target.value } : item))} /></label>
      <ItemActions index={index} count={links.length} onMove={(direction) => onChange(reorder(links, index, direction))} onDelete={() => onChange(links.filter((item) => item.id !== link.id))} />
    </div>)}
  </div>;
}

function FooterSectionsEditor({
  sections,
  onChange
}: {
  sections: CatalogStorefrontFooterSection[];
  onChange: (sections: CatalogStorefrontFooterSection[]) => void;
}) {
  return <div className="catalog-chrome-sections catalog-theme-control--wide">
    <div className="catalog-chrome-list__heading">
      <div><strong>Колонки посилань</strong><small>До чотирьох навігаційних колонок у футері.</small></div>
      <button className="button button--secondary button--small" type="button" disabled={sections.length >= 4} onClick={() => onChange([...sections, { id: createThemeId('section'), title: 'Нова колонка', links: [createLink('footer-link')] }])}><Icon name="add" size={15} /> Додати колонку</button>
    </div>
    {sections.map((section, index) => <section className="catalog-chrome-section" key={section.id}>
      <header>
        <label className="field"><span>Назва колонки</span><input value={section.title} maxLength={80} onChange={(event) => onChange(sections.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item))} /></label>
        <ItemActions index={index} count={sections.length} onMove={(direction) => onChange(reorder(sections, index, direction))} onDelete={() => onChange(sections.filter((item) => item.id !== section.id))} />
      </header>
      <LinksEditor links={section.links} limit={10} onChange={(links) => onChange(sections.map((item) => item.id === section.id ? { ...item, links } : item))} />
    </section>)}
    {sections.length === 0 && <p className="catalog-chrome-list__empty">Колонок ще немає.</p>}
  </div>;
}

export function CatalogHeaderFooterSettingsPage() {
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
  } = useUndoableState<CatalogStorefrontTheme>(() => cloneStorefrontTheme());
  const [device, setDevice] = useState<CatalogThemeDevice>('desktop');
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [logoUploads, setLogoUploads] = useState<Record<LogoTarget, LogoUploadState>>({
    header: { busy: false, progress: 0, error: '' },
    footer: { busy: false, progress: 0, error: '' }
  });

  useEffect(() => {
    if (!settings.data) return;
    const next = cloneStorefrontTheme(settings.data.storefrontTheme);
    replaceTheme(next);
    setSavedSnapshot(JSON.stringify(next));
  }, [replaceTheme, settings.data]);

  const currentSnapshot = useMemo(() => JSON.stringify(theme), [theme]);
  const hasUnsavedChanges = Boolean(savedSnapshot && currentSnapshot !== savedSnapshot);
  const cardTheme = settings.data?.productCardTheme || defaultProductCardTheme;

  function updateTheme<K extends keyof CatalogStorefrontTheme>(section: K, value: CatalogStorefrontTheme[K]) {
    setTheme((current) => ({ ...current, [section]: value }));
  }

  async function submit() {
    try {
      const saved = await saveSettings.mutateAsync({ storefrontTheme: theme });
      const next = cloneStorefrontTheme(saved.storefrontTheme);
      replaceTheme(next);
      setSavedSnapshot(JSON.stringify(next));
      await queryClient.invalidateQueries({ queryKey: ['catalog-storefront-settings'] });
      showToast('Хедер і футер збережено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти хедер і футер.', 'error');
    }
  }

  function resetChrome() {
    setTheme((current) => ({
      ...current,
      header: structuredClone(defaultStorefrontTheme.header),
      footer: structuredClone(defaultStorefrontTheme.footer)
    }));
  }

  async function uploadLogo(target: LogoTarget, file?: File) {
    if (!file) return;
    const isPng = file.type.toLowerCase() === 'image/png' || file.name.toLowerCase().endsWith('.png');
    if (!isPng) {
      setLogoUploads((current) => ({ ...current, [target]: { busy: false, progress: 0, error: 'Оберіть логотип у форматі PNG.' } }));
      return;
    }
    if (file.size > maxCatalogImageBytes) {
      setLogoUploads((current) => ({ ...current, [target]: { busy: false, progress: 0, error: 'Логотип має бути до 5 МБ.' } }));
      return;
    }
    setLogoUploads((current) => ({ ...current, [target]: { busy: true, progress: 0, error: '' } }));
    try {
      const webp = await convertCatalogImageToWebp(file);
      const asset = await api.catalog.uploadMedia(webp, file.name.replace(/\.png$/i, '.webp'), (progress) => {
        setLogoUploads((current) => ({ ...current, [target]: { ...current[target], progress } }));
      });
      setTheme((current) => ({
        ...current,
        [target]: { ...current[target], logoUrl: asset.url }
      }));
      setLogoUploads((current) => ({ ...current, [target]: { busy: false, progress: 100, error: '' } }));
    } catch (error) {
      setLogoUploads((current) => ({
        ...current,
        [target]: { busy: false, progress: 0, error: error instanceof Error ? error.message : 'Не вдалося завантажити логотип.' }
      }));
    }
  }

  return <div className="catalog-theme-page">
    <section className="task-toolbar catalog-theme-page__header">
      <div><p className="eyebrow">Storefront builder</p><h1>Хедер і футер</h1><p>Брендинг, навігація, контакти й соціальні мережі публічної вітрини.</p></div>
      <div className="task-toolbar__controls">
        <span className={`catalog-unsaved-badge${hasUnsavedChanges ? '' : ' catalog-unsaved-badge--hidden'}`} aria-hidden={!hasUnsavedChanges}><Icon name="schedule" size={15} /> Незбережені зміни</span>
        <button className="button button--secondary" type="button" disabled={!canUndo} onClick={undo} title={canUndo ? `Скасувати останню дію (${historyDepth}/15) · Ctrl+Z` : 'Немає дій для скасування'}><Icon name="undo" size={16} /> Скасувати</button>
        <a className="button button--secondary" href="/catalog/preview/storefront" target="_blank" rel="noreferrer"><Icon name="openInNew" size={16} /> Відкрити preview</a>
        <button className="button button--secondary" type="button" onClick={resetChrome}><Icon name="reply" size={16} /> Стандартний вигляд</button>
        <button className="button button--primary" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}><Icon name="save" size={16} /> Зберегти</button>
      </div>
    </section>

    {settings.isError ? <section className="catalog-placeholder"><h2>Не вдалося завантажити налаштування</h2><p>Перевірте з’єднання та спробуйте ще раз.</p><button className="button button--secondary" type="button" onClick={() => void settings.refetch()}>Повторити</button></section>
      : settings.isLoading ? <section className="catalog-placeholder"><h2>Завантаження конструктора…</h2></section> : <div className="catalog-theme-builder">
      <div className="catalog-theme-builder__controls">
        <ThemeSection title="Хедер" description="Логотип, назва та поведінка верхньої панелі.">
          <ThemeToggle label="Показувати хедер" checked={theme.header.visible} onChange={(value) => updateTheme('header', { ...theme.header, visible: value })} />
          <ThemeToggle label="Закріпити при прокручуванні" checked={theme.header.sticky} onChange={(value) => updateTheme('header', { ...theme.header, sticky: value })} />
          <ThemeToggle label="Показувати кнопку Workspace" checked={theme.header.actionVisible} onChange={(value) => updateTheme('header', { ...theme.header, actionVisible: value })} />
          <LogoEditor
            title="Логотип хедера"
            logoUrl={theme.header.logoUrl}
            fallback={theme.header.brandMark}
            upload={logoUploads.header}
            onUpload={(file) => void uploadLogo('header', file)}
            onRemove={() => updateTheme('header', { ...theme.header, logoUrl: '' })}
          />
          <ThemeTextField label="Назва бренду" value={theme.header.brandText} onChange={(value) => updateTheme('header', { ...theme.header, brandText: value })} />
          <ThemeTextField label="Слоган" value={theme.header.tagline} onChange={(value) => updateTheme('header', { ...theme.header, tagline: value })} />
          <ThemeTextField label="Знак без логотипу" value={theme.header.brandMark} onChange={(value) => updateTheme('header', { ...theme.header, brandMark: value.slice(0, 8) })} />
          <ThemeTextField label="Посилання логотипу" value={theme.header.logoLink} placeholder="https://example.com або /" onChange={(value) => updateTheme('header', { ...theme.header, logoLink: value })} />
          <ThemeRangeField label="Висота логотипу" value={theme.header.logoHeight} min={20} max={120} onChange={(value) => updateTheme('header', { ...theme.header, logoHeight: value })} />
          <h3>Типографіка хедера</h3>
          <ThemeRangeField label="Розмір назви" value={theme.header.brandSize} min={10} max={34} onChange={(value) => updateTheme('header', { ...theme.header, brandSize: value })} />
          <ThemeSelectField label="Вага назви" value={String(theme.header.brandWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('header', { ...theme.header, brandWeight: Number(value) })} />
          <ThemeRangeField label="Розмір слогана" value={theme.header.taglineSize} min={8} max={24} onChange={(value) => updateTheme('header', { ...theme.header, taglineSize: value })} />
          <ThemeSelectField label="Вага слогана" value={String(theme.header.taglineWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('header', { ...theme.header, taglineWeight: Number(value) })} />
          <ThemeRangeField label="Розмір навігації" value={theme.header.linkSize} min={9} max={28} onChange={(value) => updateTheme('header', { ...theme.header, linkSize: value })} />
          <ThemeSelectField label="Вага навігації" value={String(theme.header.linkWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('header', { ...theme.header, linkWeight: Number(value) })} />
          <h3>Оформлення хедера</h3>
          <ThemeColorField label="Фон" value={theme.header.background} onChange={(value) => updateTheme('header', { ...theme.header, background: value })} />
          <ThemeColorField label="Основний текст" value={theme.header.textColor} onChange={(value) => updateTheme('header', { ...theme.header, textColor: value })} />
          <ThemeColorField label="Слоган" value={theme.header.mutedColor} onChange={(value) => updateTheme('header', { ...theme.header, mutedColor: value })} />
          <ThemeColorField label="Посилання" value={theme.header.linkColor} onChange={(value) => updateTheme('header', { ...theme.header, linkColor: value })} />
          <ThemeColorField label="Рамка" value={theme.header.borderColor} onChange={(value) => updateTheme('header', { ...theme.header, borderColor: value })} />
          <ThemeRangeField label="Мінімальна висота" value={theme.header.height} min={44} max={140} onChange={(value) => updateTheme('header', { ...theme.header, height: value })} />
          <ThemeRangeField label="Горизонтальний відступ" value={theme.header.paddingX} min={0} max={80} onChange={(value) => updateTheme('header', { ...theme.header, paddingX: value })} />
          <ThemeRangeField label="Вертикальний відступ" value={theme.header.paddingY} min={0} max={50} onChange={(value) => updateTheme('header', { ...theme.header, paddingY: value })} />
          <ThemeRangeField label="Радіус" value={theme.header.radius} min={0} max={40} onChange={(value) => updateTheme('header', { ...theme.header, radius: value })} />
          <ThemeRangeField label="Товщина рамки" value={theme.header.borderWidth} min={0} max={6} onChange={(value) => updateTheme('header', { ...theme.header, borderWidth: value })} />
          <ThemeSelectField label="Тінь" value={theme.header.shadow} options={shadowOptions} onChange={(value) => updateTheme('header', { ...theme.header, shadow: value as CatalogStorefrontTheme['header']['shadow'] })} />
        </ThemeSection>

        <ThemeSection title="Навігація хедера" description="Порядок посилань відповідає порядку у списку.">
          <LinksEditor links={theme.header.links} limit={12} onChange={(links) => updateTheme('header', { ...theme.header, links })} />
          <SocialEditor links={theme.header.socialLinks} onChange={(socialLinks) => updateTheme('header', { ...theme.header, socialLinks })} />
        </ThemeSection>

        <ThemeSection title="Мобільне меню" description="Окреме оформлення burger-кнопки та панелі навігації на екранах до 700 px. Посилання і їх порядок беруться з навігації хедера.">
          <ThemeColorField label="Фон меню" value={theme.header.mobileMenu.background} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, background: value } })} />
          <ThemeColorField label="Колір посилань" value={theme.header.mobileMenu.textColor} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, textColor: value } })} />
          <ThemeColorField label="Розділювачі" value={theme.header.mobileMenu.dividerColor} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, dividerColor: value } })} />
          <ThemeColorField label="Фон burger-кнопки" value={theme.header.mobileMenu.toggleBackground} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, toggleBackground: value } })} />
          <ThemeColorField label="Іконка burger-кнопки" value={theme.header.mobileMenu.toggleColor} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, toggleColor: value } })} />
          <ThemeColorField label="Рамка burger-кнопки" value={theme.header.mobileMenu.toggleBorderColor} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, toggleBorderColor: value } })} />
          <ThemeRangeField label="Розмір burger-кнопки" value={theme.header.mobileMenu.toggleSize} min={36} max={56} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, toggleSize: value } })} />
          <ThemeRangeField label="Радіус burger-кнопки" value={theme.header.mobileMenu.toggleRadius} min={0} max={28} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, toggleRadius: value } })} />
          <ThemeRangeField label="Розмір посилань" value={theme.header.mobileMenu.linkSize} min={9} max={28} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, linkSize: value } })} />
          <ThemeSelectField label="Вага посилань" value={String(theme.header.mobileMenu.linkWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, linkWeight: Number(value) } })} />
          <ThemeSelectField label="Вирівнювання пунктів" value={theme.header.mobileMenu.alignment} options={mobileMenuAlignmentOptions} onChange={(value) => updateTheme('header', { ...theme.header, mobileMenu: { ...theme.header.mobileMenu, alignment: value as CatalogStorefrontTheme['header']['mobileMenu']['alignment'] } })} />
        </ThemeSection>

        <ThemeSection title="Футер" description="Нижня частина вітрини з брендингом, контактами та службовою інформацією.">
          <ThemeToggle label="Показувати футер" checked={theme.footer.visible} onChange={(value) => updateTheme('footer', { ...theme.footer, visible: value })} />
          <ThemeToggle label="Показувати логотип і бренд" checked={theme.footer.showLogo} onChange={(value) => updateTheme('footer', { ...theme.footer, showLogo: value })} />
          <LogoEditor
            title="Логотип футера"
            logoUrl={theme.footer.logoUrl}
            fallback={theme.header.brandMark}
            upload={logoUploads.footer}
            onUpload={(file) => void uploadLogo('footer', file)}
            onRemove={() => updateTheme('footer', { ...theme.footer, logoUrl: '' })}
          />
          {theme.header.logoUrl && theme.footer.logoUrl !== theme.header.logoUrl && <div className="catalog-theme-control--wide">
            <button className="button button--secondary button--small" type="button" onClick={() => updateTheme('footer', { ...theme.footer, logoUrl: theme.header.logoUrl })}>Використати логотип хедера</button>
          </div>}
          <ThemeRangeField label="Висота логотипу футера" value={theme.footer.logoHeight} min={20} max={120} onChange={(value) => updateTheme('footer', { ...theme.footer, logoHeight: value })} />
          <ThemeTextField label="Назва бренду" value={theme.footer.brandText} onChange={(value) => updateTheme('footer', { ...theme.footer, brandText: value })} />
          <label className="field catalog-theme-control--wide"><span>Короткий опис</span><textarea rows={3} value={theme.footer.description} maxLength={500} onChange={(event) => updateTheme('footer', { ...theme.footer, description: event.target.value })} /></label>
          <ThemeTextField label="Email" value={theme.footer.email} placeholder="hello@example.com" onChange={(value) => updateTheme('footer', { ...theme.footer, email: value })} />
          <ThemeTextField label="Телефон" value={theme.footer.phone} placeholder="+380…" onChange={(value) => updateTheme('footer', { ...theme.footer, phone: value })} />
          <ThemeTextField label="Адреса" value={theme.footer.address} onChange={(value) => updateTheme('footer', { ...theme.footer, address: value })} />
          <ThemeTextField label="Копірайт" value={theme.footer.copyright} placeholder="Можна використати {year}" onChange={(value) => updateTheme('footer', { ...theme.footer, copyright: value })} />
          <h3>Типографіка футера</h3>
          <ThemeRangeField label="Розмір назви бренду" value={theme.footer.brandSize} min={10} max={34} onChange={(value) => updateTheme('footer', { ...theme.footer, brandSize: value })} />
          <ThemeSelectField label="Вага назви бренду" value={String(theme.footer.brandWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('footer', { ...theme.footer, brandWeight: Number(value) })} />
          <ThemeRangeField label="Розмір опису й контактів" value={theme.footer.bodySize} min={9} max={24} onChange={(value) => updateTheme('footer', { ...theme.footer, bodySize: value })} />
          <ThemeSelectField label="Вага опису й контактів" value={String(theme.footer.bodyWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('footer', { ...theme.footer, bodyWeight: Number(value) })} />
          <ThemeRangeField label="Розмір заголовків колонок" value={theme.footer.headingSize} min={9} max={28} onChange={(value) => updateTheme('footer', { ...theme.footer, headingSize: value })} />
          <ThemeSelectField label="Вага заголовків колонок" value={String(theme.footer.headingWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('footer', { ...theme.footer, headingWeight: Number(value) })} />
          <ThemeRangeField label="Розмір посилань" value={theme.footer.linkSize} min={9} max={24} onChange={(value) => updateTheme('footer', { ...theme.footer, linkSize: value })} />
          <ThemeSelectField label="Вага посилань" value={String(theme.footer.linkWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('footer', { ...theme.footer, linkWeight: Number(value) })} />
          <ThemeRangeField label="Розмір копірайту" value={theme.footer.copyrightSize} min={8} max={20} onChange={(value) => updateTheme('footer', { ...theme.footer, copyrightSize: value })} />
          <ThemeSelectField label="Вага копірайту" value={String(theme.footer.copyrightWeight)} options={fontWeightOptions} onChange={(value) => updateTheme('footer', { ...theme.footer, copyrightWeight: Number(value) })} />
          <h3>Оформлення футера</h3>
          <ThemeColorField label="Фон" value={theme.footer.background} onChange={(value) => updateTheme('footer', { ...theme.footer, background: value })} />
          <ThemeColorField label="Основний текст" value={theme.footer.textColor} onChange={(value) => updateTheme('footer', { ...theme.footer, textColor: value })} />
          <ThemeColorField label="Другорядний текст" value={theme.footer.mutedColor} onChange={(value) => updateTheme('footer', { ...theme.footer, mutedColor: value })} />
          <ThemeColorField label="Рамка" value={theme.footer.borderColor} onChange={(value) => updateTheme('footer', { ...theme.footer, borderColor: value })} />
          <ThemeRangeField label="Товщина рамки" value={theme.footer.borderWidth} min={0} max={6} onChange={(value) => updateTheme('footer', { ...theme.footer, borderWidth: value })} />
          <ThemeRangeField label="Відступ зверху" value={theme.footer.paddingTop} min={0} max={120} onChange={(value) => updateTheme('footer', { ...theme.footer, paddingTop: value })} />
          <ThemeRangeField label="Відступ знизу" value={theme.footer.paddingBottom} min={0} max={120} onChange={(value) => updateTheme('footer', { ...theme.footer, paddingBottom: value })} />
        </ThemeSection>

        <ThemeSection title="Навігація футера">
          <FooterSectionsEditor sections={theme.footer.sections} onChange={(sections) => updateTheme('footer', { ...theme.footer, sections })} />
          <SocialEditor links={theme.footer.socialLinks} onChange={(socialLinks) => updateTheme('footer', { ...theme.footer, socialLinks })} />
        </ThemeSection>
      </div>

      <aside className="catalog-theme-builder__preview">
        <header>
          <div><strong>Живий preview</strong><span>Хедер і футер оновлюються одразу</span></div>
          <div className="catalog-theme-builder__preview-actions">
            <button className="button button--primary catalog-theme-builder__preview-save" type="button" disabled={saveSettings.isPending || !hasUnsavedChanges} onClick={() => void submit()}><Icon name="save" size={16} /> {saveSettings.isPending ? 'Збереження…' : 'Зберегти'}</button>
            <CatalogThemeDeviceSwitch device={device} onChange={setDevice} />
          </div>
        </header>
        <CatalogThemePreview storefrontTheme={theme} cardTheme={cardTheme} device={device} />
      </aside>
    </div>}
  </div>;
}
