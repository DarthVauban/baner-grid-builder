import type { ReactNode } from 'react';

export function LibraryCard({ imageUrl, title, meta, actions }: { imageUrl?: string; title: string; meta: string; actions: ReactNode }) {
  return <article className="workspace-library-card"><span className="workspace-library-card__thumb">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span>MT</span>}</span><div className="workspace-library-card__copy"><h2>{title}</h2><p>{meta}</p></div><div className="workspace-library-card__actions">{actions}</div></article>;
}
