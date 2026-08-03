import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { renderInlineText, sanitizeRichTextHtml } from '../lib/blog-editor';

const fontSizes = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

function normalizeValue(value: string) {
  const normalized = sanitizeRichTextHtml(value).replace(/^(?:<br\s*\/?>(?:\s|&nbsp;)*)+|(?:<br\s*\/?>(?:\s|&nbsp;)*)+$/giu, '');
  return normalized === '&nbsp;' ? '' : normalized;
}

function editorHtml(value: string) {
  return /<(?:strong|b|em|i|a|span|br)\b/iu.test(value)
    ? normalizeValue(value)
    : renderInlineText(value);
}

function selectionRangeInside(editor: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as Element
    : range.commonAncestorContainer.parentElement;
  return container && (container === editor || editor.contains(container)) ? range : null;
}

export function RichTextField({ value, onChange, rows = 4, placeholder = '' }: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;
    const next = editorHtml(value);
    if (editor.innerHTML !== next) editor.innerHTML = next;
  }, [value]);

  function emitValue() {
    const editor = editorRef.current;
    if (!editor) return;
    const next = normalizeValue(editor.innerHTML);
    onChange(next);
  }

  function runCommand(command: 'bold' | 'italic') {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    emitValue();
  }

  function openLinkDialog() {
    const editor = editorRef.current;
    if (!editor) return;
    const range = selectionRangeInside(editor);
    savedRange.current = range?.cloneRange() || null;
    setLinkText(range?.toString() || '');
    setLinkUrl('');
    setLinkError('');
    setLinkOpen(true);
  }

  function closeLinkDialog() {
    setLinkOpen(false);
    setLinkError('');
    savedRange.current = null;
  }

  function applyLink() {
    const editor = editorRef.current;
    const text = linkText.trim();
    let candidate = linkUrl.trim();
    if (!editor || !text || !candidate) return;
    if (!/^https?:\/\//iu.test(candidate)) candidate = `https://${candidate}`;
    let href = '';
    try {
      const parsed = new URL(candidate);
      if (['http:', 'https:'].includes(parsed.protocol)) href = parsed.toString();
    } catch {
      href = '';
    }
    if (!href) {
      setLinkError('Вкажіть коректне HTTP або HTTPS-посилання.');
      return;
    }

    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    if (savedRange.current) selection?.addRange(savedRange.current);
    const range = selectionRangeInside(editor) || document.createRange();
    if (!savedRange.current) {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    range.deleteContents();
    const anchor = document.createElement('a');
    anchor.className = 'mt-blog-label';
    anchor.href = href;
    anchor.textContent = text;
    range.insertNode(anchor);
    range.setStartAfter(anchor);
    range.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(range);
    closeLinkDialog();
    emitValue();
  }

  function applyFontSize(size: number) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = selectionRangeInside(editor);
    if (!range || range.collapsed) return;
    const span = document.createElement('span');
    span.style.fontSize = `${size}px`;
    span.append(range.extractContents());
    range.insertNode(span);
    const selection = window.getSelection();
    range.selectNodeContents(span);
    selection?.removeAllRanges();
    selection?.addRange(range);
    emitValue();
  }

  function insertPastedContent(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const plain = event.clipboardData.getData('text/plain');
    const textContainer = document.createElement('div');
    textContainer.textContent = plain;
    const content = html
      ? sanitizeRichTextHtml(html)
      : textContainer.innerHTML.replace(/\r?\n/g, '<br />');
    document.execCommand('insertHTML', false, content);
    emitValue();
  }

  return <div className="blog-rich-text-field">
    <div className="blog-rich-text-field__toolbar" role="toolbar" aria-label="Форматування тексту">
      <button type="button" className="blog-rich-text-field__tool" title="Жирний текст" aria-label="Жирний текст" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('bold')}><strong>B</strong></button>
      <button type="button" className="blog-rich-text-field__tool" title="Курсив" aria-label="Курсив" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('italic')}><em>I</em></button>
      <button type="button" className="blog-rich-text-field__tool" title="Додати посилання" aria-label="Додати посилання" onMouseDown={(event) => event.preventDefault()} onClick={openLinkDialog}><Icon name="link" size={16} /></button>
      <label className="blog-rich-text-field__size">
        <span className="sr-only">Розмір шрифту</span>
        <select aria-label="Розмір шрифту" defaultValue="" onChange={(event) => { const size = Number(event.target.value); if (size) applyFontSize(size); event.target.value = ''; }}>
          <option value="" disabled>Розмір</option>
          {fontSizes.map((size) => <option key={size} value={size}>{size} px</option>)}
        </select>
      </label>
      <span className="blog-rich-text-field__hint">Можна вставляти форматований текст із посиланнями</span>
    </div>
    <div
      ref={editorRef}
      className="blog-rich-text-field__editor"
      contentEditable
      role="textbox"
      aria-multiline="true"
      aria-label={placeholder || 'Форматований текст'}
      data-placeholder={placeholder || 'Введіть текст…'}
      style={{ minHeight: `${Math.max(3, rows) * 22}px` }}
      suppressContentEditableWarning
      onInput={emitValue}
      onBlur={() => {
        const editor = editorRef.current;
        if (!editor) return;
        const normalized = normalizeValue(editor.innerHTML);
        if (editor.innerHTML !== normalized) editor.innerHTML = normalized;
      }}
      onPaste={insertPastedContent}
    />

    {linkOpen && <div className="modal-backdrop modal-backdrop--nested blog-link-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeLinkDialog(); }}>
      <section className="modal blog-link-dialog" role="dialog" aria-modal="true" aria-labelledby="blog-link-dialog-title">
        <header className="modal__header"><div><p className="eyebrow">Форматування</p><h2 id="blog-link-dialog-title">Додати посилання</h2></div><button className="icon-button" type="button" onClick={closeLinkDialog} aria-label="Закрити"><Icon name="close" size={21} /></button></header>
        <div className="blog-link-dialog__body">
          <label className="field"><span>Посилання</span><input type="url" value={linkUrl} autoFocus placeholder="https://example.com" onChange={(event) => { setLinkUrl(event.target.value); setLinkError(''); }} /></label>
          <label className="field"><span>Текст посилання</span><input value={linkText} placeholder="Наприклад, Samsung A56" onChange={(event) => setLinkText(event.target.value)} /></label>
          {linkError && <p className="form-message form-message--error">{linkError}</p>}
        </div>
        <footer className="modal__footer"><button className="button button--secondary" type="button" onClick={closeLinkDialog}>Скасувати</button><button className="button button--primary" type="button" disabled={!linkUrl.trim() || !linkText.trim()} onClick={applyLink}><Icon name="link" size={16} /> Додати посилання</button></footer>
      </section>
    </div>}
  </div>;
}
