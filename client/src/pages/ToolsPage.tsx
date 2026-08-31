import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { toolCategories, tools } from '../lib/tools';

export function ToolsPage() {
  const queryClient = useQueryClient();
  const [showRecovery, setShowRecovery] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const catalog = useQuery({
    queryKey: ['tool-catalog'],
    queryFn: ({ signal }) => api.users.toolCatalog(signal),
    staleTime: 30_000,
    gcTime: 30 * 60_000,
    retry: 1,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true
  });

  useEffect(() => {
    if (!catalog.isLoading) {
      setShowRecovery(false);
      return undefined;
    }

    const timeout = globalThis.setTimeout(() => setShowRecovery(true), 8_000);
    return () => globalThis.clearTimeout(timeout);
  }, [catalog.isLoading, loadAttempt]);

  const restartCatalog = async () => {
    setShowRecovery(false);
    setLoadAttempt((attempt) => attempt + 1);
    await queryClient.cancelQueries({ queryKey: ['tool-catalog'] });
    await catalog.refetch({ cancelRefetch: true });
  };
  const accessByTool = new Map(catalog.data?.tools.map((item) => [item.toolId, item]));
  const visibleTools = tools
    .filter((tool) => !['chat', 'form_builder', 'store_map'].includes(tool.id))
    .filter((tool) => tool.showInTools !== false)
    .filter((tool) => accessByTool.get(tool.id)?.granted);
  const visibleCategories = toolCategories
    .map((category) => ({
      ...category,
      tools: visibleTools.filter((tool) => tool.category === category.id)
    }))
    .filter((category) => category.tools.length > 0);

  return (
    <div className="tools-page">
      <header className="page-heading">
        <p className="eyebrow">Робочий простір</p>
        <h1>Інструменти</h1>
        <p>Усі доступні робочі інструменти зібрані в одному місці. Набір може відрізнятися залежно від наданих вам доступів.</p>
      </header>

      {catalog.isLoading && <div className="task-list-state"><span className="loading-screen__pulse" /><p>{showRecovery ? 'Завантаження триває довше, ніж зазвичай.' : 'Завантажуємо інструменти…'}</p>{showRecovery && <button className="button button--secondary task-list-state__action" type="button" onClick={() => void restartCatalog()}>Перезапустити завантаження</button>}</div>}
      {catalog.isError && <div className="task-list-state task-list-state--error"><p>Не вдалося завантажити доступні інструменти.</p><button className="button button--secondary task-list-state__action" type="button" onClick={() => void restartCatalog()}>Спробувати ще</button></div>}
      {!catalog.isLoading && !catalog.isError && !visibleTools.length && <div className="task-list-state"><span className="task-list-state__icon"><Icon name="tools" size={28} /></span><h2>Немає доступних інструментів</h2><p>Зверніться до адміністратора, щоб отримати потрібні доступи.</p></div>}

      {visibleTools.length > 0 && (
        <section className="tools-catalog" aria-label="Доступні інструменти">
          {visibleCategories.map((category) => (
            <details className="tool-category" key={category.id}>
              <summary className="tool-category__summary">
                <span className="tool-category__icon"><Icon name={category.icon} size={21} /></span>
                <span className="tool-category__copy">
                  <strong>{category.name}</strong>
                  <small>{category.description} · {category.tools.length}</small>
                </span>
                <span className="tool-category__arrow" aria-hidden="true"><Icon name="arrow" size={18} /></span>
              </summary>
              <div className="tool-category__menu">
                {category.tools.map((tool) => {
                  const state = accessByTool.get(tool.id);
                  const content = (
                    <>
                      <span className="tool-catalog-card__icon"><Icon name={tool.icon} size={21} /></span>
                      <span><strong>{tool.name}</strong><small>{state?.blockedByTwoFactor ? 'Потрібно увімкнути 2FA у профілі.' : tool.description}</small></span>
                      <span className="tool-catalog-card__arrow"><Icon name={state?.blockedByTwoFactor ? 'security' : 'arrow'} size={17} /></span>
                    </>
                  );

                  if (state?.accessible) {
                    return <Link className="tool-catalog-card" to={tool.path} key={tool.id}>{content}</Link>;
                  }

                  return <article className="tool-catalog-card tool-catalog-card--disabled" aria-disabled="true" key={tool.id}>{content}</article>;
                })}
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
