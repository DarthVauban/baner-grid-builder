import { useState } from 'react';
import { isBannerExpired, isBannerValid } from '../lib/banner-generator';
import { bannerLinkPath, buildBannerTargetUrl, matchBannerLinkTemplate } from '../lib/banner-link-templates';
import type { BannerDraft, BannerLinkTemplate } from '../types/workspace';
import { Icon } from './Icon';
import { MediaPickerDialog, resolveMediaAssetUrl } from './MediaLibraryBrowser';
import { StyledSelect } from './StyledSelect';

export function BannerEditorCard({
  banner,
  index,
  canRemove,
  pending,
  linkTemplates = [],
  onChange,
  onRemove,
  onSave,
  onCopy
}: {
  banner: BannerDraft;
  index: number;
  canRemove: boolean;
  pending: boolean;
  linkTemplates?: BannerLinkTemplate[];
  onChange: (patch: Partial<BannerDraft>) => void;
  onRemove: () => void;
  onSave: () => void;
  onCopy: () => void;
}) {
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [linkMode, setLinkMode] = useState('auto');
  const valid = isBannerValid(banner);
  const expired = isBannerExpired(banner);
  const disabled = expired && banner.disableWhenExpired;
  const inferredTemplate = matchBannerLinkTemplate(banner.targetUrl, linkTemplates)?.template;
  const requestedTemplate = linkMode === 'auto' ? inferredTemplate : linkTemplates.find((item) => item.id === linkMode);
  const templatePath = requestedTemplate ? bannerLinkPath(requestedTemplate.baseUrl, banner.targetUrl) : null;
  const selectedTemplate = templatePath === null ? null : requestedTemplate;

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
        <div className="field banner-editor-card__wide banner-link-field"><span>Посилання банера *</span>
          {linkTemplates.length > 0 && <div className="field"><span>Шаблон адреси</span><StyledSelect ariaLabel="Шаблон посилання банера" value={selectedTemplate?.id || 'full'} options={[{ value: 'full', label: 'Повне посилання' }, ...linkTemplates.map((template) => ({ value: template.id, label: `${template.name} · ${template.baseUrl}` }))]} onChange={(next) => {
            setLinkMode(next);
            const template = linkTemplates.find((item) => item.id === next);
            if (template) onChange({ targetUrl: template.baseUrl });
          }} /></div>}
          {selectedTemplate ? <><label className="field"><span>Шлях сторінки</span><input type="text" value={templatePath ?? ''} maxLength={Math.max(0, 4000 - selectedTemplate.baseUrl.length)} onChange={(event) => onChange({ targetUrl: buildBannerTargetUrl(selectedTemplate.baseUrl, event.target.value) })} placeholder="/teplo-vyhidnykh-pokupok/" /></label><small>Підсумкове посилання: <output>{banner.targetUrl}</output></small></>
            : <label className="field"><span>Повна адреса</span><input type="url" value={banner.targetUrl} maxLength={4000} onChange={(event) => onChange({ targetUrl: event.target.value })} placeholder="https://example.com/sale" /></label>}
        </div>
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
