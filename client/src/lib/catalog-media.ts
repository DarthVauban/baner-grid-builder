const allowedCatalogImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxCatalogImageBytes = 12 * 1024 * 1024;
const maxCatalogImageSide = 2200;

function normalizedImageType(file: File) {
  const type = file.type.toLowerCase();
  if (allowedCatalogImageTypes.has(type)) return type;
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return type;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Не вдалося прочитати фото.'));
    image.src = url;
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers fail createImageBitmap for specific image encodings; <img> covers common PNG/JPG files.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function isImageBitmap(value: ImageBitmap | HTMLImageElement): value is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap;
}

export async function convertCatalogImageToWebp(file: File): Promise<Blob> {
  const type = normalizedImageType(file);
  if (!allowedCatalogImageTypes.has(type)) throw new Error('Оберіть PNG, JPG або WebP.');
  if (file.size > maxCatalogImageBytes) throw new Error('Фото має бути меншим за 12 МБ.');

  if (type === 'image/webp') return file;

  const image = await loadBitmap(file);
  const bitmap = isImageBitmap(image);
  const sourceWidth = bitmap ? image.width : image.naturalWidth;
  const sourceHeight = bitmap ? image.height : image.naturalHeight;
  const scale = Math.min(1, maxCatalogImageSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не зміг підготувати фото.');
  context.drawImage(image, 0, 0, width, height);
  if (bitmap) image.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  if (!blob) throw new Error('Браузер не підтримує конвертацію у WebP.');
  return blob;
}
