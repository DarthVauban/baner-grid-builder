import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LibraryCard } from '../components/LibraryCard';
import { api } from '../lib/api';
import { buildGridExport, copyToClipboard } from '../lib/banner-generator';
import { useBannerWorkspace } from '../workspace/BannerWorkspaceContext';
import { useToast } from '../toast/ToastContext';

export function SavedGridsPage({ embedded = false }: { embedded?: boolean }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useBannerWorkspace();
  const { showToast } = useToast();
  const grids = useQuery({ queryKey: ['saved-grids', search], queryFn: () => api.grids.list(search.trim()) });

  async function remove(id: string, name: string) {
    if (!window.confirm(`Видалити сітку «${name}»?`)) return;
    try { await api.grids.remove(id); await queryClient.invalidateQueries({ queryKey: ['saved-grids'] }); showToast('Сітку видалено.'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося видалити сітку.', 'error'); }
  }

  return (
    <div className={embedded ? 'banner-library-pane' : 'tool-page'}>
      {!embedded && <header className="page-heading"><p className="eyebrow">Бібліотека</p><h1>Збережені сітки</h1><p>Відкривайте власні сітки для редагування або використовуйте доступні сітки колег як нову копію.</p></header>}
      <div className="library-toolbar"><label className="task-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук сіток" /></label><span>{grids.data?.length ?? 0} сіток</span></div>
      <section className="workspace-library">
        {grids.isLoading && <div className="admin-list-state">Завантажуємо сітки…</div>}
        {!grids.isLoading && !grids.data?.length && <div className="admin-list-state">Збережених сіток не знайдено.</div>}
        {grids.data?.map((grid) => (
          <LibraryCard
            key={grid.id}
            imageUrl={grid.banners[0]?.imageUrl}
            title={grid.name}
            meta={`${grid.banners.length} банерів · ${new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(grid.updatedAt))}${grid.owner?.name ? ` · Автор: ${grid.owner.name}` : ''}`}
            actions={<>
              <button className="button button--primary button--small" onClick={() => { workspace.loadGrid(grid); navigate('/tools/banner-grid'); }}><Icon name="edit" size={16} /> {grid.isOwner ? 'Редагувати' : 'Використати як копію'}</button>
              <button className="button button--secondary button--small" onClick={() => void copyToClipboard(buildGridExport(grid.banners, grid.shareDescription)).then(() => showToast('Код сітки скопійовано.')).catch(() => showToast('Не вдалося скопіювати код.', 'error'))}><Icon name="copy" size={16} /> Копіювати код</button>
              {grid.isOwner && <button className="button button--danger button--small" onClick={() => void remove(grid.id, grid.name)}><Icon name="delete" size={16} /> Видалити</button>}
            </>}
          />
        ))}
      </section>
    </div>
  );
}
