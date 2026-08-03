import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { MediaPickerDialog, resolveMediaAssetUrl } from '../components/MediaLibraryBrowser';
import { RichTextField } from '../components/RichTextField';
import {
  blogBlockLabels,
  createBlogBlock,
  createBlogPostDocument,
  createBlogSection,
  generateBlogPostExport,
  normalizeBlogPostDocument,
  normalizeSlug
} from '../lib/blog-editor';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  BlogCardItem,
  BlogContentBlock,
  BlogFaqItem,
  BlogPostDocument,
  BlogPostSection
} from '../types/blog-editor';
import type { MediaAsset } from '../types/media';
import '../styles/blog-post-editor.css';

const blockTypes = Object.entries(blogBlockLabels) as Array<[BlogContentBlock['type'], string]>;
type ImageTarget = { type: 'hero' } | { type: 'block'; sectionId: string; blockId: string };

const linkAppearancePresets = {
  blackYellow: { backgroundColor: '#000000', textColor: '#ffe101', borderColor: '#ffe101' },
  yellowBlack: { backgroundColor: '#ffe101', textColor: '#000000', borderColor: '#ffe101' },
  outline: { backgroundColor: '#ffffff', textColor: '#161616', borderColor: '#d8d8d8' }
} as const;

function currentLinkPreset(appearance: BlogPostDocument['linkAppearance']) {
  return (Object.entries(linkAppearancePresets).find(([, preset]) => (
    preset.backgroundColor === appearance.backgroundColor
    && preset.textColor === appearance.textColor
    && preset.borderColor === appearance.borderColor
  ))?.[0] || 'custom') as keyof typeof linkAppearancePresets | 'custom';
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function BlockShell({ block, index, total, onMove, onRemove, children }: {
  block: BlogContentBlock;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return <article className="blog-editor-block">
    <header>
      <span>{blogBlockLabels[block.type]}</span>
      <div>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Перемістити блок вище"><Icon name="arrowUp" size={17} /></button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Перемістити блок нижче"><Icon name="arrowDown" size={17} /></button>
        <button type="button" className="blog-editor-danger" onClick={onRemove} aria-label="Видалити блок"><Icon name="delete" size={17} /></button>
      </div>
    </header>
    <div className="blog-editor-block__body">{children}</div>
  </article>;
}

function TextListEditor({ values, onChange, label }: { values: string[]; onChange: (values: string[]) => void; label: string }) {
  return <div className="blog-editor-repeat-list">
    {values.map((value, index) => <div key={index}>
      <input value={value} aria-label={`${label} ${index + 1}`} onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />
      <button type="button" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Видалити ${label.toLowerCase()} ${index + 1}`}><Icon name="close" size={16} /></button>
    </div>)}
    <button className="blog-editor-inline-add" type="button" onClick={() => onChange([...values, ''])}><Icon name="add" size={16} /> Додати</button>
  </div>;
}

function BlockEditor({ block, onChange, onPickImage }: { block: BlogContentBlock; onChange: (block: BlogContentBlock) => void; onPickImage: () => void }) {
  if (block.type === 'paragraph') return <div className="field"><span>Текст</span><RichTextField value={block.text} onChange={(text) => onChange({ ...block, text })} rows={6} /></div>;
  if (block.type === 'subheading') return <label className="field"><span>Підзаголовок</span><input value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} /></label>;
  if (block.type === 'image') return <div className="blog-editor-fields">
    <div className="field blog-editor-field--wide"><span>Посилання на зображення</span><div className="blog-editor-image-field"><input type="url" value={block.url} placeholder="https://…" aria-label="Посилання на зображення" onChange={(event) => onChange({ ...block, url: event.target.value })} /><button className="button button--secondary" type="button" onClick={onPickImage}><Icon name="image" size={17} /> Завантажити або обрати</button></div></div>
    <label className="field"><span>Alt-текст</span><input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} /></label>
    <label className="field"><span>Підпис</span><input value={block.caption} onChange={(event) => onChange({ ...block, caption: event.target.value })} /></label>
  </div>;
  if (block.type === 'list') return <div className="blog-editor-fields">
    <label className="blog-editor-check"><input type="checkbox" checked={block.ordered} onChange={(event) => onChange({ ...block, ordered: event.target.checked })} /> Нумерований список</label>
    <div className="blog-editor-field--wide"><TextListEditor label="Пункт" values={block.items} onChange={(items) => onChange({ ...block, items })} /></div>
  </div>;
  if (block.type === 'table') return <div className="blog-editor-table-form">
    <div className="blog-editor-table-form__grid" style={{ gridTemplateColumns: `repeat(${block.headers.length}, minmax(130px, 1fr))` }}>
      {block.headers.map((header, columnIndex) => <input key={`header-${columnIndex}`} value={header} aria-label={`Заголовок колонки ${columnIndex + 1}`} onChange={(event) => onChange({ ...block, headers: block.headers.map((item, index) => index === columnIndex ? event.target.value : item) })} />)}
      {block.rows.flatMap((row, rowIndex) => block.headers.map((_, columnIndex) => <input key={`${rowIndex}-${columnIndex}`} value={row[columnIndex] || ''} aria-label={`Рядок ${rowIndex + 1}, колонка ${columnIndex + 1}`} onChange={(event) => onChange({ ...block, rows: block.rows.map((item, index) => index === rowIndex ? block.headers.map((__, cellIndex) => cellIndex === columnIndex ? event.target.value : item[cellIndex] || '') : item) })} />))}
    </div>
    <div className="blog-editor-table-form__actions">
      <button type="button" onClick={() => onChange({ ...block, rows: [...block.rows, block.headers.map(() => '')] })}><Icon name="add" size={15} /> Рядок</button>
      <button type="button" disabled={block.headers.length >= 12} onClick={() => onChange({ ...block, headers: [...block.headers, `Колонка ${block.headers.length + 1}`], rows: block.rows.map((row) => [...row, '']) })}><Icon name="add" size={15} /> Колонка</button>
      <button type="button" disabled={block.rows.length <= 1} onClick={() => onChange({ ...block, rows: block.rows.slice(0, -1) })}><Icon name="remove" size={15} /> Рядок</button>
      <button type="button" disabled={block.headers.length <= 1} onClick={() => onChange({ ...block, headers: block.headers.slice(0, -1), rows: block.rows.map((row) => row.slice(0, -1)) })}><Icon name="remove" size={15} /> Колонка</button>
    </div>
  </div>;
  if (block.type === 'cards') return <div className="blog-editor-card-form">
    <label className="field"><span>Кількість колонок</span><select value={block.columns} onChange={(event) => onChange({ ...block, columns: Number(event.target.value) as 2 | 3 })}><option value="2">2</option><option value="3">3</option></select></label>
    {block.items.map((card, index) => <div className="blog-editor-repeat-card" key={index}>
      <header><strong>Картка {index + 1}</strong><button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="delete" size={16} /></button></header>
      <label className="field"><span>Заголовок</span><input value={card.title} onChange={(event) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /></label>
      <div className="field"><span>Опис</span><RichTextField value={card.text} rows={3} onChange={(text) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, text } : item) })} /></div>
      <div className="blog-editor-fields"><label className="field"><span>Текст посилання</span><input value={card.linkLabel} onChange={(event) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, linkLabel: event.target.value } : item) })} /></label><label className="field"><span>URL</span><input type="url" value={card.linkUrl} onChange={(event) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, linkUrl: event.target.value } : item) })} /></label></div>
    </div>)}
    <button className="blog-editor-inline-add" type="button" onClick={() => onChange({ ...block, items: [...block.items, { title: 'Нова картка', text: '', linkLabel: '', linkUrl: '' } as BlogCardItem] })}><Icon name="add" size={16} /> Додати картку</button>
  </div>;
  if (block.type === 'callout') return <div className="blog-editor-fields"><label className="field"><span>Заголовок</span><input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} /></label><div className="field blog-editor-field--wide"><span>Текст</span><RichTextField value={block.text} onChange={(text) => onChange({ ...block, text })} /></div></div>;
  if (block.type === 'faq') return <div className="blog-editor-card-form">
    {block.items.map((item, index) => <div className="blog-editor-repeat-card" key={index}>
      <header><strong>Запитання {index + 1}</strong><button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="delete" size={16} /></button></header>
      <label className="field"><span>Запитання</span><input value={item.question} onChange={(event) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, question: event.target.value } : current) })} /></label>
      <div className="field"><span>Відповідь</span><RichTextField value={item.answer} rows={3} onChange={(answer) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, answer } : current) })} /></div>
    </div>)}
    <button className="blog-editor-inline-add" type="button" onClick={() => onChange({ ...block, items: [...block.items, { question: 'Нове запитання?', answer: '' } as BlogFaqItem] })}><Icon name="add" size={16} /> Додати запитання</button>
  </div>;
  return <div className="blog-editor-fields">
    <label className="field"><span>Заголовок</span><input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} /></label>
    <div className="field blog-editor-field--wide"><span>Текст</span><RichTextField value={block.text} onChange={(text) => onChange({ ...block, text })} /></div>
    <label className="field"><span>Текст кнопки</span><input value={block.buttonLabel} onChange={(event) => onChange({ ...block, buttonLabel: event.target.value })} /></label>
    <label className="field"><span>Посилання кнопки</span><input type="url" value={block.buttonUrl} onChange={(event) => onChange({ ...block, buttonUrl: event.target.value })} /></label>
  </div>;
}

function SectionEditor({ section, index, total, onChange, onMove, onRemove, onPickImage }: {
  section: BlogPostSection;
  index: number;
  total: number;
  onChange: (section: BlogPostSection) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onPickImage: (blockId: string) => void;
}) {
  const [blockType, setBlockType] = useState<BlogContentBlock['type']>('paragraph');
  return <details className="blog-editor-section" open>
    <summary><span><small>Секція {index + 1}</small><strong>{section.title || 'Без назви'}</strong></span><span className="blog-editor-section__count">{section.blocks.length} блоків</span></summary>
    <div className="blog-editor-section__body">
      <div className="blog-editor-section__actions">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0}><Icon name="arrowUp" size={16} /> Вище</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}><Icon name="arrowDown" size={16} /> Нижче</button>
        <button type="button" className="blog-editor-danger" onClick={onRemove}><Icon name="delete" size={16} /> Видалити секцію</button>
      </div>
      <div className="blog-editor-fields">
        <label className="field"><span>Заголовок секції</span><input value={section.title} onChange={(event) => onChange({ ...section, title: event.target.value })} /></label>
        <label className="field"><span>Фон</span><select value={section.tone} onChange={(event) => onChange({ ...section, tone: event.target.value as BlogPostSection['tone'] })}><option value="default">Білий</option><option value="soft">М’який жовтий</option></select></label>
      </div>
      <div className="blog-editor-section__blocks">
        {section.blocks.map((block, blockIndex) => <BlockShell key={block.id} block={block} index={blockIndex} total={section.blocks.length} onMove={(direction) => onChange({ ...section, blocks: moveItem(section.blocks, blockIndex, direction) })} onRemove={() => onChange({ ...section, blocks: section.blocks.filter((item) => item.id !== block.id) })}><BlockEditor block={block} onPickImage={() => onPickImage(block.id)} onChange={(next) => onChange({ ...section, blocks: section.blocks.map((item) => item.id === block.id ? next : item) })} /></BlockShell>)}
      </div>
      <div className="blog-editor-add-block"><select value={blockType} aria-label="Тип нового блоку" onChange={(event) => setBlockType(event.target.value as BlogContentBlock['type'])}>{blockTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button button--secondary" type="button" onClick={() => onChange({ ...section, blocks: [...section.blocks, createBlogBlock(blockType)] })}><Icon name="add" size={17} /> Додати блок</button></div>
    </div>
  </details>;
}

export function BlogPostEditorPage() {
  const { publicationId = '' } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const [document, setDocument] = useState<BlogPostDocument | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'editor' | 'code'>('editor');
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [codeTab, setCodeTab] = useState<'combined' | 'html' | 'css' | 'js'>('combined');
  const [imageTarget, setImageTarget] = useState<ImageTarget | null>(null);

  const publication = useQuery({
    queryKey: ['publication-editor', publicationId],
    queryFn: () => api.publications.get(publicationId),
    enabled: Boolean(publicationId)
  });
  const save = useMutation({ mutationFn: (next: BlogPostDocument) => api.publications.saveEditor(publicationId, next) });
  const canEdit = Boolean(user && publication.data && (user.role === 'admin' || user.id === publication.data.creator.id || user.id === publication.data.assignee?.id));

  useEffect(() => {
    if (!publication.data || initialized.current) return;
    initialized.current = true;
    const localKey = `blog-editor:draft:${publication.data.id}`;
    let localDraft: BlogPostDocument | null = null;
    try { localDraft = JSON.parse(localStorage.getItem(localKey) || 'null') as BlogPostDocument | null; } catch { localDraft = null; }
    const source = localDraft || publication.data.editorDocument || createBlogPostDocument(publication.data.title, publication.data.description);
    setDocument(normalizeBlogPostDocument(source, publication.data.title, publication.data.description));
    setDirty(Boolean(localDraft));
  }, [publication.data]);

  useEffect(() => {
    if (!document || !publicationId || !dirty) return;
    const timeout = window.setTimeout(() => localStorage.setItem(`blog-editor:draft:${publicationId}`, JSON.stringify(document)), 400);
    return () => window.clearTimeout(timeout);
  }, [dirty, document, publicationId]);

  const output = useMemo(() => document ? generateBlogPostExport(document) : null, [document]);
  const wordCount = useMemo(() => document ? JSON.stringify(document.sections).replace(/<[^>]+>/gu, ' ').replace(/[^\p{L}\p{N}'’]+/gu, ' ').trim().split(/\s+/).filter(Boolean).length : 0, [document]);

  function update(updater: (current: BlogPostDocument) => BlogPostDocument) {
    if (!canEdit) return;
    setDocument((current) => current ? updater(current) : current);
    setDirty(true);
  }

  function selectImage(asset: MediaAsset) {
    if (!imageTarget) return;
    const url = resolveMediaAssetUrl(asset.url);
    const fallbackAlt = asset.altText || asset.name.replace(/\.[^.]+$/, '');
    update((current) => {
      if (imageTarget.type === 'hero') {
        return { ...current, hero: { ...current.hero, imageUrl: url, imageAlt: current.hero.imageAlt || fallbackAlt } };
      }
      return {
        ...current,
        sections: current.sections.map((section) => section.id !== imageTarget.sectionId ? section : {
          ...section,
          blocks: section.blocks.map((block) => block.id !== imageTarget.blockId || block.type !== 'image'
            ? block
            : { ...block, url, alt: block.alt || fallbackAlt })
        })
      };
    });
  }

  async function saveDocument() {
    if (!document || !canEdit) return;
    try {
      const result = await save.mutateAsync(document);
      localStorage.removeItem(`blog-editor:draft:${publicationId}`);
      setDocument(normalizeBlogPostDocument(result.editorDocument || document, publication.data?.title || '', publication.data?.description || ''));
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['publications'] });
      showToast('Чернетку статті збережено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти статтю.', 'error');
    }
  }

  async function copyCode(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} скопійовано.`);
    } catch { showToast('Не вдалося скопіювати код.', 'error'); }
  }

  if (publication.isLoading || !document) return <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо редактор…</p></div>;
  if (publication.isError || !publication.data) return <div className="task-list-state task-list-state--error"><p>{publication.error instanceof Error ? publication.error.message : 'Публікацію не знайдено.'}</p><Link className="button button--secondary" to="/tools/blog-publications">До контент-плану</Link></div>;

  const code = output?.[codeTab] || '';
  return <div className="blog-editor-page">
    <header className="blog-editor-header">
      <div className="blog-editor-header__title"><Link to="/tools/blog-publications" aria-label="Повернутися до контент-плану"><Icon name="arrowLeft" size={20} /></Link><div><p className="eyebrow">Редактор блогу</p><h1>{publication.data.title}</h1><span>{wordCount} слів · {document.sections.length} секцій · {dirty ? 'є незбережені зміни' : 'збережено'}</span></div></div>
      <div className="blog-editor-header__actions">
        <Link className="button button--secondary" to="/tools/blog-publications/media"><Icon name="storage" size={17} /> Сховище</Link>
        <div className="blog-editor-view-switch"><button className={view === 'editor' ? 'active' : ''} type="button" onClick={() => setView('editor')}><Icon name="visibility" size={17} /> Редактор</button><button className={view === 'code' ? 'active' : ''} type="button" onClick={() => setView('code')}><Icon name="publication" size={17} /> Код</button></div>
        <button className="button button--primary" type="button" disabled={!canEdit || save.isPending || !dirty} onClick={() => void saveDocument()}><Icon name="save" size={18} /> {save.isPending ? 'Зберігаємо…' : 'Зберегти'}</button>
      </div>
    </header>

    {!canEdit && <div className="form-message">У вас доступ лише для перегляду та експорту цієї статті.</div>}

    {view === 'editor' ? <div className="blog-editor-workspace">
      <section className="blog-editor-controls" aria-label="Налаштування статті">
        <details className="blog-editor-panel" open><summary>Налаштування документа</summary><div className="blog-editor-panel__body">
          <label className="field"><span>Slug / HTML ID</span><input value={document.slug} maxLength={100} onChange={(event) => update((current) => ({ ...current, slug: normalizeSlug(event.target.value) }))} /></label>
          <label className="field"><span>Текст для share preview</span><textarea value={document.sharePreview} rows={3} maxLength={2000} onChange={(event) => update((current) => ({ ...current, sharePreview: event.target.value }))} /></label>
        </div></details>
        <details className="blog-editor-panel" open><summary>Типографіка й посилання</summary><div className="blog-editor-panel__body blog-editor-fields">
          <label className="field"><span>Базовий розмір тексту</span><select value={document.typography.bodyFontSize} onChange={(event) => update((current) => ({ ...current, typography: { ...current.typography, bodyFontSize: Number(event.target.value) } }))}>{[14, 15, 16, 17, 18, 19, 20, 22, 24].map((size) => <option value={size} key={size}>{size} px</option>)}</select></label>
          <label className="field"><span>Готовий стиль посилань</span><select value={currentLinkPreset(document.linkAppearance)} onChange={(event) => {
            const preset = linkAppearancePresets[event.target.value as keyof typeof linkAppearancePresets];
            if (preset) update((current) => ({ ...current, linkAppearance: { ...current.linkAppearance, ...preset } }));
          }}><option value="blackYellow">Чорна плашка / жовтий текст</option><option value="yellowBlack">Жовта плашка / чорний текст</option><option value="outline">Світла контурна плашка</option><option value="custom" disabled>Власні кольори</option></select></label>
          <label className="field blog-editor-color-field"><span>Фон посилання</span><div><input type="color" value={document.linkAppearance.backgroundColor} aria-label="Колір фону посилання" onChange={(event) => update((current) => ({ ...current, linkAppearance: { ...current.linkAppearance, backgroundColor: event.target.value } }))} /><code>{document.linkAppearance.backgroundColor}</code></div></label>
          <label className="field blog-editor-color-field"><span>Колір тексту</span><div><input type="color" value={document.linkAppearance.textColor} aria-label="Колір тексту посилання" onChange={(event) => update((current) => ({ ...current, linkAppearance: { ...current.linkAppearance, textColor: event.target.value } }))} /><code>{document.linkAppearance.textColor}</code></div></label>
          <label className="field blog-editor-color-field"><span>Колір рамки</span><div><input type="color" value={document.linkAppearance.borderColor} aria-label="Колір рамки посилання" onChange={(event) => update((current) => ({ ...current, linkAppearance: { ...current.linkAppearance, borderColor: event.target.value } }))} /><code>{document.linkAppearance.borderColor}</code></div></label>
          <label className="field"><span>Заокруглення</span><select value={document.linkAppearance.borderRadius} onChange={(event) => update((current) => ({ ...current, linkAppearance: { ...current.linkAppearance, borderRadius: Number(event.target.value) } }))}><option value="0">Без заокруглення</option><option value="6">6 px</option><option value="8">8 px</option><option value="12">12 px</option><option value="999">Капсула</option></select></label>
          <label className="field"><span>Насиченість посилання</span><select value={document.linkAppearance.fontWeight} onChange={(event) => update((current) => ({ ...current, linkAppearance: { ...current.linkAppearance, fontWeight: Number(event.target.value) } }))}><option value="600">Напівжирний</option><option value="700">Жирний</option><option value="800">Дуже жирний</option><option value="900">Максимальний</option></select></label>
          <div className="blog-editor-link-sample"><span>Вигляд у статті</span><a style={{ backgroundColor: document.linkAppearance.backgroundColor, color: document.linkAppearance.textColor, borderColor: document.linkAppearance.borderColor, borderRadius: `${document.linkAppearance.borderRadius}px`, fontWeight: document.linkAppearance.fontWeight }}>Samsung A56</a></div>
        </div></details>
        <details className="blog-editor-panel" open><summary>Hero-блок</summary><div className="blog-editor-panel__body blog-editor-fields">
          <label className="field"><span>Кікер</span><input value={document.hero.kicker} onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, kicker: event.target.value } }))} /></label>
          <label className="field blog-editor-field--wide"><span>H1 заголовок</span><input value={document.hero.title} onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, title: event.target.value } }))} /></label>
          <div className="field blog-editor-field--wide"><span>Лід</span><RichTextField value={document.hero.lead} onChange={(lead) => update((current) => ({ ...current, hero: { ...current.hero, lead } }))} /></div>
          <div className="field blog-editor-field--wide"><span>Головне зображення</span><div className="blog-editor-image-field"><input type="url" value={document.hero.imageUrl} placeholder="https://…" aria-label="Головне зображення" onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, imageUrl: event.target.value } }))} /><button className="button button--secondary" type="button" onClick={() => setImageTarget({ type: 'hero' })}><Icon name="image" size={17} /> Завантажити або обрати</button></div></div>
          <label className="field"><span>Alt-текст</span><input value={document.hero.imageAlt} onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, imageAlt: event.target.value } }))} /></label>
          <div className="field blog-editor-field--wide"><span>Мета-позначки</span><TextListEditor label="Позначка" values={document.hero.meta} onChange={(meta) => update((current) => ({ ...current, hero: { ...current.hero, meta } }))} /></div>
        </div></details>
        <div className="blog-editor-sections">
          {document.sections.map((section, index) => <SectionEditor key={section.id} section={section} index={index} total={document.sections.length} onChange={(next) => update((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? next : item) }))} onMove={(direction) => update((current) => ({ ...current, sections: moveItem(current.sections, index, direction) }))} onRemove={() => update((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id) }))} onPickImage={(blockId) => setImageTarget({ type: 'block', sectionId: section.id, blockId })} />)}
        </div>
        <button className="button button--secondary blog-editor-add-section" type="button" onClick={() => update((current) => ({ ...current, sections: [...current.sections, createBlogSection()] }))}><Icon name="add" size={18} /> Додати секцію</button>
        <details className="blog-editor-panel"><summary>Власні CSS та JS</summary><div className="blog-editor-panel__body">
          <label className="field"><span>Додатковий CSS</span><textarea className="blog-editor-code-input" value={document.customCss} rows={8} spellCheck={false} onChange={(event) => update((current) => ({ ...current, customCss: event.target.value }))} /></label>
          <label className="field"><span>Додатковий JavaScript</span><textarea className="blog-editor-code-input" value={document.customJs} rows={8} spellCheck={false} onChange={(event) => update((current) => ({ ...current, customJs: event.target.value }))} /></label>
        </div></details>
      </section>

      <section className="blog-editor-preview-panel">
        <header><div><strong>Live preview</strong><span>Ізольований від адмін-панелі</span></div><div className="blog-editor-viewport-switch"><button type="button" className={viewport === 'desktop' ? 'active' : ''} onClick={() => setViewport('desktop')}><Icon name="visibility" size={16} /> Desktop</button><button type="button" className={viewport === 'mobile' ? 'active' : ''} onClick={() => setViewport('mobile')}><Icon name="phone" size={16} /> Mobile</button></div></header>
        <div className={`blog-editor-preview blog-editor-preview--${viewport}`}><iframe title="Попередній перегляд статті" sandbox="allow-scripts" srcDoc={output?.preview || ''} /></div>
      </section>
    </div> : <section className="blog-editor-export">
      <header><div><p className="eyebrow">Готовий результат</p><h2>HTML / CSS / JS для вставки</h2><p>Скопіюйте повний пакет або потрібну частину окремо.</p></div><button className="button button--primary" type="button" onClick={() => void copyCode(output?.combined || '', 'Повний код')}><Icon name="copy" size={18} /> Копіювати все</button></header>
      <nav className="blog-editor-code-tabs" aria-label="Частини коду">{(['combined', 'html', 'css', 'js'] as const).map((tab) => <button key={tab} className={codeTab === tab ? 'active' : ''} type="button" onClick={() => setCodeTab(tab)}>{tab === 'combined' ? 'Усе разом' : tab.toUpperCase()}</button>)}</nav>
      <div className="blog-editor-code"><button type="button" onClick={() => void copyCode(code, codeTab === 'combined' ? 'Повний код' : codeTab.toUpperCase())}><Icon name="copy" size={16} /> Копіювати</button><textarea value={code} readOnly spellCheck={false} aria-label="Згенерований код" /></div>
    </section>}
    {imageTarget && <MediaPickerDialog onClose={() => setImageTarget(null)} onSelect={selectImage} />}
  </div>;
}
