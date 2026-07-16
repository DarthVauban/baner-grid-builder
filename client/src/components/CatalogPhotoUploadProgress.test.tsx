import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CatalogPhotoUploadProgress } from './CatalogPhotoUploadProgress';

describe('CatalogPhotoUploadProgress', () => {
  it('renders one progress bar for every selected photo', () => {
    render(<CatalogPhotoUploadProgress items={[
      { id: 'one', name: 'front.jpg', progress: 42, status: 'uploading' },
      { id: 'two', name: 'back.png', progress: 100, status: 'done' }
    ]} />);

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars).toHaveLength(2);
    expect(screen.getByRole('progressbar', { name: 'Завантаження front.jpg' })).toHaveAttribute('value', '42');
    expect(screen.getByRole('progressbar', { name: 'Завантаження back.png' })).toHaveAttribute('value', '100');
    expect(screen.queryByText('Конвертація у WebP', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('Завантаження · 42%')).toBeInTheDocument();
    expect(screen.getByText('Готово · 100%')).toBeInTheDocument();
  });

  it('removes the progress list when the completed batch is cleared', () => {
    const { rerender } = render(<CatalogPhotoUploadProgress items={[
      { id: 'one', name: 'front.jpg', progress: 100, status: 'done' }
    ]} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    rerender(<CatalogPhotoUploadProgress items={[]} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Прогрес завантаження фото' })).not.toBeInTheDocument();
  });
});
