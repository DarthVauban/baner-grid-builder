import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '@workspace/components/Icon';
import { useToast } from '@workspace/toast/ToastContext';
import { PopupBuilder } from './editor';
import { PaintLibraryProvider } from './ui/paint-library';
import { zeroBlockApi } from './workspace-api';
import './workspace-theme.css';
import './ui/components.css';
import './ui/data-entry.css';
import './ui/color-area.css';
import './ui/editor-controls.css';
import './builder.css';

const base = '/tools/popup-banners';

function LibraryLink() {
  return <Link to={base} className="button button--secondary button--small"><Icon name="arrowLeft" size={17} /> До кампаній</Link>;
}

function CreateCampaign() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending || name.trim().length < 2) return;
    setPending(true);
    try {
      const campaign = await zeroBlockApi.create(name);
      await queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
      navigate(`${base}/zero-block/${campaign.widgetId}`, { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити кампанію.', 'error');
    } finally {
      setPending(false);
    }
  }

  return <section className="zero-block-page">
    <LibraryLink />
    <form className="zero-block-card" onSubmit={create}>
      <h1>Нова кампанія Zero Block</h1>
      <label className="field"><span>Назва кампанії</span><input value={name} onChange={(event) => setName(event.target.value)}
        required minLength={2} maxLength={100} /></label>
      <button className="button button--primary" disabled={pending || name.trim().length < 2}>Створити чернетку</button>
    </form>
  </section>;
}

function CampaignContacts() {
  const [params, setParams] = useSearchParams();
  const campaignId = params.get('campaign') || undefined;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const contacts = useQuery({
    queryKey: ['zero-block-contacts', page, campaignId],
    queryFn: () => zeroBlockApi.contacts(page, campaignId)
  });
  const lastPage = Math.max(1, Math.ceil((contacts.data?.total || 0) / (contacts.data?.pageSize || 30)));
  const changePage = (next: number) => setParams({ page: String(next), ...(campaignId ? { campaign: campaignId } : {}) });
  return <section className="zero-block-page">
    <LibraryLink />
    <h1>Заявки Zero Block</h1>
    {campaignId && <Link className="button button--secondary button--small" to={`${base}/zero-block/contacts`}>Усі заявки</Link>}
    {contacts.isPending && <p role="status">Завантажуємо заявки…</p>}
    {contacts.isError && <p role="alert">Не вдалося завантажити заявки.</p>}
    {contacts.data?.total === 0 && <p>Заявок ще немає.</p>}
    {contacts.data?.items.map((item) => <article className="zero-block-card" key={item.id}>
      <h2>{item.campaignName}</h2>
      <p><time dateTime={item.createdAt}>{new Intl.DateTimeFormat('uk-UA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Kyiv' })
        .format(new Date(item.createdAt))}</time>{item.deleted ? ' · Кампанію видалено' : ''}</p>
      <dl>{item.fields.map(({ label, value }, index) => <div key={index}><dt>{label}</dt>
        <dd>{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Так' : 'Ні' : value}</dd></div>)}</dl>
    </article>)}
    {lastPage > 1 && <div className="product-actions">
      <button type="button" className="button button--secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Назад</button>
      <span>{page} / {lastPage}</span>
      <button type="button" className="button button--secondary" disabled={page >= lastPage} onClick={() => changePage(page + 1)}>Далі</button>
    </div>}
  </section>;
}

export default function ZeroBlockPage() {
  const { id } = useParams();
  if (!id || id === 'new') return <CreateCampaign />;
  if (id === 'contacts') return <CampaignContacts />;
  return <PaintLibraryProvider adapter={zeroBlockApi.paints}><PopupBuilder key={id} widgetId={id} /></PaintLibraryProvider>;
}
