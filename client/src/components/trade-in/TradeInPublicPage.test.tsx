import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeInConfig } from '../../types/trade-in';
import { TradeInPublicPage } from './TradeInPublicPage';

const previewConfig = {
  version: 1,
  theme: {
    fontFamily: 'Inter',
    backgroundColor: '#ffffff',
    surfaceColor: '#ffffff',
    textColor: '#000000',
    mutedColor: '#666666',
    primaryColor: '#ffe101',
    primaryTextColor: '#000000',
    borderColor: '#dddddd',
    successColor: '#000000',
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
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView
    });
  });

  it('clearly marks the page as a draft and submits a demo application', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ number: '00042' });

    render(<TradeInPublicPage config={previewConfig} preview onSubmit={onSubmit} />);

    expect(screen.getByText('Тестова сторінка Trade-in')).toBeInTheDocument();
    expect(screen.getByText(/заявки надсилаються менеджерам як демо/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← До конструктора' })).toHaveAttribute('href', '/trade-in/editor');

    await user.click(screen.getByRole('button', { name: /Надіслати заявку/ }));

    expect(await screen.findByText('Демо-заявку створено')).toBeInTheDocument();
    expect(screen.getByText('00042')).toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('uses the Mobile Trend palette and hides the obsolete form heading', () => {
    const config = structuredClone(previewConfig) as TradeInConfig;
    config.form.title = 'Нова покрокова форма';

    const { container } = render(<TradeInPublicPage config={config} preview />);
    const page = container.querySelector('.ti-page');

    expect(page).toHaveStyle('--ti-primary: #ffe101');
    expect(page).toHaveStyle('--ti-primary-text: #000000');
    expect(page).toHaveStyle('--ti-text: #000000');
    expect(screen.queryByRole('heading', { name: 'Нова покрокова форма' })).not.toBeInTheDocument();
    expect(screen.getByText('Онлайн-анкета')).toBeInTheDocument();
  });

  it('keeps an embedded preview local when no submission handler is provided', async () => {
    const user = userEvent.setup();

    render(<TradeInPublicPage config={previewConfig} preview compact />);
    await user.click(screen.getByRole('button', { name: /Надіслати заявку/ }));

    expect(await screen.findByText('Режим превʼю')).toBeInTheDocument();
    expect(screen.getByText('PREVIEW')).toBeInTheDocument();
  });

  it('keeps the questionnaire summary independent from the application main-information setting', async () => {
    const user = userEvent.setup();
    const config = structuredClone(previewConfig) as TradeInConfig;
    config.form.steps[0].fields = [{
      id: 'comment-field',
      key: 'comment',
      label: 'Коментар для менеджера',
      type: 'textarea',
      placeholder: '',
      helpText: '',
      required: false,
      width: 'full',
      showInSummary: false,
      systemFieldType: null,
      condition: { fieldKey: '', operator: 'equals', value: '' },
      options: []
    }];

    render(<TradeInPublicPage config={config} preview compact />);
    await user.type(screen.getByRole('textbox', { name: 'Коментар для менеджера' }), 'Тестова відповідь');

    const summaryHeading = screen.getByRole('heading', { name: 'Підсумок анкети' });
    const summary = summaryHeading.closest('aside');
    expect(summary).not.toBeNull();
    expect(within(summary as HTMLElement).getByText('Тестова відповідь')).toBeInTheDocument();
  });
});
