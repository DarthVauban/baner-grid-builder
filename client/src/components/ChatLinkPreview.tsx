import { useToast } from '../toast/ToastContext';
import type { ChatLinkPreview as ChatLinkPreviewType } from '../types/chat';
import { Icon } from './Icon';

export function ChatLinkPreview({ preview }: { preview: ChatLinkPreviewType }) {
  const { showToast } = useToast();
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    if (!imageOpen) return undefined;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setImageOpen(false);
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [imageOpen]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(preview.url);
      showToast('Посилання скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  if (preview.type === 'image') {
    return <>
      <article className="chat-link-preview chat-link-preview--image">
        <button className="chat-link-preview__image-button" type="button" onClick={() => setImageOpen(true)} aria-label="Відкрити зображення"><img src={preview.url} alt="Зображення з посилання" loading="lazy" /></button>
        <button className="chat-link-preview__copy" type="button" onClick={() => void copyLink()} aria-label="Скопіювати посилання" title="Скопіювати посилання"><Icon name="copy" size={17} /></button>
      </article>
      {imageOpen && <div className="chat-image-viewer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setImageOpen(false)}><section role="dialog" aria-modal="true" aria-label="Перегляд зображення"><header><button className="button button--secondary button--small" type="button" onClick={() => void copyLink()}><Icon name="copy" size={16} /> Скопіювати посилання</button><button className="icon-button" type="button" onClick={() => setImageOpen(false)} aria-label="Закрити"><Icon name="close" size={22} /></button></header><img src={preview.url} alt="Зображення з посилання" /></section></div>}
    </>;
  }

  return <article className="chat-link-preview chat-link-preview--link">
    <span><Icon name="link" size={22} /></span>
    <div><strong>{preview.hostname}</strong><small>{preview.path}</small></div>
    <span className="chat-link-preview__actions"><button type="button" onClick={() => void copyLink()} aria-label="Скопіювати посилання"><Icon name="copy" size={16} /></button><a href={preview.url} target="_blank" rel="noreferrer" aria-label="Відкрити посилання"><Icon name="openInNew" size={16} /></a></span>
  </article>;
}
import { useEffect, useState } from 'react';
