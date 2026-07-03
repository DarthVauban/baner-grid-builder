import type { PropsWithChildren } from 'react';

interface AuthLayoutProps extends PropsWithChildren {
  title: string;
  description: string;
}

export function AuthLayout({ title, description, children }: AuthLayoutProps) {
  return (
    <main className="auth-layout">
      <section className="auth-layout__story" aria-label="Mobile Trend tools">
        <a className="auth-layout__brand" href="/" aria-label="Mobile Trend">
          <span>MT</span>
          <strong>Mobile Trend</strong>
        </a>
        <div className="auth-layout__story-copy">
          <p className="eyebrow">Єдиний робочий простір</p>
          <h1>Інструменти команди — спокійно зібрані в одному місці.</h1>
          <p>Створюйте матеріали, працюйте з даними та плануйте справи без зайвого перемикання між сервісами.</p>
        </div>
        <p className="auth-layout__footnote">Внутрішній сервіс Mobile Trend</p>
      </section>

      <section className="auth-layout__panel">
        <div className="auth-card">
          <div className="auth-card__heading">
            <p className="eyebrow">Раді вас бачити</p>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
