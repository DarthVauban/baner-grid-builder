import { useToast } from '../toast/ToastContext';
import type { ChatLinkPreview as ChatLinkPreviewType } from '../types/chat';
import { Icon } from './Icon';

export function ChatLinkPreview({ preview }: { preview: ChatLinkPreviewType }) {
  const { showToast } = useToast();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(preview.url);
      showToast('Посилання скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати посилання.', 'error');
    }
  }

  if (preview.type === 'image') {
    return <article className="chat-link-preview chat-link-preview--image">
      <a href={preview.url} target="_blank" rel="noreferrer" aria-label="Відкрити зображення"><img src={preview.url} alt="Зображення з посилання" loading="lazy" /></a>
      <button type="button" onClick={() => void copyLink()} aria-label="Скопіювати посилання" title="Скопіювати посилання"><Icon name="copy" size={17} /></button>
    </article>;
  }

  return <article className="chat-link-preview chat-link-preview--link">
    <span><Icon name="link" size={22} /></span>
    <div><strong>{preview.hostname}</strong><small>{preview.path}</small></div>
    <span className="chat-link-preview__actions"><button type="button" onClick={() => void copyLink()} aria-label="Скопіювати посилання"><Icon name="copy" size={16} /></button><a href={preview.url} target="_blank" rel="noreferrer" aria-label="Відкрити посилання"><Icon name="openInNew" size={16} /></a></span>
  </article>;
}
