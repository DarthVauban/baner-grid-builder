import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name.trim().split(/\s+/)[0] || '';

  return (
    <div className="dashboard">
      <header className="page-heading">
        <p className="eyebrow">Робочий простір</p>
        <h1>Вітаємо, {firstName}</h1>
        <p>Новий інтерфейс уже працює поруч із поточними інструментами. Переноситимемо їх по одному, без зупинки роботи.</p>
      </header>

      <section className="hero-card">
        <div className="hero-card__icon"><Icon name="tasks" size={26} /></div>
        <div className="hero-card__copy">
          <span className="status-pill">Новий модуль</span>
          <h2>Справи та нагадування</h2>
          <p>Особисті картки, запрошення колег, дедлайни та внутрішні сповіщення вже доступні в новому інтерфейсі.</p>
        </div>
        <Link className="button button--primary" to="/tasks">Переглянути основу <Icon name="arrow" size={16} /></Link>
      </section>

      <section className="dashboard-grid" aria-label="Розділи простору">
        <article className="section-card">
          <span className="section-card__icon"><Icon name="tools" /></span>
          <div>
            <h2>Робочі інструменти</h2>
            <p>Конструктор банерів, вибірка товарів і таблиці вже працюють у новому інтерфейсі.</p>
          </div>
          <Link className="text-link" to="/tools/banner-grid">Відкрити інструменти <Icon name="arrow" size={15} /></Link>
        </article>
        <article className="section-card section-card--muted">
          <span className="section-card__icon"><Icon name="calendar" /></span>
          <div>
            <h2>Сьогодні</h2>
            <p>Після запуску справ тут з’явиться коротке зведення на день.</p>
          </div>
          <span className="text-muted">Незабаром</span>
        </article>
      </section>
    </div>
  );
}
