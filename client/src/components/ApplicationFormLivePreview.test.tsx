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
    const postMessage = vi.spyOn((iframe as HTMLIFrameElement).contentWindow!, 'postMessage');
    fireEvent.load(iframe);
    expect(iframe.getAttribute('srcdoc')).toContain('/api/public/application-forms/loader.js');
    expect(iframe.getAttribute('srcdoc')).toContain('data-preview-channel=');
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'mt-application-form-preview-render',
      payload,
      viewport: 'desktop',
      previewState: 'form'
    }), window.location.origin));
    const stableDocument = iframe.getAttribute('srcdoc');

    fireEvent.click(screen.getByRole('button', { name: 'Телефон' }));
    expect(iframe.parentElement).toHaveClass('is-mobile');
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ viewport: 'mobile' }), window.location.origin));
    expect(iframe.getAttribute('srcdoc')).toBe(stableDocument);

    fireEvent.click(screen.getByRole('button', { name: 'Після надсилання' }));
    expect(screen.getByRole('button', { name: 'Після надсилання' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ previewState: 'success' }), window.location.origin));
    expect(iframe.getAttribute('srcdoc')).toBe(stableDocument);
  });

  it('updates the preview payload without replacing the iframe or stealing editor focus', async () => {
    const preview = vi.spyOn(api.forms, 'preview').mockImplementation(async (nextInput) => ({
      ...payload,
      title: nextInput.title
    }));
    const view = render(<>
      <input aria-label="Заголовок у редакторі" defaultValue={input.title} />
      <ApplicationFormLivePreview input={input} />
    </>);

    await waitFor(() => expect(preview).toHaveBeenCalledWith(input, expect.any(AbortSignal)));
    const iframe = await screen.findByTitle('Живий перегляд форми');
    const stableDocument = iframe.getAttribute('srcdoc');
    const postMessage = vi.spyOn((iframe as HTMLIFrameElement).contentWindow!, 'postMessage');
    const editor = screen.getByRole('textbox', { name: 'Заголовок у редакторі' });
    editor.focus();

    const updatedInput = { ...input, title: `${input.title}!` };
    view.rerender(<>
      <input aria-label="Заголовок у редакторі" defaultValue={updatedInput.title} />
      <ApplicationFormLivePreview input={updatedInput} />
    </>);

    await waitFor(() => expect(preview).toHaveBeenLastCalledWith(updatedInput, expect.any(AbortSignal)));
    await waitFor(() => expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ title: updatedInput.title })
    }), window.location.origin));
    expect(screen.getByTitle('Живий перегляд форми')).toBe(iframe);
    expect(iframe.getAttribute('srcdoc')).toBe(stableDocument);
    expect(editor).toHaveFocus();
  });
});
