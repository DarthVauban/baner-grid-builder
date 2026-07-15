const allowedCatalogImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxCatalogImageBytes = 12 * 1024 * 1024;
const maxCatalogImageSide = 2200;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося прочитати фото.'));
    image.src = url;
  });
}

export async function convertCatalogImageToWebp(file: File): Promise<Blob> {
  if (!allowedCatalogImageTypes.has(file.type)) throw new Error('Оберіть PNG, JPEG або WebP.');
  if (file.size > maxCatalogImageBytes) throw new Error('Фото має бути меншим за 12 МБ.');

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxCatalogImageSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Браузер не зміг підготувати фото.');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (!blob) throw new Error('Браузер не підтримує конвертацію у WebP.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
