import { useState } from 'react';
import { isBannerExpired, isBannerValid } from '../lib/banner-generator';
import type { BannerDraft } from '../types/workspace';
import { Icon } from './Icon';
import { MediaPickerDialog, resolveMediaAssetUrl } from './MediaLibraryBrowser';

export function BannerEditorCard({
  banner,
  index,
  canRemove,
  pending,
  onChange,
  onRemove,
  onSave,
  onCopy
}: {
  banner: BannerDraft;
  index: number;
  canRemove: boolean;
  pending: boolean;
  onChange: (patch: Partial<BannerDraft>) => void;
  onRemove: () => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const valid = isBannerValid(banner);
  const expired = isBannerExpired(banner);
  const disabled = expired && banner.disableWhenExpired;

  return (
    <article className="banner-editor-card">
      <header><span className="banner-editor-card__number">{index + 1}</span><div><h3>{banner.title || `Банер ${index + 1}`}</h3><span className={`banner-state${valid ? ' banner-state--ready' : ''}${expired ? ' banner-state--expired' : ''}`}>{disabled ? 'Вимкнений' : expired ? 'Завершений' : valid ? 'Готовий' : 'Не готовий'}</span></div></header>
      <div className="banner-editor-card__fields">
        <label className="field banner-editor-card__wide"><span>Заголовок *</span><input value={banner.title} maxLength={300} onChange={(event) => onChange({ title: event.target.value })} placeholder="Наприклад, Літній розпродаж -20%" /></label>
        <label className="field"><span>Дата завершення *</span><input type="date" value={banner.endDate} onChange={(event) => onChange({ endDate: event.target.value })} /></label>
        <label className="field"><span>Час завершення</span><input type="time" value={banner.endTime} onChange={(event) => onChange({ endTime: event.target.value })} /></label>
        <div className="field banner-editor-card__wide banner-image-field">
          <span>Зображення банера *</span>
          <div className={`banner-image-picker${banner.imageUrl ? ' banner-image-picker--selected' : ''}`}>
            <button
              className="banner-image-picker__select"
              type="button"
              onClick={() => setMediaPickerOpen(true)}
              aria-label={banner.imageUrl ? 'Змінити зображення банера у медіасховищі' : 'Вибрати зображення банера з медіасховища'}
            >
              {banner.imageUrl
                ? <img src={banner.imageUrl} alt="" />
                : <span className="banner-image-picker__placeholder"><Icon name="image" size={26} /></span>}
              <span className="banner-image-picker__copy">
                <strong>{banner.imageUrl ? 'Зображення вибрано' : 'Вибрати з медіасховища'}</strong>
                <small>{banner.imageUrl ? 'Натисніть, щоб замінити файл' : 'Відкрийте сховище та виберіть потрібне фото'}</small>
              </span>
              <Icon name="chevronRight" size={19} />
            </button>
            {banner.imageUrl && <button className="icon-button icon-button--danger banner-image-picker__remove" type="button" onClick={() => onChange({ imageUrl: '' })} aria-label="Прибрати зображення банера"><Icon name="delete" size={17} /></button>}
          </div>
        </div>
        <label className="field banner-editor-card__wide"><span>Посилання банера *</span><input type="url" value={banner.targetUrl} maxLength={4000} onChange={(event) => onChange({ targetUrl: event.target.value })} placeholder="https://example.com/sale" /></label>
        <label className="check-field banner-editor-card__wide"><input type="checkbox" checked={banner.disableWhenExpired} onChange={(event) => onChange({ disableWhenExpired: event.target.checked })} /><span>Вимикати банер після завершення акції</span></label>
      </div>
      <footer>
        <button className="button button--secondary button--small" type="button" disabled={!valid || pending} onClick={onSave}><Icon name="save" size={16} /> {banner.savedBannerId ? 'Оновити банер' : 'Зберегти банер'}</button>
        <button className="button button--secondary button--small" type="button" disabled={!valid} onClick={onCopy}><Icon name="copy" size={16} /> Копіювати HTML</button>
        <button className="button button--danger button--small" type="button" disabled={!canRemove} onClick={onRemove}><Icon name="delete" size={16} /> Видалити</button>
      </footer>
      {mediaPickerOpen && <MediaPickerDialog
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(asset) => onChange({ imageUrl: resolveMediaAssetUrl(asset.url) })}
      />}
    </article>
  );
}
