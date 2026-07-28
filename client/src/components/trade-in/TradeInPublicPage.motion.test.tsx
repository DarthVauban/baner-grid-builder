import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeInConfig } from '../../types/trade-in';
import { TradeInPublicPage } from './TradeInPublicPage';

const emptyCondition = { fieldKey: '', operator: 'equals' as const, value: '' };

const motionConfig = {
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
  stats: {
    visible: true,
    items: [
      { id: 'years', value: '15+', label: 'Years' },
      { id: 'text', value: 'Mobile Trend', label: 'Brand' }
    ]
  },
  process: { visible: false, items: [] },
  benefits: { visible: false, items: [] },
  faq: {
    visible: true,
    eyebrow: 'FAQ',
    title: 'Questions',
    items: [
      { id: 'price', question: 'Is the estimate final?', answer: 'The final price follows inspection.' },
      { id: 'data', question: 'How is data used?', answer: 'Only to contact the customer.' }
    ]
  },
  contact: { visible: false },
  footer: { visible: false },
  seo: { title: 'Trade-in', description: 'Trade-in page', robots: 'index, follow' },
  form: {
    title: 'Device estimate',
    description: '',
    showProgress: true,
    showStepNumbers: true,
    showSummary: false,
    backLabel: 'Back',
    nextLabel: 'Next',
    submitLabel: 'Submit',
    successTitle: 'Done',
    successText: 'Completed',
    steps: [
      { id: 'first', title: 'First step', description: '', condition: emptyCondition, fields: [] },
      { id: 'second', title: 'Second step', description: '', condition: emptyCondition, fields: [] }
    ]
  }
} as unknown as TradeInConfig;

describe('TradeInPublicPage motion behavior', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('marks forward and backward form step transitions', async () => {
    const user = userEvent.setup();
    const { container } = render(<TradeInPublicPage config={motionConfig} preview />);

    expect(container.querySelector('.ti-form-step')).toHaveAttribute('data-step-direction', 'forward');

    await user.click(screen.getByRole('button', { name: /Next/ }));

    expect(screen.getByRole('heading', { level: 3, name: 'Second step' })).toBeInTheDocument();
    expect(container.querySelector('.ti-form-step')).toHaveAttribute('data-step-direction', 'forward');

    await user.click(screen.getByRole('button', { name: /Back/ }));

    expect(screen.getByRole('heading', { level: 3, name: 'First step' })).toBeInTheDocument();
    expect(container.querySelector('.ti-form-step')).toHaveAttribute('data-step-direction', 'backward');
  });

  it('uses an accessible single-open FAQ accordion', async () => {
    const user = userEvent.setup();
    render(<TradeInPublicPage config={motionConfig} preview />);
    const firstQuestion = screen.getByRole('button', { name: 'Is the estimate final?' });
    const secondQuestion = screen.getByRole('button', { name: 'How is data used?' });

    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
    await user.click(firstQuestion);
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Is the estimate final?' })).toHaveAttribute('aria-hidden', 'false');

    await user.click(secondQuestion);
    expect(firstQuestion).toHaveAttribute('aria-expanded', 'false');
    expect(secondQuestion).toHaveAttribute('aria-expanded', 'true');
  });

  it('identifies numeric statistics for count-up while preserving configured text', () => {
    render(<TradeInPublicPage config={motionConfig} preview />);

    expect(screen.getByLabelText('15+')).toHaveAttribute('data-count-up', 'true');
    expect(screen.getByLabelText('15+')).toHaveTextContent('15+');
    expect(screen.getByLabelText('Mobile Trend')).toHaveAttribute('data-count-up', 'false');
  });

  it('counts a numeric statistic when the block enters the viewport', () => {
    let triggerIntersection: (() => void) | undefined;
    class MockIntersectionObserver {
      readonly root = null;
      readonly rootMargin = '0px';
      readonly thresholds = [0.35];
      constructor(callback: IntersectionObserverCallback) {
        triggerIntersection = () => callback(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    }
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false })
    });
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    render(<TradeInPublicPage config={motionConfig} preview />);
    const statistic = screen.getByLabelText('15+');
    expect(statistic).toHaveTextContent('0+');

    act(() => triggerIntersection?.());
    act(() => frames.shift()?.(0));
    act(() => frames.shift()?.(1_300));

    expect(statistic).toHaveTextContent('15+');
  });
});
