import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { tools } from '../lib/tools';

export function ToolsPage() {
  const catalog = useQuery({
    queryKey: ['tool-catalog'],
    queryFn: api.users.toolCatalog,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true
  });
  const accessByTool = new Map(catalog.data?.tools.map((item) => [item.toolId, item]));
  const visibleTools = tools
    .filter((tool) => tool.id !== 'chat')
    .filter((tool) => accessByTool.get(tool.id)?.granted);

  return (
    <div className="tools-page">
      <header className="page-heading">
        <p className="eyebrow">Робочий простір</p>
        <h1>Інструменти</h1>
        <p>Усі доступні робочі інструменти зібрані в одному місці. Набір може відрізнятися залежно від наданих вам доступів.</p>
      </header>

      {catalog.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>Завантажуємо інструменти…</p></div>}
      {catalog.isError && <div className="task-list-state task-list-state--error"><p>Не вдалося завантажити доступні інструменти.</p><button className="button button--secondary" type="button" onClick={() => void catalog.refetch()}>Спробувати ще</button></div>}
      {!catalog.isLoading && !catalog.isError && !visibleTools.length && <div className="task-list-state"><span className="task-list-state__icon"><Icon name="tools" size={28} /></span><h2>Немає доступних інструментів</h2><p>Зверніться до адміністратора, щоб отримати потрібні доступи.</p></div>}

      {visibleTools.length > 0 && (
        <section className="tools-catalog" aria-label="Доступні інструменти">
          {visibleTools.map((tool) => {
            const state = accessByTool.get(tool.id);
            const content = (
              <>
                <span className="tool-catalog-card__icon"><Icon name={tool.icon} size={27} /></span>
                <span><strong>{tool.name}</strong><small>{state?.blockedByTwoFactor ? 'Потрібно увімкнути 2FA у профілі.' : tool.description}</small></span>
                <span className="tool-catalog-card__arrow"><Icon name={state?.blockedByTwoFactor ? 'security' : 'arrow'} size={20} /></span>
              </>
            );

            if (state?.accessible) {
              return <Link className="tool-catalog-card" to={tool.path} key={tool.id}>{content}</Link>;
            }

            return <article className="tool-catalog-card tool-catalog-card--disabled" aria-disabled="true" key={tool.id}>{content}</article>;
          })}
        </section>
      )}
    </div>
  );
}
