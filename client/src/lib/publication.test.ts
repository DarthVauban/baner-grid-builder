import { describe, expect, it } from 'vitest';
import { detectMaterial, isPublicationOverdue } from './publication';

describe('publication helpers', () => {
  it('detects supported Google material links', () => {
    expect(detectMaterial('https://docs.google.com/document/d/example/edit').type).toBe('google_doc');
    expect(detectMaterial('https://drive.google.com/drive/folders/example').type).toBe('drive_folder');
    expect(detectMaterial('https://drive.google.com/file/d/example/view').type).toBe('drive_file');
  });

  it('derives overdue state only for active publication statuses', () => {
    const past = '2000-01-01T00:00:00.000Z';
    expect(isPublicationOverdue('planned', past)).toBe(true);
    expect(isPublicationOverdue('published', past)).toBe(false);
  });
});
