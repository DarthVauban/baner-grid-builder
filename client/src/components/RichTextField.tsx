import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import type { Editor } from '@tiptap/core';
import { Icon } from './Icon';
import { MediaPickerDialog, resolveMediaAssetUrl } from './MediaLibraryBrowser';
import { renderInlineText, sanitizeRichTextHtml } from '../lib/blog-editor';
import type { MediaAsset } from '../types/media';

const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

function hasBlockMarkup(value: string) {
  return /<(?:p|h[1-6]|blockquote|pre|ul|ol|table|figure|img|hr)\b/iu.test(value);
}

function editorHtml(value: string) {
  if (!value.trim()) return '<p></p>';
  if (hasBlockMarkup(value)) return sanitizeRichTextHtml(value);
  return `<p>${renderInlineText(value)}</p>`;
}

function outputHtml(editor: Editor) {
  if (editor.isEmpty) return '';
  return sanitizeRichTextHtml(editor.getHTML());
}

function normalizeHttpUrl(value: string) {
  let candidate = value.trim();
  if (!candidate) return '';
  if (!/^https?:\/\//iu.test(candidate)) candidate = `https://${candidate}`;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  title,
  children,
  onClick
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  title?: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return <button
    type="button"
    className={`blog-rich-text-field__tool${active ? ' is-active' : ''}`}
    disabled={disabled}
    title={title || label}
    aria-label={label}
    aria-pressed={active}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
  >{children}</button>;
}

export function RichTextField({ value, onChange, rows = 4, placeholder = '' }: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const onChangeRef = useRef(onChange);
  const [revision, setRevision] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');
  const [linkRange, setLinkRange] = useState({ from: 0, to: 0 });
  const [mediaOpen, setMediaOpen] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: 'https',
          HTMLAttributes: { class: 'mt-blog-label', rel: 'noopener noreferrer' }
        }
      }),
      TextStyle,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({
        table: {
          resizable: true,
          HTMLAttributes: { class: 'blog-tiptap-table' }
        }
      }),
      Image.configure({
        allowBase64: false,
        HTMLAttributes: { class: 'blog-tiptap-image' }
      }),
      Placeholder.configure({ placeholder: placeholder || 'Введіть текст…' }),
      Typography
    ],
    content: editorHtml(value),
    editorProps: {
      attributes: {
        class: 'blog-rich-text-field__editor',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': placeholder || 'Форматований текст',
        spellcheck: 'true'
      }
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(outputHtml(current));
      setRevision((currentRevision) => currentRevision + 1);
    },
    onSelectionUpdate: () => setRevision((currentRevision) => currentRevision + 1)
  });

  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = editorHtml(value);
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="blog-rich-text-field blog-rich-text-field--loading" aria-label="Завантаження текстового редактора" />;

  const currentFontSize = editor.getAttributes('textStyle').fontSize || '';
  const inTable = editor.isActive('table');
  void revision;

  function openLinkDialog() {
    if (!editor) return;
    if (editor.isActive('link')) editor.chain().focus().extendMarkRange('link').run();
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    setLinkRange({ from, to });
    setLinkText(selectedText);
    setLinkUrl(editor.getAttributes('link').href || '');
    setLinkError('');
    setLinkOpen(true);
  }

  function closeLinkDialog() {
    setLinkOpen(false);
    setLinkError('');
  }

  function applyLink() {
    if (!editor) return;
    const href = normalizeHttpUrl(linkUrl);
    const text = linkText.trim();
    if (!href) {
      setLinkError('Вкажіть коректне HTTP або HTTPS-посилання.');
      return;
    }
    if (!text) {
      setLinkError('Вкажіть текст посилання.');
      return;
    }

    editor.chain()
      .focus()
      .setTextSelection(linkRange)
      .insertContent({
        type: 'text',
        text,
        marks: [{ type: 'link', attrs: { href, class: 'mt-blog-label', rel: 'noopener noreferrer' } }]
      })
      .run();
    closeLinkDialog();
  }

  function insertImage(asset: MediaAsset) {
    const src = resolveMediaAssetUrl(asset.url);
    const alt = asset.altText || asset.name.replace(/\.[^.]+$/u, '');
    editor.chain().focus().setImage({ src, alt, title: asset.name }).run();
  }

  return <div className="blog-rich-text-field">
    <div className="blog-rich-text-field__toolbar" role="toolbar" aria-label="Форматування тексту">
      <div className="blog-rich-text-field__group">
        <label className="blog-rich-text-field__format">
          <span className="sr-only">Тип текстового блока</span>
          <select
            aria-label="Тип текстового блока"
            value={editor.isActive('heading', { level: 2 }) ? 'h2' : editor.isActive('heading', { level: 3 }) ? 'h3' : editor.isActive('heading', { level: 4 }) ? 'h4' : 'p'}
            onChange={(event) => {
              const type = event.target.value;
              if (type === 'p') editor.chain().focus().setParagraph().run();
              else editor.chain().focus().toggleHeading({ level: Number(type.slice(1)) as 2 | 3 | 4 }).run();
            }}
          >
            <option value="p">Абзац</option>
            <option value="h2">Заголовок H2</option>
            <option value="h3">Заголовок H3</option>
            <option value="h4">Заголовок H4</option>
          </select>
        </label>
      </div>

      <div className="blog-rich-text-field__group">
        <ToolbarButton label="Жирний текст" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></ToolbarButton>
        <ToolbarButton label="Курсив" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></ToolbarButton>
        <ToolbarButton label="Підкреслений текст" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></ToolbarButton>
        <ToolbarButton label="Закреслений текст" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></ToolbarButton>
        <ToolbarButton label="Код у тексті" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}><code>&lt;/&gt;</code></ToolbarButton>
      </div>

      <div className="blog-rich-text-field__group">
        <ToolbarButton label="Додати або змінити посилання" active={editor.isActive('link')} onClick={openLinkDialog}><Icon name="link" size={16} /></ToolbarButton>
        {editor.isActive('link') && <ToolbarButton label="Видалити посилання" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>×</ToolbarButton>}
        <label className="blog-rich-text-field__size">
          <span className="sr-only">Розмір шрифту</span>
          <select aria-label="Розмір шрифту" value={currentFontSize} onChange={(event) => {
            const size = event.target.value;
            if (size) editor.chain().focus().setFontSize(size).run();
            else editor.chain().focus().unsetFontSize().run();
          }}>
            <option value="">Авто</option>
            {fontSizes.map((size) => <option key={size} value={`${size}px`}>{size} px</option>)}
          </select>
        </label>
      </div>

      <div className="blog-rich-text-field__group">
        <ToolbarButton label="Маркований список" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>•</ToolbarButton>
        <ToolbarButton label="Нумерований список" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</ToolbarButton>
        <ToolbarButton label="Цитата" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>“”</ToolbarButton>
        <ToolbarButton label="Горизонтальний роздільник" onClick={() => editor.chain().focus().setHorizontalRule().run()}>―</ToolbarButton>
      </div>

      <div className="blog-rich-text-field__group">
        <ToolbarButton label="Вирівняти ліворуч" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>≡</ToolbarButton>
        <ToolbarButton label="Вирівняти по центру" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>≣</ToolbarButton>
        <ToolbarButton label="Вирівняти праворуч" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>≡</ToolbarButton>
      </div>

      <div className="blog-rich-text-field__group">
        <ToolbarButton label="Вставити зображення зі сховища" onClick={() => setMediaOpen(true)}><Icon name="image" size={16} /></ToolbarButton>
        <ToolbarButton label={inTable ? 'Керування таблицею нижче' : 'Вставити таблицю 3 на 3'} active={inTable} onClick={() => {
          if (!inTable) editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        }}><span className="blog-rich-text-field__table-icon">▦</span></ToolbarButton>
      </div>

      <div className="blog-rich-text-field__group blog-rich-text-field__group--history">
        <ToolbarButton label="Скасувати останню дію" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}><Icon name="undo" size={16} /></ToolbarButton>
        <ToolbarButton label="Повторити останню дію" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}>↷</ToolbarButton>
        <ToolbarButton label="Очистити форматування" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>Tx</ToolbarButton>
      </div>
    </div>

    {inTable && <div className="blog-rich-text-field__table-tools" role="toolbar" aria-label="Керування таблицею">
      <span>Таблиця</span>
      <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()}>+ рядок вище</button>
      <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()}>+ рядок нижче</button>
      <button type="button" onClick={() => editor.chain().focus().deleteRow().run()}>− рядок</button>
      <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()}>+ колонка зліва</button>
      <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()}>+ колонка справа</button>
      <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()}>− колонка</button>
      <button type="button" onClick={() => editor.chain().focus().mergeOrSplit().run()}>Об’єднати / розділити</button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Рядок-заголовок</button>
      <button type="button" className="is-danger" onClick={() => editor.chain().focus().deleteTable().run()}>Видалити таблицю</button>
    </div>}

    <EditorContent editor={editor} style={{ '--blog-editor-min-height': `${Math.max(3, rows) * 22}px` } as React.CSSProperties} />

    {linkOpen && <div className="modal-backdrop modal-backdrop--nested blog-link-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeLinkDialog(); }}>
      <section className="modal blog-link-dialog" role="dialog" aria-modal="true" aria-labelledby="blog-link-dialog-title">
        <header className="modal__header"><div><p className="eyebrow">Tiptap</p><h2 id="blog-link-dialog-title">Додати посилання</h2></div><button className="icon-button" type="button" onClick={closeLinkDialog} aria-label="Закрити"><Icon name="close" size={21} /></button></header>
        <div className="blog-link-dialog__body">
          <label className="field"><span>Посилання</span><input type="url" value={linkUrl} autoFocus placeholder="https://example.com" onChange={(event) => { setLinkUrl(event.target.value); setLinkError(''); }} /></label>
          <label className="field"><span>Текст посилання</span><input value={linkText} placeholder="Наприклад, Samsung A56" onChange={(event) => { setLinkText(event.target.value); setLinkError(''); }} /></label>
          {linkError && <p className="form-message form-message--error">{linkError}</p>}
        </div>
        <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={closeLinkDialog}>Скасувати</button><button className="button button--primary" type="button" disabled={!linkUrl.trim() || !linkText.trim()} onClick={applyLink}><Icon name="link" size={16} /> Додати посилання</button></footer>
      </section>
    </div>}

    {mediaOpen && <MediaPickerDialog onClose={() => setMediaOpen(false)} onSelect={insertImage} />}
  </div>;
}
