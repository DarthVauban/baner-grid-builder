import type { PublicationMaterial, PublicationMaterialType, PublicationStatus } from '../types/publication';

export const publicationStatusLabels: Record<PublicationStatus, string> = {
  planned: 'Заплановано',
  ready: 'Готово',
  published: 'Опубліковано',
  cancelled: 'Скасовано'
};

export const materialTypeLabels: Record<PublicationMaterialType, string> = {
  google_doc: 'Google Docs',
  drive_folder: 'Папка Google Drive',
  drive_file: 'Файл Google Drive',
  image: 'Зображення',
  link: 'Посилання'
};

export function detectMaterial(urlValue: string): PublicationMaterial {
  const url = urlValue.trim();
  let type: PublicationMaterialType = 'link';
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'docs.google.com' && parsed.pathname.startsWith('/document/')) type = 'google_doc';
    else if (parsed.hostname === 'drive.google.com' && parsed.pathname.includes('/folders/')) type = 'drive_folder';
    else if (parsed.hostname === 'drive.google.com') type = 'drive_file';
    else if (/\.(png|jpe?g|webp|gif)(\?|$)/i.test(parsed.pathname)) type = 'image';
  } catch {
    // Validation is handled by the form and API.
  }
  return { type, label: materialTypeLabels[type], url };
}

export function formatPublicationDate(value: string): string {
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function isPublicationOverdue(status: PublicationStatus, publishAt: string): boolean {
  return ['planned', 'ready'].includes(status) && new Date(publishAt).getTime() < Date.now();
}
