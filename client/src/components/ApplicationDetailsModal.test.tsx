import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../toast/ToastContext';
import type { ApplicationRecord } from '../types/application';
import { ApplicationDetailsModal } from './ApplicationDetailsModal';

const application: ApplicationRecord = {
  id: 'application-1',
  number: '00001',
  status: 'new',
  statusLabel: 'Нова',
  formId: 'form-1',
  formPublicId: 'public-form-1',
  formName: 'Оформлення кредитів',
  sourceUrl: '',
  canonicalUrl: '',
  pageTitle: '',
  referrer: '',
  utm: {},
  source: 'public_form',
  version: 1,
  lastChangedBy: null,
  assignedManager: null,
  customer: {
    firstName: 'Михайло',
    lastName: 'Кошляков',
    phone: '+380 (50) 807-95-14',
    bankValue: 'pumb',
    bankLabel: 'ПУМБ'
  },
  values: [
    {
      id: 'value-1',
      fieldId: 'field-1',
      key: 'patronymic',
      label: 'По батькові',
      type: 'text',
      systemFieldType: null,
      showInSummary: true,
      value: 'Юрійович',
      optionLabel: '',
      sortOrder: 10
    },
    {
      id: 'value-2',
      fieldId: 'field-2',
      key: 'payments',
      label: 'Кількість платежів',
      type: 'number',
      systemFieldType: null,
      showInSummary: false,
      value: '6',
      optionLabel: '',
      sortOrder: 20
    }
  ],
  product: null,
  history: [],
  comments: [],
  createdAt: '2026-07-22T08:32:00.000Z',
  updatedAt: '2026-07-22T08:50:00.000Z'
};

describe('ApplicationDetailsModal answer placement', () => {
  it('moves marked answers into the primary information grid without duplicating them', () => {
    const { container } = render(
      <ToastProvider>
        <ApplicationDetailsModal
          application={application}
          onClose={vi.fn()}
          onShare={vi.fn()}
          onStatus={vi.fn()}
          onClaim={vi.fn()}
          onComment={vi.fn()}
        />
      </ToastProvider>
    );

    const primaryGrid = container.querySelector('.task-details-grid');
    expect(primaryGrid).not.toBeNull();
    expect(within(primaryGrid as HTMLElement).getByText('По батькові')).toBeInTheDocument();
    expect(within(primaryGrid as HTMLElement).getByText('Юрійович')).toBeInTheDocument();

    const additionalHeading = screen.getByRole('heading', { name: /Додаткові відповіді 1/ });
    const additionalSection = additionalHeading.closest('section');
    expect(additionalSection).not.toBeNull();
    expect(within(additionalSection as HTMLElement).getByText('Кількість платежів')).toBeInTheDocument();
    expect(within(additionalSection as HTMLElement).queryByText('По батькові')).not.toBeInTheDocument();
  });

  it('groups workflow answers by the saved step snapshot', () => {
    const workflowApplication: ApplicationRecord = {
      ...application,
      formName: 'Trade-in — основна форма',
      values: [
        {
          ...application.values[0],
          id: 'workflow-value-1',
          key: 'category',
          label: 'Категорія',
          value: 'laptop',
          optionLabel: 'Ноутбук',
          showInSummary: true,
          stepId: 'step-category',
          stepTitle: 'Що будемо оцінювати?',
          stepDescription: 'Оберіть категорію пристрою.',
          stepSortOrder: 0,
          sortOrder: 0
        },
        {
          ...application.values[1],
          id: 'workflow-value-2',
          key: 'charger',
          label: 'Є зарядка?',
          value: 'yes',
          optionLabel: 'Так',
          stepId: 'step-condition',
          stepTitle: 'Стан і комплектація ноутбука',
          stepDescription: 'Перевірте комплектацію.',
          stepSortOrder: 1,
          sortOrder: 1
        }
      ]
    };

    const { container } = render(
      <ToastProvider>
        <ApplicationDetailsModal
          application={workflowApplication}
          onClose={vi.fn()}
          onShare={vi.fn()}
          onStatus={vi.fn()}
          onClaim={vi.fn()}
          onComment={vi.fn()}
        />
      </ToastProvider>
    );

    const workflowSection = container.querySelector('.application-workflow-answers');
    expect(workflowSection).not.toBeNull();
    expect(within(workflowSection as HTMLElement).getByText('Що будемо оцінювати?')).toBeInTheDocument();
    expect(within(workflowSection as HTMLElement).getByText('Стан і комплектація ноутбука')).toBeInTheDocument();
    expect(within(workflowSection as HTMLElement).getByText('Ноутбук')).toBeInTheDocument();
    expect(within(workflowSection as HTMLElement).getByText('Так')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Додаткові відповіді/ })).not.toBeInTheDocument();
  });
});
