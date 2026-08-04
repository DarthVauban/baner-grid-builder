import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import appStyles from '../styles/app.css?raw';
import { ModalDialog } from './ModalDialog';

describe('ModalDialog', () => {
  it('renders the canonical header, scroll body and footer structure', () => {
    const onClose = vi.fn();
    const { container } = render(
      <ModalDialog
        ariaLabelledBy="modal-contract-title"
        eyebrow="Перевірка"
        title="Структурована модалка"
        onClose={onClose}
        onSubmit={(event) => event.preventDefault()}
        footer={<button type="submit">Зберегти</button>}
      >
        <label>Назва<input /></label>
      </ModalDialog>
    );

    const dialog = screen.getByRole('dialog', { name: 'Структурована модалка' });
    expect(dialog).toHaveClass('modal--structured');
    expect(dialog.querySelector(':scope > .modal__header')).toBeInTheDocument();
    expect(dialog.querySelector('.modal__frame > .modal__body')).toBeInTheDocument();
    expect(dialog.querySelector('.modal__frame > .modal__footer')).toBeInTheDocument();
    expect(dialog.querySelector('.modal__frame')).toBeInstanceOf(HTMLFormElement);

    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks the shared overflow and spacing contract in CSS', () => {
    expect(appStyles).toMatch(/\.modal--structured\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,1fr\);[^}]*overflow:\s*hidden/);
    expect(appStyles).toMatch(/\.modal__body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*padding:\s*24px 28px/);
    expect(appStyles).toMatch(/\.modal--structured \.modal__footer\s*\{[^}]*margin:\s*0;[^}]*padding:\s*16px 28px calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
    expect(appStyles).not.toContain('.passkey-setup-form .modal__footer');
  });
});
