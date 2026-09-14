import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { ApplicationFormInput, ApplicationFormPreviewPayload } from '../types/application';
import { ApplicationFormLivePreview } from './ApplicationFormLivePreview';

const input: ApplicationFormInput = {
  formType: 'simple',
  name: 'Передзамовлення',
  title: 'Передзамовити товар',
  description: 'Залиште контакти.',
  buttonText: 'Надіслати заявку',
  successMessage: 'Заявку прийнято.',
  settings: {},
  styles: { buttonBackgroundColor: '#111827', buttonTextColor: '#f9fafb' },
  workflow: null,
  fields: [{
    key: 'customer_name',
    label: 'Імʼя',
    type: 'text',
    placeholder: 'Ваше імʼя',
    helpText: '',
    defaultValue: '',
    required: true,
    active: true,
    system: false,
    systemFieldType: null,
    showInSummary: true,
    sortOrder: 0,
    validation: {},
    options: []
  }]
};

const payload: ApplicationFormPreviewPayload = {
  id: 'preview',
  name: input.name,
  title: input.title,
  description: input.description,
  buttonText: input.buttonText,
  successMessage: input.successMessage,
  settings: input.settings,
  styles: input.styles,
  fields: [{
    key: 'customer_name',
    label: 'Імʼя',
    type: 'text',
    placeholder: 'Ваше імʼя',
    helpText: '',
    defaultValue: '',
    required: true,
    system: false,
    systemFieldType: null,
    sortOrder: 0,
    options: []
  }]
};

afterEach(() => vi.restoreAllMocks());

describe('ApplicationFormLivePreview', () => {
  it('renders the public storefront loader and switches device and result state', async () => {
    const preview = vi.spyOn(api.forms, 'preview').mockResolvedValue(payload);
    render(<ApplicationFormLivePreview input={input} />);

    await waitFor(() => expect(preview).toHaveBeenCalledWith(input, expect.any(AbortSignal)));
    const iframe = await screen.findByTitle('Живий перегляд форми');
    expect(iframe.getAttribute('srcdoc')).toContain('/api/public/application-forms/loader.js');
    expect(iframe.getAttribute('srcdoc')).toContain('data-preview-payload=');
    expect(iframe.getAttribute('srcdoc')).toContain('data-preview-state="form"');

    fireEvent.click(screen.getByRole('button', { name: 'Телефон' }));
    expect(iframe.parentElement).toHaveClass('is-mobile');
    expect(iframe.getAttribute('srcdoc')).toContain('data-preview-device="mobile"');

    fireEvent.click(screen.getByRole('button', { name: 'Після надсилання' }));
    expect(screen.getByRole('button', { name: 'Після надсилання' })).toHaveAttribute('aria-pressed', 'true');
    expect(iframe.getAttribute('srcdoc')).toContain('data-preview-state="success"');
  });
});
