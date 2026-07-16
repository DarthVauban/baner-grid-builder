export type CatalogPhotoUploadStatus = 'queued' | 'converting' | 'uploading' | 'done' | 'error';

export type CatalogPhotoUploadItem = {
  id: string;
  name: string;
  progress: number;
  status: CatalogPhotoUploadStatus;
  error?: string;
};

const statusLabels: Record<CatalogPhotoUploadStatus, string> = {
  queued: 'У черзі',
  converting: 'Конвертація у WebP',
  uploading: 'Завантаження',
  done: 'Готово',
  error: 'Помилка'
};

function normalizedProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function CatalogPhotoUploadProgress({ items }: { items: CatalogPhotoUploadItem[] }) {
  if (!items.length) return null;

  return <section className="catalog-photo-upload-list" aria-label="Прогрес завантаження фото" aria-live="polite">
    {items.map((item) => {
      const progress = normalizedProgress(item.progress);
      return <div className={`catalog-photo-upload-row catalog-photo-upload-row--${item.status}`} key={item.id}>
        <div className="catalog-photo-upload-row__heading">
          <strong title={item.name}>{item.name}</strong>
          <span>{statusLabels[item.status]} · {progress}%</span>
        </div>
        <progress aria-label={`Завантаження ${item.name}`} max={100} value={progress}>{progress}%</progress>
        {item.error && <small>{item.error}</small>}
      </div>;
    })}
  </section>;
}
