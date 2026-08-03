import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import {
  blogBlockLabels,
  createBlogBlock,
  createBlogPostDocument,
  createBlogSection,
  generateBlogPostExport,
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
import '../styles/blog-post-editor.css';

const blockTypes = Object.entries(blogBlockLabels) as Array<[BlogContentBlock['type'], string]>;

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function MarkdownField({ value, onChange, rows = 4, placeholder = '' }: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrap(before: string, after: string, sample: string) {
    const textarea = ref.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || sample;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  return <div className="blog-markdown-field">
    <div className="blog-markdown-field__toolbar" aria-label="Форматування тексту">
      <button type="button" title="Жирний текст" onClick={() => wrap('**', '**', 'важливий текст')}><strong>B</strong></button>
      <button type="button" title="Курсив" onClick={() => wrap('*', '*', 'текст')}><em>I</em></button>
      <button type="button" title="Посилання" onClick={() => wrap('[', '](https://)', 'назва посилання')}><Icon name="link" size={15} /></button>
      <span>**жирний**, *курсив*, [посилання](https://…)</span>
    </div>
    <textarea ref={ref} value={value} rows={rows} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </div>;
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

function BlockEditor({ block, onChange }: { block: BlogContentBlock; onChange: (block: BlogContentBlock) => void }) {
  if (block.type === 'paragraph') return <label className="field"><span>Текст</span><MarkdownField value={block.text} onChange={(text) => onChange({ ...block, text })} rows={6} /></label>;
  if (block.type === 'subheading') return <label className="field"><span>Підзаголовок</span><input value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} /></label>;
  if (block.type === 'image') return <div className="blog-editor-fields">
    <label className="field blog-editor-field--wide"><span>HTTPS-посилання на зображення</span><input type="url" value={block.url} placeholder="https://…" onChange={(event) => onChange({ ...block, url: event.target.value })} /></label>
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
      <label className="field"><span>Опис</span><MarkdownField value={card.text} rows={3} onChange={(text) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, text } : item) })} /></label>
      <div className="blog-editor-fields"><label className="field"><span>Текст посилання</span><input value={card.linkLabel} onChange={(event) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, linkLabel: event.target.value } : item) })} /></label><label className="field"><span>URL</span><input type="url" value={card.linkUrl} onChange={(event) => onChange({ ...block, items: block.items.map((item, itemIndex) => itemIndex === index ? { ...item, linkUrl: event.target.value } : item) })} /></label></div>
    </div>)}
    <button className="blog-editor-inline-add" type="button" onClick={() => onChange({ ...block, items: [...block.items, { title: 'Нова картка', text: '', linkLabel: '', linkUrl: '' } as BlogCardItem] })}><Icon name="add" size={16} /> Додати картку</button>
  </div>;
  if (block.type === 'callout') return <div className="blog-editor-fields"><label className="field"><span>Заголовок</span><input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} /></label><label className="field blog-editor-field--wide"><span>Текст</span><MarkdownField value={block.text} onChange={(text) => onChange({ ...block, text })} /></label></div>;
  if (block.type === 'faq') return <div className="blog-editor-card-form">
    {block.items.map((item, index) => <div className="blog-editor-repeat-card" key={index}>
      <header><strong>Запитання {index + 1}</strong><button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, itemIndex) => itemIndex !== index) })}><Icon name="delete" size={16} /></button></header>
      <label className="field"><span>Запитання</span><input value={item.question} onChange={(event) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, question: event.target.value } : current) })} /></label>
      <label className="field"><span>Відповідь</span><MarkdownField value={item.answer} rows={3} onChange={(answer) => onChange({ ...block, items: block.items.map((current, itemIndex) => itemIndex === index ? { ...current, answer } : current) })} /></label>
    </div>)}
    <button className="blog-editor-inline-add" type="button" onClick={() => onChange({ ...block, items: [...block.items, { question: 'Нове запитання?', answer: '' } as BlogFaqItem] })}><Icon name="add" size={16} /> Додати запитання</button>
  </div>;
  return <div className="blog-editor-fields">
    <label className="field"><span>Заголовок</span><input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} /></label>
    <label className="field blog-editor-field--wide"><span>Текст</span><MarkdownField value={block.text} onChange={(text) => onChange({ ...block, text })} /></label>
    <label className="field"><span>Текст кнопки</span><input value={block.buttonLabel} onChange={(event) => onChange({ ...block, buttonLabel: event.target.value })} /></label>
    <label className="field"><span>Посилання кнопки</span><input type="url" value={block.buttonUrl} onChange={(event) => onChange({ ...block, buttonUrl: event.target.value })} /></label>
  </div>;
}

function SectionEditor({ section, index, total, onChange, onMove, onRemove }: {
  section: BlogPostSection;
  index: number;
  total: number;
  onChange: (section: BlogPostSection) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
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
        {section.blocks.map((block, blockIndex) => <BlockShell key={block.id} block={block} index={blockIndex} total={section.blocks.length} onMove={(direction) => onChange({ ...section, blocks: moveItem(section.blocks, blockIndex, direction) })} onRemove={() => onChange({ ...section, blocks: section.blocks.filter((item) => item.id !== block.id) })}><BlockEditor block={block} onChange={(next) => onChange({ ...section, blocks: section.blocks.map((item) => item.id === block.id ? next : item) })} /></BlockShell>)}
      </div>
      <div className="blog-editor-add-block"><select value={blockType} onChange={(event) => setBlockType(event.target.value as BlogContentBlock['type'])}>{blockTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button className="button button--secondary" type="button" onClick={() => onChange({ ...section, blocks: [...section.blocks, createBlogBlock(blockType)] })}><Icon name="add" size={17} /> Додати блок</button></div>
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
    setDocument(localDraft || publication.data.editorDocument || createBlogPostDocument(publication.data.title, publication.data.description));
    setDirty(Boolean(localDraft));
  }, [publication.data]);

  useEffect(() => {
    if (!document || !publicationId || !dirty) return;
    const timeout = window.setTimeout(() => localStorage.setItem(`blog-editor:draft:${publicationId}`, JSON.stringify(document)), 400);
    return () => window.clearTimeout(timeout);
  }, [dirty, document, publicationId]);

  const output = useMemo(() => document ? generateBlogPostExport(document) : null, [document]);
  const wordCount = useMemo(() => document ? JSON.stringify(document.sections).replace(/[^\p{L}\p{N}'’]+/gu, ' ').trim().split(/\s+/).filter(Boolean).length : 0, [document]);

  function update(updater: (current: BlogPostDocument) => BlogPostDocument) {
    if (!canEdit) return;
    setDocument((current) => current ? updater(current) : current);
    setDirty(true);
  }

  async function saveDocument() {
    if (!document || !canEdit) return;
    try {
      const result = await save.mutateAsync(document);
      localStorage.removeItem(`blog-editor:draft:${publicationId}`);
      setDocument(result.editorDocument || document);
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
        <details className="blog-editor-panel" open><summary>Hero-блок</summary><div className="blog-editor-panel__body blog-editor-fields">
          <label className="field"><span>Кікер</span><input value={document.hero.kicker} onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, kicker: event.target.value } }))} /></label>
          <label className="field blog-editor-field--wide"><span>H1 заголовок</span><input value={document.hero.title} onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, title: event.target.value } }))} /></label>
          <label className="field blog-editor-field--wide"><span>Лід</span><MarkdownField value={document.hero.lead} onChange={(lead) => update((current) => ({ ...current, hero: { ...current.hero, lead } }))} /></label>
          <label className="field blog-editor-field--wide"><span>Головне зображення</span><input type="url" value={document.hero.imageUrl} placeholder="https://…" onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, imageUrl: event.target.value } }))} /></label>
          <label className="field"><span>Alt-текст</span><input value={document.hero.imageAlt} onChange={(event) => update((current) => ({ ...current, hero: { ...current.hero, imageAlt: event.target.value } }))} /></label>
          <div className="field blog-editor-field--wide"><span>Мета-позначки</span><TextListEditor label="Позначка" values={document.hero.meta} onChange={(meta) => update((current) => ({ ...current, hero: { ...current.hero, meta } }))} /></div>
        </div></details>
        <div className="blog-editor-sections">
          {document.sections.map((section, index) => <SectionEditor key={section.id} section={section} index={index} total={document.sections.length} onChange={(next) => update((current) => ({ ...current, sections: current.sections.map((item) => item.id === section.id ? next : item) }))} onMove={(direction) => update((current) => ({ ...current, sections: moveItem(current.sections, index, direction) }))} onRemove={() => update((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id) }))} />)}
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
  </div>;
}
