import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { Icon } from '../components/Icon';

interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface PendingConfirm {
  options: ConfirmDialogOptions;
  resolve: (confirmed: boolean) => void;
}

const ConfirmDialogContext = createContext<((options: ConfirmDialogOptions) => Promise<boolean>) | null>(null);

export function ConfirmDialogProvider({ children }: PropsWithChildren) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    setPending({ options, resolve });
  }), []);

  const settle = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return undefined;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') settle(false);
      if (event.key === 'Enter') settle(true);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [pending, settle]);

  const tone = pending?.options.tone || 'default';

  return <ConfirmDialogContext.Provider value={confirm}>
    {children}
    {pending && <div className="modal-backdrop modal-backdrop--nested" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && settle(false)}>
      <section className={`modal confirm-dialog confirm-dialog--${tone}`} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <header className="modal__header">
          <div>
            <p className="eyebrow">{tone === 'danger' ? 'Потрібне підтвердження' : 'Підтвердження'}</p>
            <h2 id="confirm-dialog-title">{pending.options.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={() => settle(false)} aria-label="Закрити"><Icon name="close" size={20} /></button>
        </header>
        <div className="confirm-dialog__content">
          <span className="confirm-dialog__mark"><Icon name={tone === 'danger' ? 'delete' : 'check'} size={22} /></span>
          <p>{pending.options.message}</p>
        </div>
        <footer className="modal__footer confirm-dialog__footer">
          <button className="button button--secondary" type="button" onClick={() => settle(false)}>{pending.options.cancelLabel || 'Скасувати'}</button>
          <button className={tone === 'danger' ? 'button button--danger' : 'button button--primary'} type="button" onClick={() => settle(true)}>{pending.options.confirmLabel || 'Підтвердити'}</button>
        </footer>
      </section>
    </div>}
  </ConfirmDialogContext.Provider>;
}

export function useConfirmDialog() {
  const context = useContext(ConfirmDialogContext);
  if (!context) throw new Error('useConfirmDialog must be used inside ConfirmDialogProvider');
  return context;
}
