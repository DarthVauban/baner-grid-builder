import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export type CatalogLightboxImage = {
  url: string;
  alt: string;
};

export function CatalogImageLightbox({
  images,
  index,
  onIndexChange,
  onClose
}: {
  images: CatalogLightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const safeIndex = Math.min(Math.max(index, 0), Math.max(images.length - 1, 0));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && safeIndex > 0) onIndexChange(safeIndex - 1);
      if (event.key === 'ArrowRight' && safeIndex < images.length - 1) onIndexChange(safeIndex + 1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [images.length, onClose, onIndexChange, safeIndex]);

  if (!images.length || typeof document === 'undefined') return null;
  const activeImage = images[safeIndex];

  return createPortal(
    <div
      className="catalog-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Перегляд фото"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button className="catalog-image-lightbox__close" type="button" onClick={onClose} aria-label="Закрити">
        <Icon name="close" size={24} />
      </button>
      <div className="catalog-image-lightbox__stage">
        <img src={activeImage.url} alt={activeImage.alt} />
      </div>
      {images.length > 1 && <>
        <button
          className="catalog-image-lightbox__navigation catalog-image-lightbox__navigation--previous"
          type="button"
          onClick={() => onIndexChange(safeIndex - 1)}
          disabled={safeIndex === 0}
          aria-label="Попереднє фото"
        >
          <Icon name="chevronLeft" size={30} />
        </button>
        <button
          className="catalog-image-lightbox__navigation catalog-image-lightbox__navigation--next"
          type="button"
          onClick={() => onIndexChange(safeIndex + 1)}
          disabled={safeIndex === images.length - 1}
          aria-label="Наступне фото"
        >
          <Icon name="chevronRight" size={30} />
        </button>
        <div className="catalog-image-lightbox__counter">{safeIndex + 1} / {images.length}</div>
        <div className="catalog-image-lightbox__thumbs" aria-label="Мініатюри фото">
          {images.map((image, imageIndex) => <button
            className={imageIndex === safeIndex ? 'is-active' : ''}
            type="button"
            key={`${image.url}-${imageIndex}`}
            onClick={() => onIndexChange(imageIndex)}
            aria-label={`Фото ${imageIndex + 1}`}
            aria-current={imageIndex === safeIndex ? 'true' : undefined}
          >
            <img src={image.url} alt="" loading="lazy" />
          </button>)}
        </div>
      </>}
    </div>,
    document.body
  );
}
