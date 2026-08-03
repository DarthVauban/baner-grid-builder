import { useEffect } from 'react';
import type { FormEventHandler, ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalDialogProps {
  ariaLabelledBy: string;
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
  bodyClassName?: string;
  closeDisabled?: boolean;
}

function classNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

/**
 * Canonical modal layout: the header and footer stay visible while only the
 * body may scroll. New workspace modals should use this component instead of
 * assembling modal spacing and overflow rules locally.
 */
export function ModalDialog({
  ariaLabelledBy,
  eyebrow,
  title,
  children,
  footer,
  onClose,
  onSubmit,
  className,
  bodyClassName,
  closeDisabled = false
}: ModalDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeDisabled, onClose]);

  const content = <>
    <div className={classNames('modal__body', bodyClassName)}>{children}</div>
    {footer && <footer className="modal__footer">{footer}</footer>}
  </>;

  return <div
    className="modal-backdrop"
    role="presentation"
    onMouseDown={(event) => event.target === event.currentTarget && !closeDisabled && onClose()}
  >
    <section
      className={classNames('modal', 'modal--structured', className)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledBy}
    >
      <header className="modal__header">
        <div><p className="eyebrow">{eyebrow}</p><h2 id={ariaLabelledBy}>{title}</h2></div>
        <button className="icon-button" type="button" onClick={onClose} disabled={closeDisabled} aria-label="Закрити">
          <Icon name="close" size={20} />
        </button>
      </header>
      {onSubmit
        ? <form className="modal__frame" onSubmit={onSubmit}>{content}</form>
        : <div className="modal__frame">{content}</div>}
    </section>
  </div>;
}
