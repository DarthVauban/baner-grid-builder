import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/banner-generator';
import { Icon } from '../components/Icon';
import { useConfirmDialog } from '../dialogs/ConfirmDialogContext';
import { useToast } from '../toast/ToastContext';
import type { ProductTableData, ProductTableRecord, ProductTableRow, ProductTableSheet } from '../types/workspace';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
export const STATUS_COLUMN_WIDTH = 88;
export const getPinnedColumnLeft = (index: number) => `${index * STATUS_COLUMN_WIDTH}px`;
const text = (value: unknown) => value == null ? '' : String(value).trim();

export function normalizeSheet(name: string, matrix: unknown[][]): ProductTableSheet {
  const columnCount = Math.max(1, ...matrix.map((row) => row.length));
  const first = matrix[0] || [];
  const headers = Array.from({ length: columnCount }, (_, index) => text(first[index]) || (index === 0 ? 'Назва товару' : `Характеристика ${index}`));
  const rows = matrix.slice(1).map((row, index) => ({
    sourceIndex: index + 1,
    values: Array.from({ length: columnCount }, (_, column) => text(row[column])),
    completed: false,
    uploaded: false
  })).filter((row) => row.values.some(Boolean));
  return { name, headers, showCompletedStatus: false, showUploadedStatus: false, rows };
}

function normalizeWorkbook(workbook: XLSX.WorkBook, names: string[]): ProductTableData {
  const sheets = names.map((name) => normalizeSheet(name, XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false })));
  return { activeSheet: sheets[0]?.name || '', sheets };
}

function CopyButton({ value, label, onCopied }: { value: string; label: string; onCopied: () => void }) {
  return <button className="sheet-copy" type="button" disabled={!value} title={label} aria-label={label} onClick={() => void copyToClipboard(value).then(onCopied)}><Icon name="copy" size={15} /></button>;
}

export function ProductTablesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const confirm = useConfirmDialog();
  const toolRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'editor' | 'library'>('editor');
  const [data, setData] = useState<ProductTableData | null>(null);
  const [name, setName] = useState('');
  const [fileName, setFileName] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showHeaderCopyButtons, setShowHeaderCopyButtons] = useState(() => localStorage.getItem('mt-table-header-copy') !== 'false');
  const [importState, setImportState] = useState<{ workbook: XLSX.WorkBook; file: File; selected: string[] } | null>(null);
  const library = useQuery({ queryKey: ['product-tables', search], queryFn: () => api.productTables.list(search.trim()) });
  const activeSheet = data?.sheets.find((sheet) => sheet.name === data.activeSheet) || data?.sheets[0] || null;
  const statuses = useMemo(() => [
    ...(activeSheet?.showUploadedStatus ? [{ field: 'uploaded' as const, label: 'Вивантажено' }] : []),
    ...(activeSheet?.showCompletedStatus ? [{ field: 'completed' as const, label: 'Заповнено' }] : [])
  ], [activeSheet]);

  useEffect(() => {
    const handler = () => setFullscreen(document.fullscreenElement === toolRef.current);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  function replaceSheet(next: ProductTableSheet) {
    setData((current) => current ? { ...current, activeSheet: next.name, sheets: current.sheets.map((sheet) => sheet.name === next.name ? next : sheet) } : current);
    setDirty(true);
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) return showToast('Потрібен файл у форматі XLSX.', 'error');
    if (file.size > MAX_FILE_SIZE) return showToast('Файл завеликий. Максимальний розмір — 20 МБ.', 'error');
    setPending(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      if (!workbook.SheetNames.length) throw new Error('У файлі немає аркушів.');
      setImportState({ workbook, file, selected: [...workbook.SheetNames] });
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося прочитати XLSX-файл.', 'error'); }
    finally { setPending(false); }
  }

  function confirmImport() {
    if (!importState?.selected.length) return;
    const table = normalizeWorkbook(importState.workbook, importState.selected);
    setData(table); setName(importState.file.name.replace(/\.xlsx$/i, '')); setFileName(importState.file.name); setSavedId(null); setDirty(true); setImportState(null); setView('editor'); showToast(`Імпортовано аркушів: ${table.sheets.length}.`);
  }

  async function reset(force = false) {
    if (!force && dirty) {
      const confirmed = await confirm({
        title: 'Створити нову таблицю?',
        message: 'Незбережені зміни буде втрачено.',
        confirmLabel: 'Створити нову'
      });
      if (!confirmed) return;
    }
    setData(null); setName(''); setFileName(''); setSavedId(null); setDirty(false); setView('editor');
  }

  async function save() {
    if (!data) return;
    if (!name.trim()) return showToast('Вкажіть назву таблиці.', 'error');
    setPending(true);
    try {
      const input = { name: name.trim(), fileName, data };
      const record = savedId ? await api.productTables.update(savedId, input) : await api.productTables.create(input);
      setSavedId(record.id); setFileName(record.fileName); setDirty(false); showToast('Таблицю збережено.');
      await queryClient.invalidateQueries({ queryKey: ['product-tables'] });
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося зберегти таблицю.', 'error'); }
    finally { setPending(false); }
  }

  async function open(record: ProductTableRecord) {
    if (dirty) {
      const confirmed = await confirm({
        title: 'Відкрити іншу таблицю?',
        message: 'Незбережені зміни у поточній таблиці буде втрачено.',
        confirmLabel: 'Відкрити'
      });
      if (!confirmed) return;
    }
    setPending(true);
    try {
      const loaded = await api.productTables.get(record.id);
      if (!loaded.data?.sheets.length) throw new Error('Збережена таблиця не містить аркушів.');
      setData(loaded.data); setFileName(loaded.fileName); setSavedId(loaded.isOwner ? loaded.id : null); setName(loaded.isOwner ? loaded.name : `Копія — ${loaded.name}`); setDirty(!loaded.isOwner); setView('editor'); showToast(loaded.isOwner ? 'Таблицю відкрито.' : 'Таблицю відкрито як нову копію.');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося відкрити таблицю.', 'error'); }
    finally { setPending(false); }
  }

  async function remove(record: ProductTableRecord) {
    const confirmed = await confirm({
      title: 'Видалити таблицю?',
      message: `Таблицю «${record.name}» буде видалено.`,
      confirmLabel: 'Видалити',
      tone: 'danger'
    });
    if (!confirmed) return;
    setPending(true);
    try { await api.productTables.remove(record.id); if (savedId === record.id) await reset(true); await queryClient.invalidateQueries({ queryKey: ['product-tables'] }); showToast('Таблицю видалено.'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'Не вдалося видалити таблицю.', 'error'); }
    finally { setPending(false); }
  }

  async function toggleStatus(field: 'completed' | 'uploaded') {
    if (!activeSheet) return;
    const visibility = field === 'completed' ? 'showCompletedStatus' : 'showUploadedStatus';
    const showing = activeSheet[visibility];
    if (showing && activeSheet.rows.some((row) => row[field])) {
      const confirmed = await confirm({
        title: 'Прибрати колонку?',
        message: 'У колонці є позначені товари. Позначки буде очищено.',
        confirmLabel: 'Прибрати колонку',
        tone: 'danger'
      });
      if (!confirmed) return;
    }
    replaceSheet({ ...activeSheet, [visibility]: !showing, rows: activeSheet.rows.map((row) => ({ ...row, [field]: showing ? false : row[field] })) });
  }

  function setRowStatus(row: ProductTableRow, field: 'completed' | 'uploaded', checked: boolean) {
    if (!activeSheet) return;
    replaceSheet({ ...activeSheet, rows: activeSheet.rows.map((item) => item.sourceIndex === row.sourceIndex ? { ...item, [field]: checked } : item) });
  }

  function toggleHeaderCopyButtons() {
    setShowHeaderCopyButtons((showing) => {
      const next = !showing;
      localStorage.setItem('mt-table-header-copy', String(next));
      return next;
    });
  }

  async function toggleFullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await toolRef.current?.requestFullscreen(); }
    catch { setFullscreen((value) => !value); }
  }

  return (
    <div className={`tool-page sheet-page${fullscreen ? ' sheet-page--fullscreen' : ''}`} ref={toolRef}>
      <header className="page-heading page-heading--row">
        <div>
          <p className="eyebrow">Робота з Excel</p>
          <h1>Таблиці товарів</h1>
          <p>Імпортуйте XLSX, копіюйте характеристики та позначайте готові й вивантажені товари.</p>
        </div>
        <div className="segmented">
          <button className={view === 'editor' ? 'active' : ''} onClick={() => setView('editor')}>Редактор</button>
          <button className={view === 'library' ? 'active' : ''} onClick={() => setView('library')}>Збережені <span>{library.data?.length || 0}</span></button>
        </div>
      </header>

      {view === 'library' ? (
        <section className="tool-panel">
          <div className="library-toolbar">
            <label className="task-search"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Пошук таблиць" /></label>
            <span>{library.data?.length || 0} таблиць</span>
          </div>
          <div className="table-library">
            {library.isLoading && <div className="admin-list-state">Завантажуємо таблиці…</div>}
            {!library.isLoading && !library.data?.length && <div className="admin-list-state">Збережених таблиць не знайдено.</div>}
            {library.data?.map((record) => (
              <article className="table-library-card" key={record.id} title="Відкрити подвійним кліком" onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest('button')) void open(record); }}>
                <div><h2>{record.name}</h2><p>{record.fileName || 'Без вихідного файлу'}</p></div>
                <p>{record.rowCount} рядків · {record.sheetCount} аркушів{record.owner?.name ? ` · Автор: ${record.owner.name}` : ''}</p>
                <div>
                  <button className="button button--primary button--small" onClick={() => void open(record)}>{record.isOwner ? 'Відкрити' : 'Використати як копію'}</button>
                  {record.isOwner && <button className="button button--danger button--small" onClick={() => void remove(record)}>Видалити</button>}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : !data ? (
        <label className={`sheet-dropzone${dragging ? ' sheet-dropzone--dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void loadFile(event.dataTransfer.files[0]); }}>
          <input type="file" accept=".xlsx" onChange={(event) => void loadFile(event.target.files?.[0])} />
          <span className="sheet-dropzone__icon"><Icon name="upload" size={30} /></span>
          <strong>{pending ? 'Обробляємо таблицю…' : 'Перетягніть XLSX-файл сюди'}</strong>
          <small>або натисніть, щоб вибрати файл · до 20 МБ</small>
        </label>
      ) : (
        <section className="tool-panel sheet-editor">
          <div className="sheet-workspace">
            <label className="field"><span>Назва таблиці</span><input value={name} maxLength={160} onChange={(event) => { setName(event.target.value); setDirty(true); }} /></label>
            <span className={`workspace-mode${dirty ? ' workspace-mode--dirty' : ''}`}>{savedId ? dirty ? 'Є незбережені зміни' : 'Збережено' : 'Ще не збережено'}</span>
            <div>
              <button className="button button--secondary button--small" onClick={() => void reset(false)}>Нова</button>
              {savedId && <button className="button button--danger button--small" onClick={() => { const record = library.data?.find((item) => item.id === savedId); if (record) void remove(record); }}>Видалити</button>}
              <button className="button button--primary button--small" disabled={pending} onClick={() => void save()}>{savedId ? 'Зберегти зміни' : 'Зберегти таблицю'}</button>
            </div>
          </div>

          <div className="sheet-toolbar">
            <div><strong>{fileName || 'Збережена таблиця'}</strong><span>{activeSheet?.rows.length || 0} рядків · {Math.max(0, (activeSheet?.headers.length || 1) - 1)} характеристик</span></div>
            <div className="sheet-toolbar__actions">
              <button className={activeSheet?.showCompletedStatus ? 'active' : ''} onClick={() => void toggleStatus('completed')}><Icon name={activeSheet?.showCompletedStatus ? 'remove' : 'add'} size={14} /> Заповнено</button>
              <button className={activeSheet?.showUploadedStatus ? 'active' : ''} onClick={() => void toggleStatus('uploaded')}><Icon name={activeSheet?.showUploadedStatus ? 'remove' : 'add'} size={14} /> Вивантажено</button>
              <button className={showHeaderCopyButtons ? 'active' : ''} aria-pressed={showHeaderCopyButtons} onClick={toggleHeaderCopyButtons}><Icon name={showHeaderCopyButtons ? 'remove' : 'add'} size={14} /> Копіювання назв</button>
              <button onClick={() => void toggleFullscreen()}><Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={16} /> {fullscreen ? 'Вийти з повного екрана' : 'На весь екран'}</button>
              {data.sheets.length > 1 && <select value={activeSheet?.name} onChange={(event) => { setData((current) => current ? { ...current, activeSheet: event.target.value } : current); setDirty(true); }}>{data.sheets.map((sheet) => <option key={sheet.name}>{sheet.name}</option>)}</select>}
            </div>
          </div>

          <div className="sheet-table-wrap">
            <table className="sheet-table">
              <thead>
                <tr>
                  {statuses.map((status, index) => <th key={status.field} className="sheet-status-column" style={{ left: getPinnedColumnLeft(index) }}>{status.label}</th>)}
                  {activeSheet?.headers.map((header, index) => (
                    <th key={`${header}-${index}`} className={index === 0 ? 'sheet-product-column' : ''} style={index === 0 ? { left: getPinnedColumnLeft(statuses.length) } : undefined}>
                      <span>{header}</span>
                      <CopyButton value={header} label={`Копіювати: ${header}`} onCopied={() => showToast('Назву колонки скопійовано.')} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeSheet?.rows.map((row) => (
                  <tr key={row.sourceIndex} className={`${activeSheet.showCompletedStatus && row.completed ? 'done ' : ''}${activeSheet.showUploadedStatus && row.uploaded ? 'uploaded' : ''}`}>
                    {statuses.map((status, index) => (
                      <td className="sheet-status-column" style={{ left: getPinnedColumnLeft(index) }} key={status.field}>
                        <input type="checkbox" checked={row[status.field]} onChange={(event) => setRowStatus(row, status.field, event.target.checked)} />
                      </td>
                    ))}
                    {row.values.map((value, index) => (
                      <td key={index} className={index === 0 ? 'sheet-product-column' : ''} style={index === 0 ? { left: getPinnedColumnLeft(statuses.length) } : undefined}>
                        {index > 0 && (
                          <span className="sheet-cell-line sheet-cell-line--header">
                            <small>{activeSheet.headers[index]}</small>
                            {showHeaderCopyButtons && <CopyButton value={activeSheet.headers[index]} label={`Копіювати назву: ${activeSheet.headers[index]}`} onCopied={() => showToast('Назву характеристики скопійовано.')} />}
                          </span>
                        )}
                        <span className="sheet-cell-line sheet-cell-line--value">
                          <span>{value || '—'}</span>
                          <CopyButton value={value} label={`Копіювати значення: ${value}`} onCopied={() => showToast('Значення скопійовано.')} />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {importState && (
        <div className="modal-backdrop">
          <section className="modal sheet-import-modal">
            <header className="modal__header"><div><p className="eyebrow">Імпорт XLSX</p><h2>Оберіть аркуші</h2><p>{importState.file.name}</p></div><button className="icon-button" onClick={() => setImportState(null)} aria-label="Закрити"><Icon name="close" size={20} /></button></header>
            <div className="sheet-import-list">
              {importState.workbook.SheetNames.map((sheetName, index) => (
                <label key={sheetName}>
                  <input type="checkbox" checked={importState.selected.includes(sheetName)} onChange={(event) => setImportState((current) => current ? { ...current, selected: event.target.checked ? [...current.selected, sheetName] : current.selected.filter((name) => name !== sheetName) } : current)} />
                  <span><strong>{sheetName}</strong><small>Аркуш {index + 1}</small></span>
                </label>
              ))}
            </div>
            <footer className="modal__footer sheet-import-footer">
              <span>Обрано {importState.selected.length} із {importState.workbook.SheetNames.length}</span>
              <button className="button button--secondary" onClick={() => setImportState(null)}>Скасувати</button>
              <button className="button button--primary" disabled={!importState.selected.length} onClick={confirmImport}>Імпортувати вибрані</button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
