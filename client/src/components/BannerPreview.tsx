import { getBannerDatePhrase, isBannerExpired } from '../lib/banner-generator';
import type { BannerData } from '../types/workspace';

function AccentTitle({ title }: { title: string }) {
  const parts = title.split(/(-\s*\d+(?:[.,]\d+)?\s*%)/g);
  return <>{parts.map((part, index) => /^-\s*\d/.test(part) ? <span key={index} className="banner-preview__accent">{part}</span> : part)}</>;
}

export function BannerPreview({ banner }: { banner: BannerData }) {
  const disabled = banner.disableWhenExpired && isBannerExpired(banner);
  const content = <>
    <span className="banner-preview__media">{banner.imageUrl ? <img src={banner.imageUrl} alt={banner.title || 'Зображення банера'} /> : <span>Зображення</span>}</span>
    <span className="banner-preview__info"><strong><AccentTitle title={banner.title || 'Заголовок банера'} /></strong><small>{getBannerDatePhrase(banner)}</small></span>
  </>;
  return disabled || !banner.targetUrl
    ? <span className={`banner-preview${disabled ? ' banner-preview--disabled' : ''}`}>{content}</span>
    : <a className="banner-preview" href={banner.targetUrl} target="_blank" rel="noreferrer">{content}</a>;
}
