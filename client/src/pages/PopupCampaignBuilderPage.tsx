import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { emptyCampaign, previewDocument } from '../lib/popup-campaign';
import { BlockStudio } from './PopupBlockBuilderPage';
import { CampaignWorkspace, applyScenario } from '../components/popup-builder/CampaignWorkspace';
import '../styles/popup-campaign-workspace.css';
import { createTemplate } from '../components/popup-builder/templates';
import type { BlockDocument, Device } from '../components/popup-builder/block-model';
import type { PopupCampaign, PopupCampaignInput, PopupPreviewPayload } from '../types/popup-banner';
import type { PromoCode, PromoCodeSnapshot } from '../types/promo-code';
import { PromoCodePickerModal } from '../components/promo-codes/PromoCodePickerModal';
import '../styles/promo-codes.css';

function campaignDraft(campaign?: PopupCampaign): PopupCampaignInput {
  const base = emptyCampaign('block');
  return campaign ? {
    ...base, ...campaign, productEntries: campaign.productTargets.map(item => item.inputValue || item.sku),
    promoItems: [], blockDocument: campaign.blockDocument
  } : { ...base, targeting: { ...base.targeting, mode: 'all_pages' }, behavior: { ...base.behavior, frequency: 'session', delayMs: 700, maxShowsPerSession: 1, buttonCount: 1 }, blockDocument: createTemplate('promotion', true) };
}
function inputFor(settings: PopupCampaignInput, document: BlockDocument): PopupCampaignInput {
  return {
    ...settings, campaignType: 'block', name: document.name, blockDocument: document, promoItems: [],
    productEntries: settings.productEntries.map(value => value.trim()).filter(Boolean),
    targeting: { ...settings.targeting, urlContains: settings.targeting.urlContains.map(value => value.trim()).filter(Boolean) },
    styles: { ...settings.styles, maxWidth: Math.max(320, Math.min(1400, document.root.style.width || 640)) },
    behavior: settings.behavior
  };
}
function RuntimePreview({ payload, device, restart, error, onEscape }: { payload: PopupPreviewPayload | null; device: Device; restart: number; error: string; onEscape: () => void }) {
  const source = useMemo(() => payload ? previewDocument(payload, device) : '', [payload, device]);
  return <div className="pb-runtime-frame pp-sample-banner" style={{ width: device === 'mobile' ? 390 : 1100, height: device === 'mobile' ? 760 : 760 }}>
    {error ? <p role="alert">{error}</p> : payload ? <iframe key={device + ':' + restart} title="Тестування банера на сайті" srcDoc={source} sandbox="allow-scripts allow-same-origin" onLoad={event => { event.currentTarget.contentDocument?.addEventListener('keydown', key => { if (key.key === 'Escape') onEscape(); }); }} /> : <p role="status">Готуємо перегляд…</p>}
  </div>;
}
function CampaignEditor({ campaign }: { campaign?: PopupCampaign }) {
  const navigate = useNavigate();
  const confirm = useConfirmDialog();
  const cache = useQueryClient();
  const [initial] = useState(() => campaignDraft(campaign));
  const [settings, setSettings] = useState(initial);
  const [document, setDocument] = useState(initial.blockDocument!);
  const [saved, setSaved] = useState(campaign || null);
  const [baseline, setBaseline] = useState(() => campaign ? JSON.stringify(inputFor(initial, initial.blockDocument!)) : '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [contextUrl, setContextUrl] = useState('');
  const [picker, setPicker] = useState(false);
  const [code, setCode] = useState<PromoCode | PromoCodeSnapshot | null>(campaign?.promoCode || null);
  const [preview, setPreview] = useState<PopupPreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const input = useMemo(() => inputFor(settings, document), [settings, document]);
  const dirty = JSON.stringify(input) !== baseline;
  const onDocumentChange = useCallback((value: BlockDocument) => setDocument(value), []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      void api.popupBanners.preview({ ...input, contextUrl } as PopupCampaignInput, controller.signal).then(value => { if (!controller.signal.aborted) { setPreview(value); setPreviewError(''); } }).catch(caught => { if (!controller.signal.aborted) setPreviewError(caught instanceof Error ? caught.message : 'Не вдалося оновити прев’ю.'); }).finally(() => { if (!controller.signal.aborted) setPreviewBusy(false); });
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [input, contextUrl]);
  async function save(value: BlockDocument, publish = false) {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const next = inputFor(settings, value);
      let result = saved ? await api.popupBanners.update(saved.id, next) : await api.popupBanners.create(next);
      setSaved(result); setBaseline(JSON.stringify(next));
      if (publish && result.resolution?.unmatched.length) throw new Error('Не знайдено товари для умов показу: ' + result.resolution.unmatched.join(', '));
      if (publish) { result = await api.popupBanners.setStatus(result.id, 'active'); setSaved(result); }
      cache.setQueryData(['popup-block-campaign', result.id], result);
      await cache.invalidateQueries({ queryKey: ['popup-campaigns'] });
      setMessage(publish ? 'Кампанію опубліковано на сайті.' : result.resolution?.unmatched.length ? 'Чернетку збережено. Не знайдено: ' + result.resolution.unmatched.join(', ') : 'Чернетку збережено.');
      if (!campaign) navigate('/tools/popup-banners/builder/' + result.id, { replace: true });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не вдалося зберегти кампанію.'); }
    finally { setBusy(false); }
  }
  async function pause() {
    if (!saved || busy) return;
    setBusy(true); setError('');
    try { const result = await api.popupBanners.setStatus(saved.id, 'paused'); setSaved(result); await cache.invalidateQueries({ queryKey: ['popup-campaigns'] }); setMessage('Показ кампанії призупинено.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не вдалося призупинити показ.'); }
    finally { setBusy(false); }
  }
  return <>
    <BlockStudio storageKey={'popup-campaign:' + (campaign?.id || 'new')} live={{
      onLeave: () => { if (!dirty) navigate('/tools/popup-banners'); else void confirm({ title: 'Вийти без збереження?', message: 'Незбережені зміни макета й умов показу буде втрачено.', confirmLabel: 'Вийти без збереження' }).then(leave => { if (leave) navigate('/tools/popup-banners'); }); },
      initialDocument: initial.blockDocument!, onDocumentChange, busy,
      initialTab: campaign ? 'design' : 'data',
      onTemplate: async name => { const ok = await confirm({ title: 'Застосувати шаблон?', message: 'Макет та правила аудиторії будуть замінені налаштуваннями сценарію. Частота, розклад і промокод збережуться.', confirmLabel: 'Застосувати шаблон' }); if (ok) setSettings(current => applyScenario(current, name)); return ok; },
      collections: preview?.collections, pageProduct: preview?.pageProduct,
      workspace: (tab, value, update, select) => <CampaignWorkspace campaignId={saved?.id} tab={tab} input={inputFor(settings, value)} onChange={setSettings} document={value} onDocument={update} onSelect={select} contextUrl={contextUrl} onContextUrl={setContextUrl} preview={preview} promoCode={settings.promoCodeId ? code?.code : undefined} onChooseCode={() => setPicker(true)} />,
      products: preview?.products || [], campaignCode: settings.promoCodeId ? code?.code : undefined,
      controls: value => <><span className="pp-save-state" role="status">{busy ? 'Збереження…' : dirty ? 'Незбережені зміни' : saved?.hasUnpublishedChanges ? 'Є неопубліковані зміни' : saved?.status === 'active' ? 'Опубліковано' : 'Чернетку збережено'}</span><button type="button" disabled={busy || !dirty} onClick={() => void save(value)}>Зберегти</button>{saved?.status === 'active' && <button type="button" disabled={busy} onClick={() => void pause()}>Призупинити</button>}<button className="pp-primary" type="button" disabled={busy} onClick={() => void save(value, true)}>Опублікувати</button></>,
      settings: null,
      preview: (_value, device, restart) => <RuntimePreview payload={preview} device={device} restart={restart} error={previewError} onEscape={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))} />
    }} />
    {(message || error || previewBusy || previewError) && <div className={'pb-server-notice ' + (error ? 'is-error' : '')} role={error ? 'alert' : 'status'}>{error || message || previewError || 'Оновлюємо дані прев’ю…'}{(message || error) && <button type="button" aria-label="Закрити сповіщення" onClick={() => { setError(''); setMessage(''); }}>×</button>}</div>}
    {picker && <PromoCodePickerModal selectedId={settings.promoCodeId} onClose={() => setPicker(false)} onSelect={value => { setCode(value); setSettings(current => ({ ...current, promoCodeId: value.id })); setPicker(false); }} />}
  </>;
}
export function PopupCampaignBuilderPage() {
  const { id } = useParams();
  const campaign = useQuery({ queryKey: ['popup-block-campaign', id], queryFn: ({ signal }) => api.popupBanners.get(id!, signal), enabled: Boolean(id) });
  if (id && campaign.isPending) return <p role="status">Завантаження кампанії…</p>;
  if (id && campaign.error) return <div role="alert"><p>{campaign.error.message}</p><Link to="/tools/popup-banners">До кампаній</Link></div>;
  if (campaign.data && (campaign.data.campaignType !== 'block' || !campaign.data.blockDocument)) return <div><p>Цю кампанію створено у попередньому редакторі.</p><Link to="/tools/popup-banners/legacy">Відкрити попередній редактор</Link></div>;
  return <CampaignEditor key={id || 'new'} campaign={id ? campaign.data : undefined} />;
}
