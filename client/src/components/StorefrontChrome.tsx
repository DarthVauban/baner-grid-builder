import type { ReactNode } from 'react';
import type {
  CatalogStorefrontLink,
  CatalogStorefrontSocialLink,
  CatalogStorefrontSocialPlatform,
  CatalogStorefrontTheme
} from '../types/catalog';

const socialPlatformLabels: Record<CatalogStorefrontSocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  x: 'X'
};

const socialPlatformMarks: Record<CatalogStorefrontSocialPlatform, string> = {
  instagram: 'IG',
  facebook: 'f',
  telegram: 'TG',
  youtube: 'YT',
  tiktok: 'TT',
  x: 'X'
};

export function storefrontLinkHref(value: string, fallback = '/') {
  const candidate = value.trim();
  if (!candidate || candidate === '/') return fallback;
  if (candidate.startsWith('#') || candidate.startsWith('mailto:') || candidate.startsWith('tel:')) return candidate;
  if (candidate.startsWith('/') && !candidate.startsWith('//')) return candidate;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function LinkItem({ link, basePath, className }: { link: CatalogStorefrontLink; basePath: string; className: string }) {
  return <a
    className={className}
    href={storefrontLinkHref(link.url, basePath)}
    target={link.newTab ? '_blank' : undefined}
    rel={link.newTab ? 'noreferrer' : undefined}
  >{link.label}</a>;
}

function SocialLinks({ links, className }: { links: CatalogStorefrontSocialLink[]; className: string }) {
  if (!links.length) return null;
  return <div className={className} aria-label="Соціальні мережі">
    {links.map((item) => <a
      href={storefrontLinkHref(item.url, '#')}
      target="_blank"
      rel="noreferrer"
      aria-label={item.label || socialPlatformLabels[item.platform]}
      title={item.label || socialPlatformLabels[item.platform]}
      key={item.id}
    ><span aria-hidden="true">{socialPlatformMarks[item.platform]}</span></a>)}
  </div>;
}

export function StorefrontBrand({
  theme,
  basePath,
  footer = false
}: {
  theme: CatalogStorefrontTheme;
  basePath: string;
  footer?: boolean;
}) {
  const title = footer ? theme.footer.brandText : theme.header.brandText;
  return <a href={storefrontLinkHref(theme.header.logoLink, basePath)} className={`storefront-brand${footer ? ' storefront-brand--footer' : ''}`}>
    {theme.header.logoUrl
      ? <img className="storefront-brand__logo" src={theme.header.logoUrl} alt={title || 'Логотип магазину'} />
      : <span>{theme.header.brandMark}</span>}
    {(title || (!footer && theme.header.tagline)) && <span className="storefront-brand__copy">
      {title && <strong>{title}</strong>}
      {!footer && theme.header.tagline && <small>{theme.header.tagline}</small>}
    </span>}
  </a>;
}

export function StorefrontHeader({
  theme,
  basePath = '/',
  action
}: {
  theme: CatalogStorefrontTheme;
  basePath?: string;
  action?: ReactNode;
}) {
  return <header className="storefront-header">
    <StorefrontBrand theme={theme} basePath={basePath} />
    {theme.header.links.length > 0 && <nav className="storefront-header__nav" aria-label="Головна навігація">
      {theme.header.links.map((link) => <LinkItem link={link} basePath={basePath} className="storefront-header__link" key={link.id} />)}
    </nav>}
    {(theme.header.socialLinks.length > 0 || action) && <div className="storefront-header__tools">
      <SocialLinks links={theme.header.socialLinks} className="storefront-socials storefront-socials--header" />
      {action}
    </div>}
  </header>;
}

export function StorefrontFooter({
  theme,
  basePath = '/'
}: {
  theme: CatalogStorefrontTheme;
  basePath?: string;
}) {
  const footer = theme.footer;
  const year = new Date().getFullYear();
  const copyright = footer.copyright.includes('{year}')
    ? footer.copyright.replaceAll('{year}', String(year))
    : `${year}${footer.copyright ? ` ${footer.copyright}` : ''}`;
  const contacts = [
    footer.email ? { label: footer.email, href: `mailto:${footer.email}` } : null,
    footer.phone ? { label: footer.phone, href: `tel:${footer.phone.replace(/[^\d+]/g, '')}` } : null,
    footer.address ? { label: footer.address, href: '' } : null
  ].filter((item): item is { label: string; href: string } => Boolean(item));

  return <footer className="storefront-footer">
    <div className="storefront-footer__container">
      <div className="storefront-footer__main">
        <div className="storefront-footer__brand">
          {footer.showLogo && <StorefrontBrand theme={theme} basePath={basePath} footer />}
          {footer.description && <p>{footer.description}</p>}
          {contacts.length > 0 && <address className="storefront-footer__contacts">
            {contacts.map((item) => item.href
              ? <a href={item.href} key={item.label}>{item.label}</a>
              : <span key={item.label}>{item.label}</span>)}
          </address>}
        </div>
        {footer.sections.map((section) => <section className="storefront-footer__section" key={section.id}>
          <h2>{section.title}</h2>
          <nav aria-label={section.title}>
            {section.links.map((link) => <LinkItem link={link} basePath={basePath} className="storefront-footer__link" key={link.id} />)}
          </nav>
        </section>)}
        {footer.socialLinks.length > 0 && <section className="storefront-footer__section storefront-footer__social-section">
          <h2>Ми в соцмережах</h2>
          <SocialLinks links={footer.socialLinks} className="storefront-socials storefront-socials--footer" />
        </section>}
      </div>
      <div className="storefront-footer__bottom">
        <span>© {copyright}</span>
      </div>
    </div>
  </footer>;
}
