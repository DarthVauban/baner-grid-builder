import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LibraryCard } from '../components/LibraryCard';
import { api } from '../lib/api';
import { buildBannerHtml, copyToClipboard } from '../lib/banner-generator';
import { useBannerWorkspace } from '../workspace/BannerWorkspaceContext';
import { useToast } from '../toast/ToastContext';

export function SavedBannersPage({ embedded = false }: { embedded?: boolean }) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspace = useBannerWorkspace();
  const { showToast } = useToast();
  const banners = useQuery({ queryKey: ['saved-banners', search], queryFn: () => api.banners.list(search.trim()) });

  async function remove(id: string, name: string) {
    if (!window.confirm(`Видалити банер «${name}»?`)) return;
    try { await api.banners.remove(id); await queryClient.invalidateQueries({ queryKey: ['saved-banners'] }); showToast('Банер видалено.'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося видалити банер.', 'error'); }
  }

  return (
    <div className={embedded ? 'banner-library-pane' : 'tool-page'}>
      {!embedded && <header className="page-heading"><p className="eyebrow">Бібліотека</p><h1>Збережені банери</h1><p>Повторно використовуйте окремі банери або додавайте їх до поточної сітки.</p></header>}
      <div className="library-toolbar"><label className="task-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук банерів" /></label><span>{banners.data?.length ?? 0} банерів</span></div>
      <section className="workspace-library">
        {banners.isLoading && <div className="admin-list-state">Завантажуємо банери…</div>}
        {!banners.isLoading && !banners.data?.length && <div className="admin-list-state">Збережених банерів не знайдено.</div>}
        {banners.data?.map((record) => (
          <LibraryCard
            key={record.id}
            imageUrl={record.banner.imageUrl}
            title={record.name}
            meta={`Акція до ${record.banner.endDate || 'не вказано'}${record.owner?.name ? ` · Автор: ${record.owner.name}` : ''}`}
            actions={<>
              <button className="button button--primary button--small" onClick={() => { workspace.loadSavedBanner(record); navigate('/tools/banner-grid'); }}><Icon name="edit" size={16} /> {record.isOwner ? 'Редагувати' : 'Використати як копію'}</button>
              <button className="button button--secondary button--small" onClick={() => { workspace.addSavedBanner(record); navigate('/tools/banner-grid'); }}><Icon name="add" size={16} /> Додати в сітку</button>
              <button className="button button--secondary button--small" onClick={() => void copyToClipboard(buildBannerHtml(record.banner)).then(() => showToast('HTML банера скопійовано.')).catch(() => showToast('Не вдалося скопіювати HTML.', 'error'))}><Icon name="copy" size={16} /> Копіювати HTML</button>
              {record.isOwner && <button className="button button--danger button--small" onClick={() => void remove(record.id, record.name)}><Icon name="delete" size={16} /> Видалити</button>}
            </>}
          />
        ))}
      </section>
    </div>
  );
}
