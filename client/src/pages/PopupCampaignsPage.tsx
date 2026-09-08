import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { PopupCampaign } from '../types/popup-banner';
import '../styles/popup-block-builder.css';

const statusLabels = { active: 'Активна', draft: 'Чернетка', paused: 'Призупинена' };
export function PopupCampaignsPage() {
  const cache = useQueryClient();
  const campaigns = useQuery({ queryKey: ['popup-campaigns'], queryFn: api.popupBanners.list });
  const embed = useQuery({ queryKey: ['popup-embed-code'], queryFn: api.popupBanners.embedCode });
  const [search, setSearch] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [contactId, setContactId] = useState('');
  const [page, setPage] = useState(1);
  const confirm = useConfirmDialog();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const contacts = useQuery({ queryKey: ['popup-campaign-contacts', contactId, page], queryFn: ({ signal }) => api.popupBanners.contacts(contactId, { page, pageSize: 50 }, signal), enabled: Boolean(contactId) });
  async function remove(deleting: PopupCampaign) {
    if (!await confirm({ title: 'Видалити «' + deleting.name + '»?', message: 'Кампанію, її контакти та статистику буде видалено безповоротно.', confirmLabel: 'Видалити кампанію', tone: 'danger' })) return;
    setBusy(deleting.id); setError('');
    try { await api.popupBanners.remove(deleting.id); if (contactId === deleting.id) setContactId(''); await cache.invalidateQueries({ queryKey: ['popup-campaigns'] }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не вдалося видалити кампанію.'); }
    finally { setBusy(''); }
  }
  async function pause(campaign: PopupCampaign) {
    setBusy(campaign.id); setError('');
    try { await api.popupBanners.setStatus(campaign.id, 'paused'); await cache.invalidateQueries({ queryKey: ['popup-campaigns'] }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Не вдалося призупинити показ.'); }
    finally { setBusy(''); }
  }
  const items = (campaigns.data || []).filter(item => item.name.toLocaleLowerCase('uk-UA').includes(search.toLocaleLowerCase('uk-UA')));
  return <main className="pb-library">
    <header><div><p className="eyebrow">КОМУНІКАЦІЯ НА САЙТІ</p><h1>Попап-банери</h1><p>Власні композиції, реальні товари та контактні форми в одному конструкторі.</p></div><Link className="button" to="/tools/popup-banners/builder">Створити банер</Link></header>
    <div className="pb-library-toolbar"><input aria-label="Пошук кампаній" placeholder="Знайти кампанію…" value={search} onChange={event => setSearch(event.target.value)} /><button className="button button--secondary" type="button" onClick={() => setShowCode(value => !value)}>Код для сайту</button><Link to="/tools/promo-codes">Промокоди</Link><Link to="/analytics/popup_banners">Аналітика</Link></div>
    {showCode && <section className="pb-library-panel"><h2>Код для сайту</h2><p>Додайте скрипт один раз. Опубліковані кампанії підвантажуються автоматично.</p>{embed.error ? <p role="alert">{embed.error.message}</p> : <textarea aria-label="Код для сайту" readOnly value={embed.data?.code || ''} onFocus={event => event.target.select()} />}</section>}
    {(error || campaigns.error) && <p role="alert">{error || campaigns.error?.message}</p>}
    {campaigns.isPending && <p role="status">Завантаження кампаній…</p>}
    {!campaigns.isPending && !campaigns.error && !items.length && <section className="pb-library-empty"><h2>{search ? 'Кампаній не знайдено' : 'Створіть перший банер'}</h2><p>Оберіть шаблон або почніть із чистого аркуша. Додавайте горизонтальні й вертикальні блоки та налаштовуйте кожен елемент.</p><Link className="button" to="/tools/popup-banners/builder">Відкрити конструктор</Link></section>}
    <div className="pb-campaign-list">{items.map(item => <article key={item.id} className="pb-campaign-card"><div><span className={'pb-campaign-status is-' + item.status}>{statusLabels[item.status]}</span><h2>{item.name}</h2><p>{item.campaignType === 'block' ? 'Блоковий конструктор' : 'Попередній редактор'}{item.hasUnpublishedChanges && ' · є неопубліковані зміни'}</p></div><dl><div><dt>Покази</dt><dd>{item.stats.impressions}</dd></div><div><dt>Кліки</dt><dd>{item.stats.clicks + item.stats.acknowledgements + item.stats.promoCtaClicks}</dd></div><div><dt>Контакти</dt><dd>{item.stats.contacts}</dd></div></dl><footer><Link className="button button--secondary" to={item.campaignType === 'block' ? '/tools/popup-banners/builder/' + item.id : '/tools/popup-banners/legacy?campaign=' + item.id}>Редагувати</Link>{['block', 'lead_form'].includes(item.campaignType) && <button type="button" onClick={() => { setContactId(item.id); setPage(1); }}>Контакти</button>}{item.status === 'active' && <button type="button" disabled={Boolean(busy)} onClick={() => void pause(item)}>Призупинити</button>}<button type="button" disabled={Boolean(busy)} onClick={() => void remove(item)}>Видалити</button></footer></article>)}</div>
    {contactId && <section className="pb-library-panel"><header><h2>Контакти · {campaigns.data?.find(item => item.id === contactId)?.name}</h2><button type="button" onClick={() => setContactId('')}>Закрити контакти</button></header><a href={'/api/popup-banners/' + contactId + '/contacts/export'}>Експорт XLSX</a>{contacts.isPending && <p role="status">Завантаження контактів…</p>}{contacts.error && <p role="alert">{contacts.error.message}</p>}<div className="pb-contact-list">{contacts.data?.items.map(contact => <article key={contact.id}><time>{new Date(contact.createdAt).toLocaleString('uk-UA')}</time>{(contact.fields || contacts.data.campaign.formConfig.fields).map(field => <div key={field.id}><strong>{field.label || field.id}: </strong>{typeof contact.values[field.id] === 'boolean' ? contact.values[field.id] ? 'Так' : 'Ні' : String(contact.values[field.id] ?? '')}</div>)}</article>)}</div>{contacts.data?.total === 0 && <p>Контактів ще немає.</p>}<div className="pb-pagination"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Попередня</button><span>Сторінка {page} · {contacts.data?.total || 0} контактів</span><button type="button" disabled={page * 50 >= (contacts.data?.total || 0)} onClick={() => setPage(value => value + 1)}>Наступна</button></div></section>}
  </main>;
}
