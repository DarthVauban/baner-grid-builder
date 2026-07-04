import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { buildBannerHtml, buildGridExport, copyToClipboard, isBannerValid, normalizeBanner } from '../lib/banner-generator';
import { BannerEditorCard } from '../components/BannerEditorCard';
import { BannerPreview } from '../components/BannerPreview';
import { Icon } from '../components/Icon';
import { SavedGridsPage } from './SavedGridsPage';
import { SavedBannersPage } from './SavedBannersPage';
import { useBannerWorkspace } from '../workspace/BannerWorkspaceContext';
import { useToast } from '../toast/ToastContext';

export function BannerBuilderPage() {
  const workspace = useBannerWorkspace();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const validBanners = useMemo(() => workspace.banners.map(normalizeBanner).filter(isBannerValid), [workspace.banners]);
  const generatedCode = useMemo(() => buildGridExport(validBanners, workspace.shareDescription), [validBanners, workspace.shareDescription]);
  const requestedTab = searchParams.get('tab');
  const activeTab = requestedTab === 'grids' || requestedTab === 'banners' ? requestedTab : 'builder';

  function setActiveTab(tab: 'builder' | 'grids' | 'banners') {
    setSearchParams(tab === 'builder' ? {} : { tab }, { replace: true });
  }

  async function copy(text: string, success: string) {
    try { await copyToClipboard(text); showToast(success); }
    catch { showToast('Не вдалося скопіювати код.', 'error'); }
  }

  async function saveGrid() {
    if (!workspace.gridName.trim()) return setMessage('Вкажіть назву банерної сітки.');
    if (!workspace.banners.some((banner) => Object.values(normalizeBanner(banner)).some(Boolean))) return setMessage('Додайте хоча б один банер.');
    setPending(true);
    try {
      const input = { name: workspace.gridName.trim(), shareDescription: workspace.shareDescription.trim(), banners: workspace.banners.map(normalizeBanner) };
      const saved = workspace.editingGridId ? await api.grids.update(workspace.editingGridId, input) : await api.grids.create(input);
      workspace.setEditingGridId(saved.id);
      await queryClient.invalidateQueries({ queryKey: ['saved-grids'] });
      setMessage(workspace.editingGridId ? 'Сітку оновлено.' : 'Сітку збережено.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося зберегти сітку.'); }
    finally { setPending(false); }
  }

  async function saveBanner(localId: string) {
    const draft = workspace.banners.find((item) => item.localId === localId);
    if (!draft || !isBannerValid(draft)) return;
    setPending(true);
    try {
      const input = { name: draft.title.trim(), banner: normalizeBanner(draft) };
      const saved = draft.savedBannerId ? await api.banners.update(draft.savedBannerId, input) : await api.banners.create(input);
      workspace.markBannerSaved(localId, saved.id);
      await queryClient.invalidateQueries({ queryKey: ['saved-banners'] });
      setMessage(draft.savedBannerId ? 'Банер оновлено.' : 'Банер збережено.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не вдалося зберегти банер.'); }
    finally { setPending(false); }
  }

  return (
    <div className="tool-page banner-builder-page">
      <header className="page-heading page-heading--row"><div><p className="eyebrow">Конструктор</p><h1>Банерна сітка</h1><p>Створюйте банерні сітки та керуйте збереженими матеріалами в одному місці.</p></div>{activeTab === 'builder' && <div className="page-heading__actions"><button className="button button--secondary" type="button" onClick={() => workspace.reset(true)}><Icon name="add" size={18} /> Нова сітка</button><button className="button button--primary" type="button" disabled={pending} onClick={() => void saveGrid()}><Icon name="save" size={18} /> {pending ? 'Зберігаємо…' : workspace.editingGridId ? 'Оновити сітку' : 'Зберегти сітку'}</button></div>}</header>
      <nav className="banner-tool-tabs" aria-label="Розділи банерної сітки">
        <button type="button" className={activeTab === 'builder' ? 'active' : ''} onClick={() => setActiveTab('builder')}><Icon name="bannerGrid" size={18} /> Конструктор</button>
        <button type="button" className={activeTab === 'grids' ? 'active' : ''} onClick={() => setActiveTab('grids')}><Icon name="savedGrids" size={18} /> Збережені сітки</button>
        <button type="button" className={activeTab === 'banners' ? 'active' : ''} onClick={() => setActiveTab('banners')}><Icon name="savedBanners" size={18} /> Збережені банери</button>
      </nav>
      {activeTab === 'builder' && <>
      {message && <div className="tasks-page__message"><span>{message}</span><button type="button" onClick={() => setMessage('')} aria-label="Закрити повідомлення"><Icon name="close" size={18} /></button></div>}
      <section className="tool-workspace-bar"><label className="field"><span>Назва банерної сітки</span><input value={workspace.gridName} maxLength={160} onChange={(event) => workspace.setGridName(event.target.value)} placeholder="Наприклад, Літній розпродаж" /></label>{workspace.editingGridId && <span className="workspace-mode">Режим редагування</span>}</section>
      <div className="banner-builder-layout">
        <section className="tool-panel"><header className="tool-panel__header"><div><p className="eyebrow">Крок 1</p><h2>Дані банерів</h2></div><span>{workspace.banners.length}</span></header><div className="banner-editor-list">{workspace.banners.map((banner, index) => <BannerEditorCard key={banner.localId} banner={banner} index={index} canRemove={workspace.banners.length > 1} pending={pending} onChange={(patch) => workspace.updateBanner(banner.localId, patch)} onRemove={() => workspace.removeBanner(banner.localId)} onSave={() => void saveBanner(banner.localId)} onCopy={() => void copy(buildBannerHtml(normalizeBanner(banner)), 'HTML банера скопійовано.')} />)}</div><button className="button button--add" type="button" onClick={() => workspace.addBanner()}><Icon name="add" size={18} /> Додати банер</button></section>
        <section className="tool-panel banner-preview-panel"><header className="tool-panel__header"><div><p className="eyebrow">Крок 2</p><h2>Попередній перегляд</h2></div><span className="live-pill">Наживо</span></header><div className="banner-preview-grid">{workspace.banners.map((banner) => <BannerPreview key={banner.localId} banner={normalizeBanner(banner)} />)}</div></section>
      </div>
      <section className="tool-panel code-panel"><header className="tool-panel__header"><div><p className="eyebrow">Крок 3</p><h2>Готовий HTML + CSS</h2><p>{validBanners.length ? `${validBanners.length} банерів у коді.` : 'Заповніть обов’язкові поля банера.'}</p></div><button className="button button--primary" type="button" disabled={!validBanners.length} onClick={() => void copy(generatedCode, 'HTML + CSS скопійовано.')}><Icon name="copy" size={18} /> Копіювати HTML + CSS</button></header><label className="field"><span>Опис для поширення посилання</span><textarea value={workspace.shareDescription} onChange={(event) => workspace.setShareDescription(event.target.value)} rows={2} placeholder="Короткий опис сторінки" /></label><textarea className="code-output" value={generatedCode} readOnly spellCheck={false} aria-label="Згенерований HTML та CSS" /></section>
      </>}
      {activeTab === 'grids' && <SavedGridsPage embedded />}
      {activeTab === 'banners' && <SavedBannersPage embedded />}
    </div>
  );
}
