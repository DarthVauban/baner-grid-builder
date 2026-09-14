import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApplicationFormPlacementEditor } from '../components/ApplicationFormPlacementEditor';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';

export function FormButtonsPage() {
  const forms = useQuery({ queryKey: ['forms'], queryFn: api.forms.list });
  const simpleForms = (forms.data || []).filter((form) => form.formType === 'simple' && form.status !== 'archived');
  const publishedForms = simpleForms.filter((form) => form.status === 'published');

  return <div className="forms-builder-page form-buttons-page">
    <header className="page-heading page-heading--row">
      <div>
        <p className="eyebrow">Storefront Хорошоп</p>
        <h1>Кнопки форм</h1>
        <p>Створюйте кнопки незалежно від форм, обирайте форму для виклику та керуйте правилами показу в каталозі.</p>
      </div>
      <Link className="button button--secondary" to="/tools/forms"><Icon name="formBuilder" size={18} /> Відкрити форми</Link>
    </header>

    {forms.isLoading && <div className="task-list-state"><h2>Завантажуємо форми...</h2></div>}
    {forms.isError && <div className="form-message form-message--error">{forms.error instanceof Error ? forms.error.message : 'Не вдалося завантажити форми.'}</div>}
    {!forms.isLoading && !forms.isError && publishedForms.length === 0 && <section className="tool-panel task-list-state">
      <span className="task-list-state__icon"><Icon name="formBuilder" size={28} /></span>
      <h2>Спочатку опублікуйте просту форму</h2>
      <p>У списку кнопки з’являються лише опубліковані прості форми. Покрокові форми мають окремий сценарій роботи.</p>
      <Link className="button button--primary" to="/tools/forms">Перейти до конструктора форм</Link>
    </section>}
    {publishedForms.length > 0 && <ApplicationFormPlacementEditor forms={simpleForms} />}
  </div>;
}
