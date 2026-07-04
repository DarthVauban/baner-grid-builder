const allowedAvatarTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const MAX_AVATAR_SIZE = 1024 * 1024;

export function readAvatarFile(file: File): Promise<string> {
  if (!allowedAvatarTypes.has(file.type)) return Promise.reject(new Error('Оберіть PNG, JPEG або WebP.'));
  if (file.size > MAX_AVATAR_SIZE) return Promise.reject(new Error('Фото має бути меншим за 1 МБ.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не вдалося прочитати файл.'));
    reader.readAsDataURL(file);
  });
}
