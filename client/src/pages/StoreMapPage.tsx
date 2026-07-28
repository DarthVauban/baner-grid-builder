import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { api } from '../lib/api';
import { useToast } from '../toast/ToastContext';
import type {
  StoreMapImportPreview,
  StoreMapPoint,
  StoreMapPointInput,
  StoreMapPublicationStatus,
  StoreMapSettings
} from '../types/store-map';
import '../styles/store-map-admin.css';

type PointDraft = Omit<StoreMapPointInput, 'latitude' | 'longitude'> & {
  latitude: string;
  longitude: string;
};

const emptyPoint: PointDraft = {
  externalId: '',
  name: '',
  city: '',
  address: '',
  hoursText: '08:00 - 19:30',
  publicationStatus: 'ACTIVE',
  openStatusOverride: 'AUTO',
  latitude: '',
  longitude: ''
};

function pointToDraft(point: StoreMapPoint): PointDraft {
  return {
    externalId: point.externalId,
    name: point.name,
    city: point.city,
    address: point.address,
    hoursText: point.hoursText,
    publicationStatus: point.publicationStatus,
    openStatusOverride: point.openStatusOverride,
    latitude: String(point.latitude),
    longitude: String(point.longitude)
  };
}

function PointEditor({
  point,
  onClose,
  onSaved
}: {
  point: StoreMapPoint | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState<PointDraft>(() => point ? pointToDraft(point) : emptyPoint);
  const save = useMutation({
    mutationFn: (input: StoreMapPointInput) => point
      ? api.storeMap.updatePoint(point.id, input)
      : api.storeMap.createPoint(input)
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latitude = Number(draft.latitude);
    const longitude = Number(draft.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      showToast('Вкажіть коректні координати.', 'error');
      return;
    }
    try {
      await save.mutateAsync({ ...draft, latitude, longitude });
      await onSaved();
      showToast(point ? 'Торгову точку оновлено.' : 'Торгову точку додано.');
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти торгову точку.', 'error');
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal store-map-point-modal" role="dialog" aria-modal="true" aria-labelledby="store-map-point-title">
      <header className="modal__header">
        <div>
          <p className="eyebrow">Мапа магазинів</p>
          <h2 id="store-map-point-title">{point ? 'Редагування ТТ' : 'Нова торгова точка'}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>
      <form className="store-map-point-form" onSubmit={submit}>
        <div className="store-map-form-grid">
          <label className="field store-map-field--wide">
            <span>Назва магазину</span>
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={240} />
          </label>
          <label className="field">
            <span>Місто</span>
            <input value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} required maxLength={120} />
          </label>
          <label className="field">
            <span>ID із зовнішньої системи</span>
            <input value={draft.externalId} onChange={(event) => setDraft({ ...draft, externalId: event.target.value })} maxLength={120} />
          </label>
          <label className="field store-map-field--wide">
            <span>Адреса</span>
            <input value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} required maxLength={500} />
          </label>
          <label className="field">
            <span>Час роботи</span>
            <input value={draft.hoursText} onChange={(event) => setDraft({ ...draft, hoursText: event.target.value })} placeholder="08:00 - 19:30" maxLength={120} />
          </label>
          <label className="field">
            <span>Публікація</span>
            <select value={draft.publicationStatus} onChange={(event) => setDraft({ ...draft, publicationStatus: event.target.value as StoreMapPublicationStatus })}>
              <option value="ACTIVE">Активна</option>
              <option value="HIDDEN">Прихована</option>
            </select>
          </label>
          <label className="field">
            <span>Статус відкриття</span>
            <select value={draft.openStatusOverride} onChange={(event) => setDraft({ ...draft, openStatusOverride: event.target.value as PointDraft['openStatusOverride'] })}>
              <option value="AUTO">За графіком</option>
              <option value="OPEN">Примусово відкрита</option>
              <option value="CLOSED">Примусово закрита</option>
            </select>
          </label>
          <span />
          <label className="field">
            <span>Широта</span>
            <input type="number" step="any" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} required />
          </label>
          <label className="field">
            <span>Довгота</span>
            <input type="number" step="any" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} required />
          </label>
        </div>
        <footer className="modal__footer">
          <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
          <button className="button button--primary" type="submit" disabled={save.isPending}>
            {save.isPending ? 'Зберігаємо…' : 'Зберегти'}
          </button>
        </footer>
      </form>
    </section>
  </div>;
}

function ImportDialog({
  onClose,
  onCommitted
}: {
  onClose: () => void;
  onCommitted: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<StoreMapImportPreview | null>(null);
  const [importNew, setImportNew] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const previewMutation = useMutation({ mutationFn: api.storeMap.previewImport });
  const commitMutation = useMutation({
    mutationFn: () => api.storeMap.commitImport(rows, { importNew, updateExisting })
  });

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('XLSX-файл має бути меншим за 10 МБ.', 'error');
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheetName = workbook.SheetNames.includes('Магазини') ? 'Магазини' : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const parsed = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
      if (!parsed.length) throw new Error('У файлі немає рядків для імпорту.');
      setRows(parsed);
      setFileName(file.name);
      setPreview(await previewMutation.mutateAsync(parsed));
    } catch (error) {
      setRows([]);
      setPreview(null);
      showToast(error instanceof Error ? error.message : 'Не вдалося прочитати XLSX.', 'error');
    }
  }

  async function commit() {
    try {
      const result = await commitMutation.mutateAsync();
      await onCommitted();
      showToast(`Імпорт завершено: створено ${result.summary.created || 0}, оновлено ${result.summary.updated || 0}.`);
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося виконати імпорт.', 'error');
    }
  }

  const hasReadyRows = Boolean((preview?.summary.create || 0) + (preview?.summary.update || 0));

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal store-map-import-modal" role="dialog" aria-modal="true" aria-labelledby="store-map-import-title">
      <header className="modal__header">
        <div><p className="eyebrow">Масове додавання</p><h2 id="store-map-import-title">Імпорт торгових точок</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Закрити"><Icon name="close" /></button>
      </header>
      <div className="store-map-import-content">
        <label className="store-map-dropzone">
          <Icon name="upload" size={28} />
          <span><strong>{fileName || 'Оберіть XLSX-файл'}</strong><small>Аркуш «Магазини» або перший аркуш файлу</small></span>
          <input type="file" accept=".xlsx,.xls" onChange={(event) => void chooseFile(event.target.files?.[0])} />
        </label>

        {previewMutation.isPending && <div className="store-map-state">Перевіряємо дані…</div>}
        {preview && <>
          <div className="store-map-import-summary">
            <span><strong>{preview.summary.total}</strong> рядків</span>
            <span className="store-map-summary--create"><strong>{preview.summary.create || 0}</strong> нових</span>
            <span className="store-map-summary--update"><strong>{preview.summary.update || 0}</strong> оновлень</span>
            <span className="store-map-summary--error"><strong>{(preview.summary.error || 0) + (preview.summary.conflict || 0)}</strong> проблем</span>
          </div>
          <div className="store-map-import-options">
            <label><input type="checkbox" checked={importNew} onChange={(event) => setImportNew(event.target.checked)} /> Додавати нові ТТ</label>
            <label><input type="checkbox" checked={updateExisting} onChange={(event) => setUpdateExisting(event.target.checked)} /> Оновлювати наявні ТТ</label>
          </div>
          <div className="store-map-import-table-wrap">
            <table className="store-map-import-table">
              <thead><tr><th>Рядок</th><th>Назва</th><th>Місто</th><th>Координати</th><th>Результат</th></tr></thead>
              <tbody>
                {preview.rows.map((row) => <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td><strong>{row.name || '—'}</strong><small>{row.address}</small></td>
                  <td>{row.city || '—'}</td>
                  <td>{row.latitude === null ? '—' : `${row.latitude}, ${row.longitude}`}</td>
                  <td><span className={`store-map-import-result store-map-import-result--${row.action}`}>{row.action}</span>{row.reason && <small>{row.reason}</small>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </>}
      </div>
      <footer className="modal__footer">
        <button className="button button--secondary" type="button" onClick={onClose}>Скасувати</button>
        <button className="button button--primary" type="button" disabled={!preview || !hasReadyRows || commitMutation.isPending} onClick={() => void commit()}>
          {commitMutation.isPending ? 'Імпортуємо…' : 'Підтвердити імпорт'}
        </button>
      </footer>
    </section>
  </div>;
}

function WidgetSettings({ settings }: { settings: StoreMapSettings }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(settings);
  const save = useMutation({
    mutationFn: () => api.storeMap.updateSettings({
      title: draft.title,
      markerSvg: draft.markerSvg,
      markerWidth: draft.markerWidth,
      markerHeight: draft.markerHeight,
      markerAnchorX: draft.markerAnchorX,
      markerAnchorY: draft.markerAnchorY,
      centerLatitude: draft.centerLatitude,
      centerLongitude: draft.centerLongitude,
      defaultZoom: draft.defaultZoom
    })
  });

  useEffect(() => setDraft(settings), [settings]);

  const embedCode = `<div id="mt-store-map"></div>
<script src="${window.location.origin}/api/public/store-map/embed.js" data-container="mt-store-map" data-height="680" async></script>`;

  async function saveSettings() {
    try {
      await save.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ['store-map-settings'] });
      showToast('Налаштування віджета збережено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося зберегти налаштування.', 'error');
    }
  }

  async function readMarker(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.svg')) {
      showToast('Оберіть SVG-файл.', 'error');
      return;
    }
    if (file.size > 150_000) {
      showToast('SVG-мітка має бути меншою за 150 КБ.', 'error');
      return;
    }
    setDraft({ ...draft, markerSvg: await file.text() });
  }

  async function copyEmbed() {
    await navigator.clipboard.writeText(embedCode);
    showToast('Код вбудовування скопійовано.');
  }

  return <section className="store-map-settings-card">
    <div className="store-map-section-heading">
      <div><p className="eyebrow">Публічний модуль</p><h2>Віджет і кастомна мітка</h2><p>Налаштуйте вигляд мітки та скопіюйте готовий код для сторінки сайту.</p></div>
      <a className="button button--secondary" href="/store-map/widget" target="_blank" rel="noreferrer"><Icon name="openInNew" size={18} /> Відкрити віджет</a>
    </div>
    <div className="store-map-settings-grid">
      <div className="store-map-marker-settings">
        <label className="field">
          <span>Заголовок</span>
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label className="store-map-marker-upload">
          <span className="store-map-marker-preview">
            {draft.markerSvg
              ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(draft.markerSvg)}`} alt="Попередній перегляд мітки" />
              : <Icon name="location" size={34} />}
          </span>
          <span><strong>Завантажити SVG-мітку</strong><small>До 150 КБ, без скриптів і зовнішніх ресурсів</small></span>
          <input type="file" accept=".svg,image/svg+xml" onChange={(event) => void readMarker(event.target.files?.[0])} />
        </label>
        {draft.markerSvg && <button className="button button--secondary button--small" type="button" onClick={() => setDraft({ ...draft, markerSvg: '' })}>Повернути стандартну мітку</button>}
        <div className="store-map-marker-dimensions">
          <label className="field"><span>Ширина</span><input type="number" min={16} max={160} value={draft.markerWidth} onChange={(event) => setDraft({ ...draft, markerWidth: Number(event.target.value) })} /></label>
          <label className="field"><span>Висота</span><input type="number" min={16} max={180} value={draft.markerHeight} onChange={(event) => setDraft({ ...draft, markerHeight: Number(event.target.value) })} /></label>
          <label className="field"><span>Anchor X</span><input type="number" min={0} max={draft.markerWidth} value={draft.markerAnchorX} onChange={(event) => setDraft({ ...draft, markerAnchorX: Number(event.target.value) })} /></label>
          <label className="field"><span>Anchor Y</span><input type="number" min={0} max={draft.markerHeight} value={draft.markerAnchorY} onChange={(event) => setDraft({ ...draft, markerAnchorY: Number(event.target.value) })} /></label>
        </div>
        <button className="button button--primary" type="button" disabled={save.isPending} onClick={() => void saveSettings()}>{save.isPending ? 'Зберігаємо…' : 'Зберегти налаштування'}</button>
      </div>
      <div className="store-map-embed-panel">
        <div><strong>Код для вставки</strong><small>Скрипт автоматично створить адаптивний iframe.</small></div>
        <pre><code>{embedCode}</code></pre>
        <button className="button button--secondary" type="button" onClick={() => void copyEmbed()}><Icon name="copy" size={18} /> Копіювати код</button>
      </div>
    </div>
  </section>;
}

export function StoreMapPage() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | StoreMapPublicationStatus>('ALL');
  const [editingPoint, setEditingPoint] = useState<StoreMapPoint | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const points = useQuery({ queryKey: ['store-map-points'], queryFn: () => api.storeMap.points() });
  const settings = useQuery({ queryKey: ['store-map-settings'], queryFn: api.storeMap.settings });
  const remove = useMutation({ mutationFn: api.storeMap.removePoint });

  const visiblePoints = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('uk-UA');
    return (points.data || []).filter((point) => (
      (status === 'ALL' || point.publicationStatus === status)
      && (!needle || `${point.name} ${point.city} ${point.address}`.toLocaleLowerCase('uk-UA').includes(needle))
    ));
  }, [points.data, search, status]);

  const refreshPoints = () => queryClient.invalidateQueries({ queryKey: ['store-map-points'] });

  async function removePoint(point: StoreMapPoint) {
    if (!await confirm({
      title: 'Видалити торгову точку?',
      message: `${point.name} буде прибрано з бази та публічної карти.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    })) return;
    try {
      await remove.mutateAsync(point.id);
      await refreshPoints();
      showToast('Торгову точку видалено.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не вдалося видалити торгову точку.', 'error');
    }
  }

  return <div className="store-map-admin-page">
    <header className="page-heading store-map-page-heading">
      <div>
        <p className="eyebrow">Окремий інструмент</p>
        <h1>Мапа магазинів</h1>
        <p>Керуйте торговими точками, імпортуйте XLSX і налаштовуйте публічний віджет для сайту.</p>
      </div>
      <div className="store-map-heading-actions">
        <button className="button button--secondary" type="button" onClick={() => setImportOpen(true)}><Icon name="upload" size={18} /> Імпортувати XLSX</button>
        <button className="button button--primary" type="button" onClick={() => setEditingPoint(null)}><Icon name="add" size={18} /> Додати ТТ</button>
      </div>
    </header>

    <section className="store-map-stats" aria-label="Статистика торгових точок">
      <article><span>Усього</span><strong>{points.data?.length || 0}</strong></article>
      <article><span>Активні</span><strong>{points.data?.filter((point) => point.publicationStatus === 'ACTIVE').length || 0}</strong></article>
      <article><span>Приховані</span><strong>{points.data?.filter((point) => point.publicationStatus === 'HIDDEN').length || 0}</strong></article>
      <article><span>Міста</span><strong>{new Set(points.data?.map((point) => point.city)).size || 0}</strong></article>
    </section>

    <section className="store-map-points-card">
      <div className="store-map-section-heading">
        <div><p className="eyebrow">База ТТ</p><h2>Торгові точки</h2></div>
        <div className="store-map-list-filters">
          <label className="store-map-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук за назвою, містом або адресою" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="ALL">Усі статуси</option>
            <option value="ACTIVE">Активні</option>
            <option value="HIDDEN">Приховані</option>
          </select>
        </div>
      </div>
      {points.isLoading && <div className="store-map-state">Завантажуємо торгові точки…</div>}
      {points.isError && <div className="store-map-state store-map-state--error">Не вдалося завантажити торгові точки.</div>}
      {!points.isLoading && !visiblePoints.length && <div className="store-map-state">За поточними фільтрами торгових точок немає.</div>}
      {visiblePoints.length > 0 && <div className="store-map-points-list">
        {visiblePoints.map((point) => <article className="store-map-point-row" key={point.id}>
          <span className="store-map-point-row__pin"><Icon name="location" size={20} /></span>
          <div className="store-map-point-row__main">
            <div><strong>{point.name}</strong><span className={`store-map-publication-badge store-map-publication-badge--${point.publicationStatus.toLowerCase()}`}>{point.publicationStatus === 'ACTIVE' ? 'Активна' : 'Прихована'}</span></div>
            <p>{point.city} · {point.address}</p>
            <small>{point.hoursText || 'Графік не вказано'} · {point.latitude}, {point.longitude}</small>
          </div>
          <div className="store-map-point-row__actions">
            <button className="icon-button" type="button" onClick={() => setEditingPoint(point)} aria-label={`Редагувати ${point.name}`}><Icon name="edit" size={18} /></button>
            <button className="icon-button store-map-delete-button" type="button" onClick={() => void removePoint(point)} aria-label={`Видалити ${point.name}`}><Icon name="delete" size={18} /></button>
          </div>
        </article>)}
      </div>}
    </section>

    {settings.data && <WidgetSettings settings={settings.data} />}
    {settings.isLoading && <div className="store-map-state">Завантажуємо налаштування віджета…</div>}

    {editingPoint !== undefined && <PointEditor point={editingPoint} onClose={() => setEditingPoint(undefined)} onSaved={refreshPoints} />}
    {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onCommitted={refreshPoints} />}
  </div>;
}
