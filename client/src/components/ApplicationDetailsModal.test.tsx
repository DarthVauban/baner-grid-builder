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
});
