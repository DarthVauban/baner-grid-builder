import type { BannerData } from '../types/workspace';

const DAY_MS = 86_400_000;

export const emptyBanner = (): BannerData => ({
  title: '', endDate: '', endTime: '', imageUrl: '', targetUrl: '', disableWhenExpired: false
});

export function normalizeBanner(value?: Partial<BannerData> | null): BannerData {
  return {
    title: String(value?.title || ''),
    endDate: String(value?.endDate || ''),
    endTime: String(value?.endTime || ''),
    imageUrl: String(value?.imageUrl || ''),
    targetUrl: String(value?.targetUrl || ''),
    disableWhenExpired: Boolean(value?.disableWhenExpired)
  };
}

export function isBannerValid(banner: BannerData): boolean {
  return Boolean(banner.title.trim() && banner.endDate && banner.imageUrl.trim() && banner.targetUrl.trim());
}

export function hasBannerContent(banner: BannerData): boolean {
  return Object.entries(banner).some(([key, value]) => key === 'disableWhenExpired' ? value === true : Boolean(value));
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function buildShareMeta(description: string, className = 'mt-share-description'): string {
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const safe = escapeHtml(text);
  return `<meta name="description" content="${safe}">\n<meta property="og:description" content="${safe}">\n<meta name="twitter:description" content="${safe}">\n<p class="${className}" style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;">${safe}</p>`;
}

function endTime(banner: BannerData): number {
  const [year, month, day] = banner.endDate.split('-').map(Number);
  const [hours, minutes] = (banner.endTime || '23:59').split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) return 0;
  return new Date(year, month - 1, day, hours, minutes, 59, 999).getTime();
}

function dayWord(days: number): string {
  const lastTwo = Math.abs(days) % 100;
  const last = Math.abs(days) % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return 'днів';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дні';
  return 'днів';
}

export function getBannerDatePhrase(banner: BannerData, now = Date.now()): string {
  if (!banner.endDate) return 'Дата завершення не вказана';
  const remaining = endTime(banner) - now;
  if (remaining < 0) return 'Акція завершена';
  if (remaining >= DAY_MS) {
    const days = Math.floor(remaining / DAY_MS);
    return `До закінчення акції ${days} ${dayWord(days)}`;
  }
  const totalMinutes = Math.max(0, Math.floor(remaining / 60_000));
  return `До закінчення акції ${Math.floor(totalMinutes / 60)} год ${String(totalMinutes % 60).padStart(2, '0')} хв`;
}

export function isBannerExpired(banner: BannerData, now = Date.now()): boolean {
  return Boolean(banner.endDate) && endTime(banner) < now;
}

function accentTitle(title: string): string {
  return escapeHtml(title).replace(/(-\s*\d+(?:[.,]\d+)?\s*%)/g, '<span class="mt-banner-title-accent">$1</span>');
}

export const BANNER_STYLES = `.mt-banner-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,500px))!important;gap:24px!important;justify-content:space-between!important;width:100%!important;box-sizing:border-box!important}.mt-banner-grid .mt-banner-item{display:block!important;width:100%!important;max-width:500px!important;margin:0!important;padding:0!important;box-sizing:border-box!important}.mt-banner-grid .mt-banner-card{display:grid!important;grid-template-rows:auto 100px!important;width:100%!important;max-width:500px!important;height:auto!important;max-height:382px!important;margin:0!important;padding:0!important;overflow:hidden!important;border:0!important;border-radius:10px!important;background:#000!important;color:#fff!important;text-decoration:none!important;box-sizing:border-box!important}.mt-banner-grid .mt-banner-card--disabled{cursor:default!important;filter:grayscale(1)!important;opacity:.58!important;pointer-events:none!important}.mt-banner-grid .mt-banner-media{display:block!important;width:100%!important;height:auto!important;aspect-ratio:16/9!important;overflow:hidden!important;background:#111!important}.mt-banner-grid .mt-banner-img{display:block!important;width:100%!important;height:100%!important;border:0!important;object-fit:cover!important;object-position:center!important}.mt-banner-grid .mt-banner-info{display:block!important;width:100%!important;height:100px!important;padding:9px 18px!important;overflow:hidden!important;background:#000!important;box-sizing:border-box!important}.mt-banner-grid .mt-banner-title{display:-webkit-box!important;overflow:hidden!important;margin:0!important;color:#fff!important;font-family:Arial,sans-serif!important;font-size:20px!important;font-weight:900!important;line-height:20px!important;letter-spacing:-.04em!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important}.mt-banner-grid .mt-banner-title-accent{color:#ffe001!important}.mt-banner-grid .mt-banner-date{display:inline-flex!important;align-items:center!important;min-height:30px!important;margin:10px 0 0!important;padding:6px 12px!important;border-radius:6px!important;background:#ffe001!important;color:#000!important;font-family:Arial,sans-serif!important;font-size:14px!important;font-weight:800!important;line-height:18px!important;box-sizing:border-box!important}@media(max-width:1279px){.mt-banner-grid{grid-template-columns:repeat(2,minmax(0,500px))!important}}@media(max-width:768px){.mt-banner-grid{grid-template-columns:minmax(0,500px)!important;gap:16px!important}}`;

const BANNER_SCRIPT = `<script>(function(){"use strict";function end(card){var d=(card.getAttribute("data-mt-end-date")||"").split("-").map(Number);var t=(card.getAttribute("data-mt-end-time")||"23:59").split(":").map(Number);return new Date(d[0],d[1]-1,d[2],t[0],t[1],59,999).getTime()}function word(n){var a=Math.abs(n),x=a%100,y=a%10;if(x>=11&&x<=14)return"днів";if(y===1)return"день";if(y>=2&&y<=4)return"дні";return"днів"}function refresh(){Array.prototype.forEach.call(document.querySelectorAll(".mt-banner-card[data-mt-end-date]"),function(card){var left=end(card)-Date.now(),label=card.querySelector(".mt-banner-date"),expired=left<0;if(label){if(expired)label.textContent="Акція завершена";else if(left>=86400000){var days=Math.floor(left/86400000);label.textContent="До закінчення акції "+days+" "+word(days)}else{var minutes=Math.max(0,Math.floor(left/60000));label.textContent="До закінчення акції "+Math.floor(minutes/60)+" год "+String(minutes%60).padStart(2,"0")+" хв"}}if(expired&&card.getAttribute("data-mt-disable-expired")==="true"){card.classList.add("mt-banner-card--disabled");card.removeAttribute("href");card.setAttribute("aria-disabled","true")}})}refresh();window.setInterval(refresh,60000)})();</script>`;

export function buildBannerHtml(banner: BannerData, indent = 0): string {
  const pad = (level: number) => '  '.repeat(indent + level);
  const expired = isBannerExpired(banner);
  const disabled = banner.disableWhenExpired && expired;
  const tag = disabled ? 'span' : 'a';
  const attributes = disabled
    ? `class="mt-banner-card mt-banner-card--disabled" role="link" aria-disabled="true" tabindex="-1"`
    : `class="mt-banner-card" href="${escapeHtml(banner.targetUrl)}"`;
  const timing = ` data-mt-end-date="${escapeHtml(banner.endDate)}" data-mt-end-time="${escapeHtml(banner.endTime)}"${banner.disableWhenExpired ? ' data-mt-disable-expired="true"' : ''}`;
  return `${pad(0)}<!-- MT BANNER START -->\n${pad(0)}<div class="mt-banner-item">\n${pad(1)}<${tag} ${attributes}${timing}>\n${pad(2)}<span class="mt-banner-media">\n${pad(3)}<img class="mt-banner-img" src="${escapeHtml(banner.imageUrl)}" alt="${escapeHtml(banner.title)}">\n${pad(2)}</span>\n${pad(2)}<span class="mt-banner-info">\n${pad(3)}<span class="mt-banner-title">${accentTitle(banner.title)}</span>\n${pad(3)}<span class="mt-banner-date">${escapeHtml(getBannerDatePhrase(banner))}</span>\n${pad(2)}</span>\n${pad(1)}</${tag}>\n${pad(0)}</div>\n${pad(0)}<!-- MT BANNER END -->`;
}

export function buildGridExport(banners: BannerData[], shareDescription = ''): string {
  const valid = banners.map(normalizeBanner).filter(isBannerValid);
  const grid = `<div class="mt-banner-grid">\n${valid.map((banner) => buildBannerHtml(banner, 1)).join('\n\n')}\n</div>`;
  const body = `${grid}\n\n<style type="text/css">\n${BANNER_STYLES}\n</style>\n\n${BANNER_SCRIPT}`;
  const meta = buildShareMeta(shareDescription);
  return meta ? `${meta}\n${body}` : body;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.select();
  document.execCommand('copy');
  helper.remove();
}
