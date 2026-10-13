import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BannerDraft, BannerLinkTemplate } from '../types/workspace';
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
const linkTemplate: BannerLinkTemplate = {
  id: 'site', name: 'Mobile Trend', baseUrl: 'https://mobiletrend.com.ua', createdAt: '', updatedAt: ''
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

  it('builds the full banner URL from a selected template and an entered path', () => {
    const onChange = vi.fn();
    const props = { index: 0, canRemove: true, pending: false, linkTemplates: [linkTemplate],
      onChange, onRemove: vi.fn(), onSave: vi.fn(), onCopy: vi.fn() };
    const view = render(<BannerEditorCard {...props} banner={banner} />);
    expect(screen.getByRole('textbox', { name: 'Повна адреса' })).toHaveValue('https://example.com/sale');
    fireEvent.click(screen.getByRole('button', { name: 'Шаблон посилання банера' }));
    fireEvent.click(screen.getByRole('option', { name: 'Mobile Trend · https://mobiletrend.com.ua' }));
    expect(onChange).toHaveBeenLastCalledWith({ targetUrl: 'https://mobiletrend.com.ua' });
    view.rerender(<BannerEditorCard {...props} banner={{ ...banner, targetUrl: 'https://mobiletrend.com.ua' }} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Шлях сторінки' }), { target: { value: '/teplo-vyhidnykh-pokupok/' } });
    expect(onChange).toHaveBeenLastCalledWith({ targetUrl: 'https://mobiletrend.com.ua/teplo-vyhidnykh-pokupok/' });
    view.rerender(<BannerEditorCard {...props} banner={{ ...banner, targetUrl: 'https://mobiletrend.com.ua/teplo-vyhidnykh-pokupok/' }} />);
    expect(screen.getByText('https://mobiletrend.com.ua/teplo-vyhidnykh-pokupok/')).toBeInTheDocument();
  });
});
