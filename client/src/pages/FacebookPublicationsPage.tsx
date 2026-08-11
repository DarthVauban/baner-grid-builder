import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/banner-generator';
import {
  downloadFacebookGroupsExport,
  downloadFacebookGroupsImportTemplate,
  downloadFacebookStoresExport,
  downloadFacebookStoresImportTemplate,
  type FacebookPublicationImportType,
  readFacebookPublicationWorkbook
} from '../lib/facebook-publication-xlsx';
import type {
  FacebookPublicationCampaign,
  FacebookPublicationGroup,
  FacebookPublicationGroupInput,
  FacebookPublicationImportPreview,
  FacebookPublicationStore,
  FacebookPublicationStoreInput,
  FacebookPublicationTarget,
  FacebookPublicationWorkbookRows,
  FacebookTargetStatus
} from '../types/facebook-publication';
import { Icon } from '../components/Icon';
import { ModalDialog } from '../components/ModalDialog';
import { StyledSelect } from '../components/StyledSelect';
import { useAuth } from '../auth/AuthContext';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useToast } from '../toast/ToastContext';
import '../styles/facebook-publications.css';

type WorkspaceTab = 'campaigns' | 'groups' | 'stores' | 'history';

const targetLabels: Record<FacebookTargetStatus, string> = {
  not_started: 'Не почато',
  published: 'Опубліковано',
  pending_moderation: 'На модерації',
  rejected: 'Відхилено',
  skipped: 'Пропустити'
};

const campaignDefaultText = `😱 Хочеш гаджети за знижкою {{promotion}}?

Завітай до нашого магазину в місті {{city}} за адресою:
{{address}}

Скануй код та забирай свій гаджет! 📱`;

const targetStatusOptions = Object.entries(targetLabels).map(([value, label]) => ({
  value: value as FacebookTargetStatus,
  label
}));

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {})
  }).format(new Date(value));
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function isRecentlyPublished(group: FacebookPublicationGroup) {
  if (!group.lastPublishedAt || group.recommendedIntervalDays <= 0) return false;
  const allowedAt = new Date(group.lastPublishedAt);
  allowedAt.setDate(allowedAt.getDate() + group.recommendedIntervalDays);
  return allowedAt.getTime() > Date.now();
}

function StoreEditor({
  store,
  onClose,
  onSaved
}: {
  store: FacebookPublicationStore | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [input, setInput] = useState<FacebookPublicationStoreInput>(() => store ? {
    city: store.city,
    address: store.address
  } : { city: '', address: '' });
  const save = useMutation({
    mutationFn: () => store
      ? api.facebookPublications.updateStore(store.id, input)
      : api.facebookPublications.createStore(input)
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await save.mutateAsync();
      showToast(store ? 'Місто й адресу оновлено.' : 'Місто й адресу додано.');
      onSaved();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти місто й адресу.', 'error');
    }
  }

  return <ModalDialog
    ariaLabelledBy="facebook-store-editor-title"
    eyebrow="Довідник міст"
    title={store ? 'Редагувати місто' : 'Нове місто'}
    onClose={onClose}
    onSubmit={submit}
    closeDisabled={save.isPending}
    className="facebook-modal facebook-modal--form"
    footer={<>
      <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
      <button className="button button--primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Зберігаємо…' : 'Зберегти'}</button>
    </>}
  >
    <div className="facebook-form-grid">
      <label className="field"><span>Місто</span><input required maxLength={120} value={input.city} onChange={(event) => setInput({ ...input, city: event.target.value })} /></label>
      <label className="field"><span>Адреса</span><input required maxLength={500} value={input.address} onChange={(event) => setInput({ ...input, address: event.target.value })} /></label>
    </div>
  </ModalDialog>;
}

function GroupEditor({
  group,
  onClose,
  onSaved
}: {
  group: FacebookPublicationGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [input, setInput] = useState<FacebookPublicationGroupInput>(() => group ? {
    name: group.name,
    url: group.url,
    advertisingPolicy: group.advertisingPolicy,
    moderationRequired: group.moderationRequired,
    status: group.status
  } : {
    name: '', url: '', advertisingPolicy: 'unknown', moderationRequired: false, status: 'active'
  });
  const save = useMutation({
    mutationFn: () => group
      ? api.facebookPublications.updateGroup(group.id, input)
      : api.facebookPublications.createGroup(input)
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await save.mutateAsync();
      showToast(group ? 'Facebook-групу оновлено.' : 'Facebook-групу додано.');
      onSaved();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти групу.', 'error');
    }
  }

  return <ModalDialog
    ariaLabelledBy="facebook-group-editor-title"
    eyebrow="База Facebook-груп"
    title={group ? 'Редагувати групу' : 'Нова Facebook-група'}
    onClose={onClose}
    onSubmit={submit}
    closeDisabled={save.isPending}
    className="facebook-modal facebook-modal--form"
    footer={<>
      <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
      <button className="button button--primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Зберігаємо…' : 'Зберегти'}</button>
    </>}
  >
    <div className="facebook-form-grid">
      <label className="field facebook-form-grid__wide"><span>Назва групи</span><input required maxLength={300} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></label>
      <label className="field facebook-form-grid__wide"><span>Посилання на Facebook-групу</span><input required type="url" maxLength={2000} value={input.url} onChange={(event) => setInput({ ...input, url: event.target.value })} placeholder="https://www.facebook.com/groups/..." /></label>
      <p className="facebook-form-grid__wide facebook-optional-heading">Необов’язкові позначки</p>
      <label className="facebook-checkbox"><input type="checkbox" checked={input.advertisingPolicy === 'allowed'} onChange={(event) => setInput({ ...input, advertisingPolicy: event.target.checked ? 'allowed' : 'unknown' })} /><span>Реклама дозволена</span></label>
      <label className="facebook-checkbox"><input type="checkbox" checked={input.advertisingPolicy === 'forbidden'} onChange={(event) => setInput({ ...input, advertisingPolicy: event.target.checked ? 'forbidden' : 'unknown' })} /><span>Реклама заборонена</span></label>
      <label className="facebook-checkbox"><input type="checkbox" checked={input.moderationRequired} onChange={(event) => setInput({ ...input, moderationRequired: event.target.checked })} /><span>Публікація проходить модерацію</span></label>
      <label className="facebook-checkbox"><input type="checkbox" checked={input.status === 'inactive'} onChange={(event) => setInput({ ...input, status: event.target.checked ? 'inactive' : 'active' })} /><span>Група тимчасово неактивна</span></label>
      <label className="facebook-checkbox facebook-form-grid__wide"><input type="checkbox" checked={input.status === 'do_not_publish'} onChange={(event) => setInput({ ...input, status: event.target.checked ? 'do_not_publish' : 'active' })} /><span>Не публікувати в цій групі</span></label>
    </div>
  </ModalDialog>;
}

function ImportChoiceDialog({
  onClose,
  onSelect
}: {
  onClose: () => void;
  onSelect: (type: FacebookPublicationImportType) => void;
}) {
  return <ModalDialog
    ariaLabelledBy="facebook-import-choice-title"
    eyebrow="Масове наповнення"
    title="Що потрібно імпортувати?"
    onClose={onClose}
    className="facebook-modal facebook-modal--choice"
    footer={<button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>}
  >
    <div className="facebook-import-choice">
      <button type="button" onClick={() => onSelect('groups')}>
        <span><Icon name="users" size={24} /></span>
        <strong>Facebook-групи</strong>
        <small>Назви, посилання та необов’язкові позначки публікацій.</small>
      </button>
      <button type="button" onClick={() => onSelect('stores')}>
        <span><Icon name="location" size={24} /></span>
        <strong>Міста й адреси</strong>
        <small>Адреси, які вибираються під час створення кампанії.</small>
      </button>
    </div>
  </ModalDialog>;
}

function TemplateChoiceDialog({ onClose }: { onClose: () => void }) {
  function download(type: FacebookPublicationImportType) {
    if (type === 'groups') downloadFacebookGroupsImportTemplate();
    else downloadFacebookStoresImportTemplate();
    onClose();
  }

  return <ModalDialog
    ariaLabelledBy="facebook-template-choice-title"
    eyebrow="Шаблони імпорту"
    title="Який шаблон завантажити?"
    onClose={onClose}
    className="facebook-modal facebook-modal--choice"
    footer={<button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>}
  >
    <div className="facebook-import-choice">
      <button type="button" onClick={() => download('groups')}>
        <span><Icon name="users" size={24} /></span>
        <strong>Шаблон Facebook-груп</strong>
        <small>Назва групи, посилання та необов’язкові позначки публікації.</small>
      </button>
      <button type="button" onClick={() => download('stores')}>
        <span><Icon name="location" size={24} /></span>
        <strong>Шаблон міст і адрес</strong>
        <small>Дві обов’язкові колонки: місто та адреса магазину.</small>
      </button>
    </div>
  </ModalDialog>;
}

function ImportDialog({
  importType,
  onClose,
  onCommitted
}: {
  importType: FacebookPublicationImportType;
  onClose: () => void;
  onCommitted: () => void;
}) {
  const { showToast } = useToast();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<FacebookPublicationWorkbookRows | null>(null);
  const [preview, setPreview] = useState<FacebookPublicationImportPreview | null>(null);
  const [pending, setPending] = useState(false);

  async function selectFile(file?: File) {
    if (!file) return;
    setPending(true);
    setFileName(file.name);
    setPreview(null);
    try {
      const parsed = await readFacebookPublicationWorkbook(file, importType);
      const result = await api.facebookPublications.previewImport(parsed);
      setRows(parsed);
      setPreview(result);
    } catch (error) {
      setRows(null);
      showToast(error instanceof Error ? error.message : 'Не вдалося прочитати XLSX.', 'error');
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    if (!rows) return;
    setPending(true);
    try {
      const result = await api.facebookPublications.commitImport(rows);
      const imported = result[importType];
      showToast(`Імпорт завершено: ${imported.created} створено, ${imported.updated} оновлено.`);
      onCommitted();
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося імпортувати дані.', 'error');
    } finally {
      setPending(false);
    }
  }

  const previewSection = preview?.[importType];
  const errors = (previewSection?.summary.error || 0) + (previewSection?.summary.conflict || 0);
  const isGroupsImport = importType === 'groups';
  const previewRows = previewSection?.rows || [];

  return <ModalDialog
    ariaLabelledBy="facebook-import-title"
    eyebrow="Масове наповнення"
    title={isGroupsImport ? 'Імпорт Facebook-груп' : 'Імпорт міст і адрес'}
    onClose={onClose}
    closeDisabled={pending}
    className="facebook-modal facebook-modal--wide"
    footer={<>
      <button className="button button--secondary" type="button" onClick={onClose}>Закрити</button>
      <button className="button button--primary" type="button" disabled={!rows || !preview || pending} onClick={() => void commit()}>{pending ? 'Обробляємо…' : 'Підтвердити імпорт'}</button>
    </>}
  >
    <div className="facebook-import-actions">
      <button className="button button--secondary" type="button" onClick={isGroupsImport ? downloadFacebookGroupsImportTemplate : downloadFacebookStoresImportTemplate}><Icon name="save" size={17} /> {isGroupsImport ? 'Шаблон груп' : 'Шаблон міст'}</button>
      <label className="button button--primary facebook-file-button"><Icon name="folder" size={17} /> {fileName || 'Вибрати XLSX'}<input type="file" accept=".xlsx,.xls" disabled={pending} onChange={(event) => void selectFile(event.target.files?.[0])} /></label>
    </div>
    <p className="facebook-help">{isGroupsImport ? 'Групи, які вже є в довіднику, та повторні посилання всередині файлу позначаються як дублікати й не імпортуються. Групи не прив’язуються до міст.' : 'Повторний імпорт оновлює адресу за назвою міста.'} Рядки з помилками не імпортуються.</p>
    {pending && <div className="facebook-state">Аналізуємо файл…</div>}
    {preview && <>
      <div className="facebook-import-summary">
        <article><span>{isGroupsImport ? 'Групи' : 'Міста'}</span><strong>{previewSection?.summary.total || 0}</strong><small>{previewSection?.summary.create || 0} нових · {previewSection?.summary.update || 0} оновлень</small></article>
        <article className={errors ? 'has-errors' : ''}><span>{isGroupsImport ? 'Дублікати / помилки' : 'Проблеми'}</span><strong>{errors}</strong><small>Не будуть імпортовані</small></article>
      </div>
      <div className="facebook-import-preview">
        {previewRows.slice(0, 200).map((row) => <div className={`facebook-import-row facebook-import-row--${row.action}`} key={`${importType}-${row.rowNumber}`}>
            <span>{row.rowNumber}</span><strong>{isGroupsImport ? 'Група' : 'Місто'}</strong><p>{'city' in row ? `${row.city} · ${row.address}` : row.name}</p><em>{row.action === 'create' ? 'Створити' : row.action === 'update' ? 'Оновити' : row.reason}</em>
          </div>)}
      </div>
    </>}
  </ModalDialog>;
}

function CampaignEditor({
  groups,
  stores,
  onClose,
  onCreated
}: {
  groups: FacebookPublicationGroup[];
  stores: FacebookPublicationStore[];
  onClose: () => void;
  onCreated: (campaign: FacebookPublicationCampaign) => void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [promotion, setPromotion] = useState('до -15%');
  const [plannedDate, setPlannedDate] = useState(today());
  const [variants, setVariants] = useState([campaignDefaultText]);
  const [image, setImage] = useState<File | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(false);
  const activeStores = stores;
  const visibleGroups = groups.filter((group) => {
    const needle = search.trim().toLocaleLowerCase('uk-UA');
    return !needle || `${group.name} ${group.url}`.toLocaleLowerCase('uk-UA').includes(needle);
  });

  function toggleGroup(group: FacebookPublicationGroup, checked: boolean) {
    setSelections((current) => {
      const next = { ...current };
      if (checked && activeStores[0]) next[group.id] = activeStores[0].id;
      else delete next[group.id];
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!image) return showToast('Додайте картинку або банер кампанії.', 'error');
    if (!Object.keys(selections).length) return showToast('Виберіть хоча б одну Facebook-групу.', 'error');
    if (variants.some((variant) => !variant.trim())) return showToast('Видаліть або заповніть порожні варіанти тексту.', 'error');
    setPending(true);
    try {
      const asset = await api.facebookPublications.uploadAsset(image);
      const campaign = await api.facebookPublications.createCampaign({
        title,
        promotion,
        plannedDate,
        textVariants: variants.map((variant) => variant.trim()),
        assetId: asset.id,
        selections: Object.entries(selections).map(([groupId, storeId]) => ({ groupId, storeId }))
      });
      showToast('Кампанію та чергу публікацій створено.');
      onCreated(campaign);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити кампанію.', 'error');
    } finally {
      setPending(false);
    }
  }

  return <ModalDialog
    ariaLabelledBy="facebook-campaign-editor-title"
    eyebrow="Нова промокампанія"
    title="Підготувати публікації"
    onClose={onClose}
    onSubmit={submit}
    closeDisabled={pending}
    className="facebook-modal facebook-modal--campaign"
    footer={<>
      <span className="facebook-modal-counter">Вибрано груп: <strong>{Object.keys(selections).length}</strong></span>
      <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
      <button className="button button--primary" type="submit" disabled={pending}>{pending ? 'Створюємо…' : 'Створити чергу'}</button>
    </>}
  >
    <div className="facebook-campaign-layout">
      <section className="facebook-campaign-form">
        <label className="field"><span>Назва кампанії</span><input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Літня промокампанія" /></label>
        <div className="facebook-form-grid">
          <label className="field"><span>Акція</span><input maxLength={160} value={promotion} onChange={(event) => setPromotion(event.target.value)} /></label>
          <label className="field"><span>Дата публікації</span><input required type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
        </div>
        <label className="field"><span>Картинка або банер</span><input required type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
        <div className="facebook-variants-heading"><div><span>Варіанти тексту</span><small>Використовуйте {'{{city}}'}, {'{{address}}'} і {'{{promotion}}'}.</small></div><button className="button button--secondary" type="button" disabled={variants.length >= 10} onClick={() => setVariants([...variants, campaignDefaultText])}><Icon name="add" size={16} /> Варіант</button></div>
        <div className="facebook-variant-list">{variants.map((variant, index) => <label className="field" key={index}><span>Варіант {index + 1}</span><textarea required rows={7} maxLength={5000} value={variant} onChange={(event) => setVariants(variants.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{variants.length > 1 && <button className="facebook-text-action" type="button" onClick={() => setVariants(variants.filter((_, itemIndex) => itemIndex !== index))}>Видалити варіант</button>}</label>)}</div>
      </section>
      <section className="facebook-group-picker">
        <header><div><span>Групи та адреси</span><small>Для кожної групи виберіть місто й адресу цієї кампанії.</small></div></header>
        <div className="facebook-group-picker__filters">
          <label><Icon name="search" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук групи" /></label>
        </div>
        <div className="facebook-group-picker__list">{visibleGroups.map((group) => {
          const hardBlocked = group.status !== 'active' || group.advertisingPolicy === 'forbidden';
          const selected = Boolean(selections[group.id]);
          return <article className={`facebook-picker-row${hardBlocked ? ' is-blocked' : ''}`} key={group.id}>
            <label><input type="checkbox" disabled={hardBlocked} checked={selected} onChange={(event) => toggleGroup(group, event.target.checked)} /><span><strong>{group.name}</strong><small>{group.url}</small></span></label>
            <div className="facebook-picker-flags">
              {group.moderationRequired && <span>Модерація</span>}
              {group.advertisingPolicy === 'unknown' && <span>Правила невідомі</span>}
              {isRecentlyPublished(group) && <span>Публікували нещодавно</span>}
              {hardBlocked && <span>{group.advertisingPolicy === 'forbidden' ? 'Реклама заборонена' : 'Неактивна'}</span>}
            </div>
            {selected && <StyledSelect value={selections[group.id]} onChange={(storeId) => setSelections({ ...selections, [group.id]: storeId })} compact searchable ariaLabel={`Місто й адреса для ${group.name}`} options={activeStores.map((store) => ({ value: store.id, label: `${store.city} · ${store.address}` }))} />}
          </article>;
        })}</div>
      </section>
    </div>
  </ModalDialog>;
}

function TargetCard({ target, onChanged }: { target: FacebookPublicationTarget; onChanged: () => void }) {
  const { showToast } = useToast();
  const [renderedText, setRenderedText] = useState(target.renderedText);
  const [status, setStatus] = useState(target.status);
  const [postUrl, setPostUrl] = useState(target.postUrl);
  const [note, setNote] = useState(target.note);
  const [pending, setPending] = useState(false);

  async function copyText() {
    try {
      await copyToClipboard(renderedText);
      void api.facebookPublications.recordActivity(target.id, 'copied');
      showToast('Текст скопійовано.');
    } catch {
      showToast('Не вдалося скопіювати текст.', 'error');
    }
  }

  function openGroup() {
    window.open(target.groupUrl, '_blank', 'noopener,noreferrer');
    void api.facebookPublications.recordActivity(target.id, 'opened');
  }

  function openImage() {
    window.open(target.imageUrl, '_blank', 'noopener,noreferrer');
    void api.facebookPublications.recordActivity(target.id, 'image_opened');
  }

  async function save() {
    setPending(true);
    try {
      await api.facebookPublications.updateTarget(target.id, { renderedText, status, postUrl, note });
      showToast('Результат публікації збережено.');
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти результат.', 'error');
    } finally {
      setPending(false);
    }
  }

  async function retry() {
    setPending(true);
    try {
      await api.facebookPublications.retryTarget(target.id);
      showToast('Створено нову повторну спробу. Відхилений запис залишився в історії.');
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося створити повторну спробу.', 'error');
    } finally {
      setPending(false);
    }
  }

  return <article className={`facebook-target-card facebook-target-card--${target.status}`}>
    <header><div><p>{target.city}</p><h3>{target.groupName}</h3><span>{target.address}</span></div><span className={`facebook-status facebook-status--${target.status}`}>{targetLabels[target.status]}</span></header>
    {target.retryOfTargetId && <p className="facebook-retry-note"><Icon name="refresh" size={16} /> Повторна спроба після відхилення</p>}
    {target.warnings.length > 0 && <div className="facebook-warning-list">{target.warnings.map((warning) => <p key={warning}><Icon name="security" size={16} /> {warning}</p>)}</div>}
    <label className="field"><span>Готовий текст</span><textarea rows={9} maxLength={5000} value={renderedText} onChange={(event) => setRenderedText(event.target.value)} /></label>
    <div className="facebook-target-actions">
      <button className="button button--secondary" type="button" onClick={() => void copyText()}><Icon name="copy" size={17} /> Скопіювати текст</button>
      <button className="button button--secondary" type="button" onClick={openImage}><Icon name="image" size={17} /> Відкрити картинку</button>
      <button className="button button--primary" type="button" onClick={openGroup}><Icon name="openInNew" size={17} /> Відкрити групу</button>
    </div>
    <div className="facebook-target-result">
      <label className="field"><span>Статус</span><StyledSelect<FacebookTargetStatus> value={status} onChange={setStatus} ariaLabel={`Статус ${target.groupName}`} options={targetStatusOptions} /></label>
      <label className="field"><span>Посилання на пост (необовʼязково)</span><input type="url" maxLength={2000} value={postUrl} onChange={(event) => setPostUrl(event.target.value)} /></label>
      <label className="field facebook-target-result__wide"><span>Примітка</span><textarea rows={2} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Причина відхилення або інший результат" /></label>
    </div>
    <footer>
      {target.status === 'rejected' && <button className="button button--secondary" type="button" disabled={pending} onClick={() => void retry()}><Icon name="refresh" size={17} /> Повторити публікацію</button>}
      <button className="button button--primary" type="button" disabled={pending} onClick={() => void save()}>{pending ? 'Зберігаємо…' : 'Зберегти результат'}</button>
    </footer>
  </article>;
}

function CampaignWorkspace({ campaignId, onClose }: { campaignId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const campaign = useQuery({ queryKey: ['facebook-campaign', campaignId], queryFn: () => api.facebookPublications.campaign(campaignId) });
  const risk = useQuery({ queryKey: ['facebook-publication-risk'], queryFn: api.facebookPublications.riskSummary });
  const [filter, setFilter] = useState<'all' | FacebookTargetStatus>('all');
  const targets = (campaign.data?.targets || []).filter((target) => filter === 'all' || target.status === filter);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['facebook-campaign', campaignId] });
    void queryClient.invalidateQueries({ queryKey: ['facebook-campaigns'] });
    void queryClient.invalidateQueries({ queryKey: ['facebook-history'] });
    void queryClient.invalidateQueries({ queryKey: ['facebook-groups'] });
    void queryClient.invalidateQueries({ queryKey: ['facebook-publication-risk'] });
  };

  return <ModalDialog
    ariaLabelledBy="facebook-campaign-workspace-title"
    eyebrow="Ручна публікація"
    title={campaign.data?.title || 'Черга кампанії'}
    onClose={onClose}
    className="facebook-modal facebook-modal--workspace"
    footer={<><span>{campaign.data ? `${campaign.data.counts.published} з ${campaign.data.counts.total} опубліковано` : 'Завантаження…'}</span><button className="button button--primary" type="button" onClick={onClose}>Завершити роботу</button></>}
  >
    {risk.data?.showUrgentWarning && <div className="facebook-risk facebook-risk--urgent"><Icon name="security" size={20} /><div><strong>Надто швидкий темп</strong><span>За останні 5 хвилин зафіксовано {risk.data.lastFiveMinutes} публікацій. Зупиніться та зробіть перерву.</span></div></div>}
    {!risk.data?.showUrgentWarning && risk.data?.showBreakRecommendation && <div className="facebook-risk"><Icon name="alarm" size={20} /><div><strong>Рекомендована перерва</strong><span>Опрацьовано {risk.data.lastFifteenMinutes} груп за 15 хвилин. Рекомендована пауза — {risk.data.recommendedBreakMinutes} хвилин.</span></div></div>}
    <div className="facebook-workspace-toolbar">
      <p>{campaign.data && <>Дата: <strong>{formatDate(campaign.data.plannedDate)}</strong> · Варіантів тексту: <strong>{campaign.data.textVariants.length}</strong></>}</p>
      <StyledSelect value={filter} onChange={setFilter} compact ariaLabel="Фільтр статусу черги" options={[{ value: 'all', label: 'Усі статуси' }, ...targetStatusOptions]} />
    </div>
    {campaign.isLoading && <div className="facebook-state">Завантажуємо чергу…</div>}
    {campaign.isError && <div className="facebook-state facebook-state--error">Не вдалося завантажити кампанію.</div>}
    <div className="facebook-target-list">{targets.map((target) => <TargetCard key={target.id} target={target} onChanged={refresh} />)}</div>
    {!campaign.isLoading && !targets.length && <div className="facebook-state">У цьому статусі публікацій немає.</div>}
  </ModalDialog>;
}

export function FacebookPublicationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<WorkspaceTab>('campaigns');
  const [search, setSearch] = useState('');
  const [editingStore, setEditingStore] = useState<FacebookPublicationStore | null | undefined>(undefined);
  const [editingGroup, setEditingGroup] = useState<FacebookPublicationGroup | null | undefined>(undefined);
  const [importChoiceOpen, setImportChoiceOpen] = useState(false);
  const [templateChoiceOpen, setTemplateChoiceOpen] = useState(false);
  const [importType, setImportType] = useState<FacebookPublicationImportType | null>(null);
  const [campaignEditorOpen, setCampaignEditorOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const stores = useQuery({ queryKey: ['facebook-stores'], queryFn: () => api.facebookPublications.stores() });
  const groups = useQuery({ queryKey: ['facebook-groups'], queryFn: () => api.facebookPublications.groups() });
  const campaigns = useQuery({ queryKey: ['facebook-campaigns'], queryFn: () => api.facebookPublications.campaigns() });
  const history = useQuery({ queryKey: ['facebook-history'], queryFn: () => api.facebookPublications.history(), enabled: tab === 'history' });
  const removeStore = useMutation({ mutationFn: api.facebookPublications.removeStore });
  const removeGroup = useMutation({ mutationFn: api.facebookPublications.removeGroup });

  const refreshDirectories = () => {
    void queryClient.invalidateQueries({ queryKey: ['facebook-stores'] });
    void queryClient.invalidateQueries({ queryKey: ['facebook-groups'] });
  };
  const needle = search.trim().toLocaleLowerCase('uk-UA');
  const visibleStores = (stores.data || []).filter((store) => !needle || `${store.city} ${store.address}`.toLocaleLowerCase('uk-UA').includes(needle));
  const visibleGroups = (groups.data || []).filter((group) => !needle || `${group.name} ${group.url}`.toLocaleLowerCase('uk-UA').includes(needle));
  const visibleCampaigns = (campaigns.data || []).filter((campaign) => !needle || `${campaign.title} ${campaign.promotion}`.toLocaleLowerCase('uk-UA').includes(needle));
  const visibleHistory = (history.data || []).filter((item) => !needle || `${item.campaignTitle} ${item.groupName} ${item.city}`.toLocaleLowerCase('uk-UA').includes(needle));

  async function deleteStore(store: FacebookPublicationStore) {
    if (!await confirm({ title: 'Видалити місто й адресу?', message: 'Видалення можливе, якщо адреса ще не використовується в історії кампаній.', confirmLabel: 'Видалити', tone: 'danger' })) return;
    try {
      await removeStore.mutateAsync(store.id);
      refreshDirectories();
      showToast('Місто й адресу видалено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити місто й адресу.', 'error');
    }
  }

  async function deleteGroup(group: FacebookPublicationGroup) {
    if (!await confirm({ title: 'Видалити Facebook-групу?', message: 'Групу з історією публікацій потрібно не видаляти, а позначити «Не публікувати».', confirmLabel: 'Видалити', tone: 'danger' })) return;
    try {
      await removeGroup.mutateAsync(group.id);
      refreshDirectories();
      showToast('Facebook-групу видалено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити групу.', 'error');
    }
  }

  return <div className="facebook-publications-page">
    <header className="page-heading facebook-page-heading">
      <div><p className="eyebrow">Ручний workflow</p><h1>Публікації у міські Facebook-групи</h1><p>Готуйте локалізовані промопости, відкривайте групи вручну та фіксуйте результати без автопостингу.</p></div>
      <div className="facebook-heading-actions">
        {isAdmin && <button className="button button--secondary" type="button" onClick={() => setTemplateChoiceOpen(true)}><Icon name="save" size={18} /> Шаблони XLSX</button>}
        {isAdmin && <button className="button button--secondary" type="button" onClick={() => setImportChoiceOpen(true)}><Icon name="upload" size={18} /> Імпорт XLSX</button>}
        <button className="button button--primary" type="button" disabled={!groups.data?.length || !stores.data?.length} onClick={() => setCampaignEditorOpen(true)}><Icon name="add" size={18} /> Нова кампанія</button>
      </div>
    </header>

    <div className="facebook-principle"><Icon name="security" size={20} /><div><strong>Фінальна публікація завжди ручна</strong><span>Інструмент не входить у Facebook, не натискає «Опублікувати» та не обходить обмеження платформи.</span></div></div>

    <nav className="facebook-tabs" aria-label="Розділи Facebook-публікацій">
      {([
        ['campaigns', 'publication', 'Кампанії', campaigns.data?.length || 0],
        ['groups', 'users', 'Facebook-групи', groups.data?.length || 0],
        ['stores', 'location', 'Міста й адреси', stores.data?.length || 0],
        ['history', 'history', 'Історія', null]
      ] as const).map(([value, icon, label, count]) => <button className={tab === value ? 'active' : ''} type="button" key={value} onClick={() => { setTab(value); setSearch(''); }}><Icon name={icon} size={18} /> {label}{count !== null && <span>{count}</span>}</button>)}
    </nav>

    <section className="facebook-section">
      <header className="facebook-section-heading">
        <div><p className="eyebrow">{tab === 'campaigns' ? 'План і виконання' : tab === 'groups' ? 'Довідник аудиторій' : tab === 'stores' ? 'Джерело адрес' : 'Журнал спроб'}</p><h2>{tab === 'campaigns' ? 'Промокампанії' : tab === 'groups' ? 'Facebook-групи' : tab === 'stores' ? 'Міста й адреси Mobile Trend' : 'Історія публікацій'}</h2></div>
        <div className="facebook-section-actions">
          <label className="facebook-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук" /></label>
          {tab === 'groups' && <button className="button button--secondary" type="button" disabled={groups.isLoading} onClick={() => downloadFacebookGroupsExport(groups.data || [])}><Icon name="save" size={17} /> Експорт груп</button>}
          {tab === 'stores' && <button className="button button--secondary" type="button" disabled={stores.isLoading} onClick={() => downloadFacebookStoresExport(stores.data || [])}><Icon name="save" size={17} /> Експорт міст</button>}
          {isAdmin && tab === 'groups' && <button className="button button--secondary" type="button" onClick={() => setImportType('groups')}><Icon name="upload" size={17} /> Імпорт груп</button>}
          {isAdmin && tab === 'stores' && <button className="button button--secondary" type="button" onClick={() => setImportType('stores')}><Icon name="upload" size={17} /> Імпорт міст</button>}
          {isAdmin && tab === 'groups' && <button className="button button--primary" type="button" onClick={() => setEditingGroup(null)}><Icon name="add" size={17} /> Додати групу</button>}
          {isAdmin && tab === 'stores' && <button className="button button--primary" type="button" onClick={() => setEditingStore(null)}><Icon name="add" size={17} /> Додати місто</button>}
        </div>
      </header>

      {tab === 'campaigns' && <div className="facebook-campaign-grid">
        {visibleCampaigns.map((campaign) => <article className="facebook-campaign-card" key={campaign.id}>
          <header><div><p>{formatDate(campaign.plannedDate)}</p><h3>{campaign.title}</h3><span>{campaign.promotion || 'Без назви акції'}</span></div>{campaign.asset && <img src={campaign.asset.url} alt="" />}</header>
          <div className="facebook-campaign-progress"><span style={{ width: `${campaign.counts.total ? ((campaign.counts.published + campaign.counts.pending_moderation) / campaign.counts.total) * 100 : 0}%` }} /></div>
          <div className="facebook-campaign-counts"><span><strong>{campaign.counts.total}</strong> груп</span><span><strong>{campaign.counts.published}</strong> опубліковано</span><span><strong>{campaign.counts.pending_moderation}</strong> на модерації</span><span><strong>{campaign.counts.rejected}</strong> відхилено</span></div>
          <footer><span>Створив: {campaign.createdBy?.name || '—'}</span><button className="button button--primary" type="button" onClick={() => setWorkspaceId(campaign.id)}>Відкрити чергу <Icon name="arrowRight" size={17} /></button></footer>
        </article>)}
        {!campaigns.isLoading && !visibleCampaigns.length && <div className="facebook-empty"><Icon name="publication" size={32} /><strong>Кампаній ще немає</strong><span>Створіть першу кампанію та виберіть групи для ручної публікації.</span></div>}
      </div>}

      {tab === 'groups' && <div className="facebook-directory-list">
        {visibleGroups.map((group) => <article className="facebook-directory-row" key={group.id}>
          <div className="facebook-directory-row__icon"><Icon name="users" size={20} /></div>
          <div className="facebook-directory-row__main"><div><strong>{group.name}</strong><span className={`facebook-policy facebook-policy--${group.advertisingPolicy}`}>{group.advertisingPolicy === 'allowed' ? 'Реклама дозволена' : group.advertisingPolicy === 'forbidden' ? 'Реклама заборонена' : 'Правила невідомі'}</span><span className={`facebook-policy facebook-policy--${group.status}`}>{group.status === 'active' ? 'Активна' : group.status === 'inactive' ? 'Неактивна' : 'Не публікувати'}</span></div><p>{group.url}</p><small>Остання публікація: {formatDate(group.lastPublishedAt, true)}{group.moderationRequired ? ' · Після модерації' : ''}</small></div>
          <div className="facebook-directory-row__actions"><a className="icon-button" href={group.url} target="_blank" rel="noreferrer" aria-label={`Відкрити ${group.name}`}><Icon name="openInNew" size={18} /></a>{isAdmin && <><button className="icon-button" type="button" onClick={() => setEditingGroup(group)} aria-label={`Редагувати ${group.name}`}><Icon name="edit" size={18} /></button><button className="icon-button" type="button" onClick={() => void deleteGroup(group)} aria-label={`Видалити ${group.name}`}><Icon name="delete" size={18} /></button></>}</div>
        </article>)}
        {!groups.isLoading && !visibleGroups.length && <div className="facebook-empty"><strong>Груп не знайдено</strong><span>Додайте групу вручну або імпортуйте XLSX.</span></div>}
      </div>}

      {tab === 'stores' && <div className="facebook-directory-list">
        {visibleStores.map((store) => <article className="facebook-directory-row" key={store.id}>
          <div className="facebook-directory-row__icon"><Icon name="location" size={20} /></div>
          <div className="facebook-directory-row__main"><div><strong>{store.city}</strong></div><p>{store.address}</p></div>
          {isAdmin && <div className="facebook-directory-row__actions"><button className="icon-button" type="button" onClick={() => setEditingStore(store)} aria-label={`Редагувати ${store.city}`}><Icon name="edit" size={18} /></button><button className="icon-button" type="button" onClick={() => void deleteStore(store)} aria-label={`Видалити ${store.city}`}><Icon name="delete" size={18} /></button></div>}
        </article>)}
        {!stores.isLoading && !visibleStores.length && <div className="facebook-empty"><strong>Міст і адрес не знайдено</strong><span>Додайте місто вручну або імпортуйте XLSX.</span></div>}
      </div>}

      {tab === 'history' && <div className="facebook-history-list">
        {visibleHistory.map((item) => <article key={item.id}><span className={`facebook-status facebook-status--${item.status}`}>{targetLabels[item.status]}</span><div><strong>{item.groupName}</strong><p>{item.campaignTitle} · {item.city} · {item.address}</p><small>{formatDate(item.publishedAt || item.updatedAt, true)}{item.retryOfTargetId ? ' · Повторна спроба' : ''}{item.note ? ` · ${item.note}` : ''}</small></div>{item.postUrl && <a className="button button--secondary" href={item.postUrl} target="_blank" rel="noreferrer">Відкрити пост <Icon name="openInNew" size={16} /></a>}</article>)}
        {history.isLoading && <div className="facebook-state">Завантажуємо історію…</div>}
        {!history.isLoading && !visibleHistory.length && <div className="facebook-empty"><strong>Історія порожня</strong><span>Тут з’являться всі спроби, включно з відхиленими та повторними.</span></div>}
      </div>}
    </section>

    {editingStore !== undefined && <StoreEditor store={editingStore} onClose={() => setEditingStore(undefined)} onSaved={refreshDirectories} />}
    {editingGroup !== undefined && <GroupEditor group={editingGroup} onClose={() => setEditingGroup(undefined)} onSaved={refreshDirectories} />}
    {templateChoiceOpen && <TemplateChoiceDialog onClose={() => setTemplateChoiceOpen(false)} />}
    {importChoiceOpen && <ImportChoiceDialog onClose={() => setImportChoiceOpen(false)} onSelect={(type) => { setImportChoiceOpen(false); setImportType(type); }} />}
    {importType && <ImportDialog importType={importType} onClose={() => setImportType(null)} onCommitted={refreshDirectories} />}
    {campaignEditorOpen && <CampaignEditor groups={groups.data || []} stores={stores.data || []} onClose={() => setCampaignEditorOpen(false)} onCreated={(campaign) => { setCampaignEditorOpen(false); void queryClient.invalidateQueries({ queryKey: ['facebook-campaigns'] }); setWorkspaceId(campaign.id); }} />}
    {workspaceId && <CampaignWorkspace campaignId={workspaceId} onClose={() => setWorkspaceId(null)} />}
  </div>;
}
