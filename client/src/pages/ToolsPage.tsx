import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { tools } from '../lib/tools';

export function ToolsPage() {
  const access = useQuery({
    queryKey: ['tool-access'],
    queryFn: api.users.toolAccess,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });
  const availableTools = tools.filter((tool) => access.data?.includes(tool.id));

  return (
    <div className="tools-page">
      <header className="page-heading">
        <p className="eyebrow">Робочий простір</p>
        <h1>Інструменти</h1>
        <p>Усі доступні робочі інструменти зібрані в одному місці. Набір може відрізнятися залежно від наданих вам доступів.</p>
      </header>

      {access.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо інструменти…</p></div>}
      {access.isError && <div className="task-list-state task-list-state--error"><p>Не вдалося завантажити доступні інструменти.</p><button className="button button--secondary" type="button" onClick={() => void access.refetch()}>Спробувати ще</button></div>}
      {!access.isLoading && !access.isError && !availableTools.length && <div className="task-list-state"><span className="task-list-state__icon"><Icon name="tools" size={28} /></span><h2>Немає доступних інструментів</h2><p>Зверніться до адміністратора, щоб отримати потрібні доступи.</p></div>}

      {availableTools.length > 0 && (
        <section className="tools-catalog" aria-label="Доступні інструменти">
          {availableTools.map((tool) => (
            <Link className="tool-catalog-card" to={tool.path} key={tool.id}>
              <span className="tool-catalog-card__icon"><Icon name={tool.icon} size={27} /></span>
              <span><strong>{tool.name}</strong><small>{tool.description}</small></span>
              <span className="tool-catalog-card__arrow"><Icon name="arrow" size={20} /></span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
