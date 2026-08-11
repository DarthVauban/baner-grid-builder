import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BannerDraft } from '../types/workspace';
import { BannerEditorCard } from './BannerEditorCard';

vi.mock('./MediaLibraryBrowser', () => ({
  resolveMediaAssetUrl: (url: string) => `https://workspace.test${url}`,
  MediaPickerDialog: ({ onClose, onSelect }: { onClose: () => void; onSelect: (asset: { url: string }) => void }) => <div role="dialog" aria-label="Виберіть зображення">
    <button type="button" onClick={() => { onSelect({ url: '/api/media/assets/banner.webp' }); onClose(); }}>Вставити тестове зображення</button>
  </div>
}));

const banner: BannerDraft = {
  localId: 'banner-1',
  title: 'Літній розпродаж',
  endDate: '2099-08-10',
  endTime: '18:00',
  imageUrl: '',
  targetUrl: 'https://example.com/sale',
  disableWhenExpired: true
};

describe('BannerEditorCard', () => {
  it('selects the banner image from the media library instead of a URL field', () => {
    const onChange = vi.fn();
    render(<BannerEditorCard banner={banner} index={0} canRemove pending={false} onChange={onChange} onRemove={vi.fn()} onSave={vi.fn()} onCopy={vi.fn()} />);

    expect(screen.queryByRole('textbox', { name: /Посилання на зображення/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Вибрати зображення банера з медіасховища' }));
    expect(screen.getByRole('dialog', { name: 'Виберіть зображення' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Вставити тестове зображення' }));

    expect(onChange).toHaveBeenCalledWith({ imageUrl: 'https://workspace.test/api/media/assets/banner.webp' });
  });

  it('shows a preview and allows clearing the selected image', () => {
    const onChange = vi.fn();
    render(<BannerEditorCard banner={{ ...banner, imageUrl: 'https://workspace.test/banner.webp' }} index={0} canRemove pending={false} onChange={onChange} onRemove={vi.fn()} onSave={vi.fn()} onCopy={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Змінити зображення банера у медіасховищі' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Прибрати зображення банера' }));
    expect(onChange).toHaveBeenCalledWith({ imageUrl: '' });
  });
});
