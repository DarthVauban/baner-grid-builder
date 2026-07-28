import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TradeInConfig } from '../../types/trade-in';
import { TradeInPublicPage } from './TradeInPublicPage';

const previewConfig = {
  version: 1,
  theme: {
    fontFamily: 'Inter',
    backgroundColor: '#ffffff',
    surfaceColor: '#ffffff',
    textColor: '#111111',
    mutedColor: '#666666',
    primaryColor: '#6d5dfc',
    primaryTextColor: '#ffffff',
    borderColor: '#dddddd',
    successColor: '#16845b',
    maxWidth: 1180,
    borderRadius: 24,
    buttonRadius: 14,
    sectionSpacing: 80
  },
  header: { visible: false },
  hero: { visible: false },
  stats: { visible: false, items: [] },
  process: { visible: false, items: [] },
  benefits: { visible: false, items: [] },
  faq: { visible: false, items: [] },
  contact: { visible: false },
  footer: { visible: false },
  seo: {
    title: 'Trade-in preview',
    description: 'Preview',
    robots: 'index, follow'
  },
  form: {
    title: 'Тестова анкета',
    description: '',
    showProgress: true,
    showStepNumbers: true,
    showSummary: true,
    backLabel: 'Назад',
    nextLabel: 'Далі',
    submitLabel: 'Надіслати заявку',
    successTitle: 'Готово',
    successText: 'Це лише тест.',
    steps: [{
      id: 'preview-step',
      title: 'Перевірка',
      description: '',
      condition: { fieldKey: '', operator: 'equals', value: '' },
      fields: []
    }]
  }
} as unknown as TradeInConfig;

describe('TradeInPublicPage preview', () => {
  it('clearly marks the page as a draft and never submits a real application', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<TradeInPublicPage config={previewConfig} preview onSubmit={onSubmit} />);

    expect(screen.getByText('Тестова сторінка Trade-in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← До конструктора' })).toHaveAttribute('href', '/trade-in/editor');

    await user.click(screen.getByRole('button', { name: /Надіслати заявку/ }));

    expect(await screen.findByText('Режим превʼю')).toBeInTheDocument();
    expect(screen.getByText('PREVIEW')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
