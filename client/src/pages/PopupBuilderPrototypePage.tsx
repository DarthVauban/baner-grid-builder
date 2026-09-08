import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StyledSelect } from '../components/StyledSelect';
import { useAuth } from '../auth/AuthContext';
import { Icon, type IconName } from '../components/Icon';
import { PrototypeCanvas } from '../components/popup-prototype/PrototypeCanvas';
import { PrototypeInspector, selectionLabels } from '../components/popup-prototype/PrototypeInspector';
import { initialDraft, stateLabels, type Device, type PreviewState, type PrototypeKind, type Selection } from '../components/popup-prototype/model';
import { usePrototypeDraft } from '../components/popup-prototype/usePrototypeDraft';
import '../styles/popup-prototype.css';

function PrototypeStudio({ kind, storageKey }: { kind: PrototypeKind; storageKey: string }) {
  const { draft, update, undo, redo, canUndo, canRedo, storageError } = usePrototypeDraft(storageKey, kind);
  const [selection, setSelection] = useState<Selection>('banner');
  const [device, setDevice] = useState<Device>('desktop');
  const [state, setState] = useState<PreviewState>('default');
  const [testing, setTesting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [productIndex, setProductIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(720);
  const [zoom, setZoom] = useState('fit');
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'structure' | 'properties'>('canvas');
  const [resetOpen, setResetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const lead = kind === 'lead-form';
  const sceneWidth = device === 'mobile' ? 390 : Math.max(900, draft.desktop.width + 80);
  const activeSelection = selection.startsWith('field:') && !draft.form.fields.some((field) => `field:${field.id}` === selection) ? 'fields' : selection;

  useEffect(() => {
    const viewport = viewportRef.current;
    const scene = sceneRef.current;
    if (!viewport || !scene) return undefined;
    const resize = () => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      setScale(zoom === 'actual' ? 1 : Math.min(1,
        Math.max(160, viewport.clientWidth - 40) / sceneWidth,
        Math.max(160, viewport.clientHeight - 120) / Math.max(1, scene.offsetHeight)));
      setNaturalHeight(scene.offsetHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    observer.observe(scene);
    resize();
    return () => observer.disconnect();
  }, [sceneWidth, zoom, fullscreen, mobilePanel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (resetOpen) setResetOpen(false);
        else if (fullscreen) { setFullscreen(false); fullscreenButton.current?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, resetOpen]);

  function select(value: Selection) {
    setSelection(value);
    if (lead && (value === 'success' || value === 'coupon')) setState('success');
    else if (lead && (value === 'fields' || value === 'copy' || value === 'cta' || value.startsWith('field:'))) setState('default');
    setMobilePanel('properties');
  }

  function exportDraft() {
    const data = JSON.stringify({ schema: 'mt-popup-builder-prototype/v1', exportedAt: new Date().toISOString(), draft }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `popup-${kind}-prototype.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setAnnouncement('Макет експортовано у JSON');
  }

  function node(id: Selection, icon: IconName, label: string, detail?: string, nested = false) {
    return <button type="button" className={`pp-tree-node ${activeSelection === id ? 'is-active' : ''} ${nested ? 'is-nested' : ''}`} aria-pressed={activeSelection === id} onClick={() => select(id)} key={id}><Icon name={icon} size={17} /><span>{label}{detail && <small>{detail}</small>}</span>{activeSelection === id && <i />}</button>;
  }

  return <main className={`pp-studio ${fullscreen ? 'is-focus' : ''} is-panel-${mobilePanel}`}>
    <header className="pp-studio-header">
      <Link className="pp-back" to="/tools/popup-banners" aria-label="До попап-банерів"><Icon name="arrowLeft" size={20} /></Link>
      <div className="pp-studio-identity"><div><span>POPUP STUDIO</span><b>ПРОТОТИП</b></div><input aria-label="Назва макета" maxLength={160} value={draft.name} onChange={(event) => update((current) => ({ ...current, name: event.target.value }))} /></div>
      <nav className="pp-kind-switch" aria-label="Прототип конструктора"><Link to="/tools/popup-banners/prototypes/product" aria-current={!lead ? 'page' : undefined}><Icon name="productCard" size={17} />Товарний банер</Link><Link to="/tools/popup-banners/prototypes/lead-form" aria-current={lead ? 'page' : undefined}><Icon name="formBuilder" size={17} />Форма за промокод</Link></nav>
      <div className="pp-header-actions"><span className={`pp-save-state ${storageError ? 'is-error' : ''}`} role="status"><i />{storageError ? 'Не вдалося зберегти' : 'Збережено в браузері'}</span><div className="pp-history"><button type="button" onClick={undo} disabled={!canUndo} aria-label="Скасувати зміну"><Icon name="undo" size={18} /></button><button type="button" onClick={redo} disabled={!canRedo} aria-label="Повторити зміну"><span className="pp-redo-icon"><Icon name="undo" size={18} /></span></button></div><button type="button" className="pp-primary" aria-label="Експортувати макет" onClick={exportDraft}><Icon name="download" size={16} /><span>Експортувати макет</span></button></div>
    </header>
    <div className="pp-prototype-note"><Icon name="edit" size={14} /><span>Інтерактивний прототип · демотовари та промокод · зміни зберігаються лише в цьому браузері</span><button type="button" onClick={() => setResetOpen((value) => !value)}>Почати з прикладу</button></div>
    {resetOpen && <div className="pp-reset-confirm" role="group" aria-label="Повернути початковий приклад"><span>Замінити поточний макет початковим прикладом? Зміну можна скасувати.</span><button type="button" onClick={() => { update(() => initialDraft(kind)); setSelection('banner'); setProductIndex(0); setState('default'); setResetOpen(false); }}>Відновити приклад</button><button type="button" onClick={() => setResetOpen(false)}>Залишити макет</button></div>}
    <nav className="pp-mobile-tabs" aria-label="Панелі конструктора">{([['structure', 'Структура'], ['canvas', 'Полотно'], ['properties', 'Властивості']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={mobilePanel === value} onClick={() => setMobilePanel(value)}>{label}</button>)}</nav>
    <div className="pp-workbench">
      <aside className="pp-structure" aria-label="Структура банера">
        <header><span className="pp-structure-icon"><Icon name={lead ? 'formBuilder' : 'productCard'} size={21} /></span><div><h2>{lead ? 'Форма за промокод' : 'Товарний банер'}</h2><p>{lead ? 'Контакт → приємний бонус' : 'Добірка → покупка'}</p></div></header>
        <div className="pp-structure-scroll">
          <div className="pp-tree-heading">{lead ? 'ЕКРАН 01 · ЗНАЙОМСТВО' : 'СТРУКТУРА БАНЕРА'}</div>
          {node('banner', 'popup', 'Композиція', lead ? 'Обкладинка та форма' : 'Формат і розміри')}
          {node('copy', 'edit', 'Заголовок і текст')}
          {lead ? <>{node('fields', 'formBuilder', 'Поля форми', `${draft.form.fields.length} поля`)}{draft.form.fields.map((field) => node(`field:${field.id}`, field.type === 'phone' ? 'phone' : 'edit', field.label || 'Без назви', field.required ? 'Обов’язкове' : undefined, true))}</> : node('products', 'productCard', 'Товари', `${draft.product.ids.length} у добірці`)}
          {node('cta', 'arrowRight', lead ? 'Кнопка отримання' : 'Кнопка товару')}
          {lead && <><div className="pp-tree-heading">ЕКРАН 02 · ВИНАГОРОДА</div>{node('success', 'check', 'Повідомлення про успіх')}{node('coupon', 'copy', 'Промокод і копіювання')}</>}
          <div className="pp-tree-heading">СЦЕНАРІЙ</div>{node('rules', 'schedule', 'Умови показу')}
        </div>
        <footer><div><Icon name="visibility" size={18} /><strong>Обери елемент на полотні</strong></div><p>Його властивості відкриються праворуч. Для перевірки дій увімкни «Тестувати».</p></footer>
      </aside>
      <section className="pp-canvas-workspace" aria-label="Полотно конструктора">
        <div className="pp-canvas-toolbar"><div className="pp-mode-switch" role="group" aria-label="Режим роботи"><button type="button" aria-pressed={!testing} onClick={() => { setTesting(false); setAnnouncement(''); }}><Icon name="edit" size={15} />Редагувати</button><button type="button" aria-pressed={testing} onClick={() => { setTesting(true); setState('default'); }}><Icon name="visibility" size={15} />Тестувати</button></div><div className="pp-device-switch" role="group" aria-label="Формат екрана"><button type="button" aria-label="Desktop" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="monitor" size={19} /></button><button type="button" aria-label="Mobile" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Icon name="phone" size={18} /></button></div><div className="pp-zoom-controls"><StyledSelect compact ariaLabel="Масштаб полотна" value={zoom} onChange={setZoom} options={[{ value: 'fit', label: `Вписати · ${Math.round(scale * 100)}%` }, { value: 'actual', label: '100%' }]} /><button ref={fullscreenButton} type="button" aria-label={fullscreen ? 'Повернутися до редактора' : 'Розгорнути прев’ю'} onClick={() => setFullscreen((value) => !value)}><Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={19} />{fullscreen && <span>Вийти</span>}</button></div></div>
        <div className="pp-state-toolbar">{lead ? <><span>Стан екрана</span><div role="group" aria-label="Стан форми">{(Object.keys(stateLabels) as PreviewState[]).map((value) => <button key={value} type="button" aria-pressed={state === value} onClick={() => setState(value)}>{stateLabels[value]}</button>)}</div></> : <><span><i /> Живий перегляд</span><p>Демодобірка · {draft.product.ids.length} товари · {draft.product.rotation ? `ротація ${draft.product.rotation} с` : 'ручне перемикання'}</p></>}</div>
        <div className="pp-stage-viewport" ref={viewportRef}>
          <div className="pp-stage-caption"><span>{device === 'desktop' ? 'DESKTOP' : 'MOBILE'} <b>{sceneWidth} PX</b></span><small>{testing ? 'Взаємодій із банером як покупець' : 'Натисни на елемент, щоб налаштувати'}</small></div>
          <div className="pp-stage-sizer" style={{ width: sceneWidth * scale, height: naturalHeight * scale }}>
            <div className="pp-scene-shell" ref={sceneRef} style={{ width: sceneWidth, transform: `scale(${scale})` }}><PrototypeCanvas key={`${kind}:${testing}`} draft={draft} device={device} state={state} onState={setState} selection={activeSelection} onSelect={select} testing={testing} productIndex={productIndex} onProductIndex={setProductIndex} /></div>
          </div>
          <div className="pp-canvas-bottom-label"><Icon name={lead ? 'security' : 'productCard'} size={14} />{lead ? 'Тестове відправлення не створює контактів' : 'Товари й ціни наведені для прикладу'}</div>
        </div>
        <footer className="pp-canvas-footer"><span><i />{testing ? 'Тестування взаємодії' : selectionLabels[activeSelection] || 'Поле форми'}</span><span>{draft[device].width} px · {device === 'desktop' ? 'Комп’ютер' : 'Телефон'}</span></footer>
      </section>
      <PrototypeInspector draft={draft} device={device} selection={activeSelection} onSelect={select} update={update} />
    </div>
    {announcement && <div className="pp-announcement" role="status">{announcement}<button type="button" aria-label="Прибрати сповіщення" onClick={() => setAnnouncement('')}><Icon name="close" size={16} /></button></div>}
  </main>;
}

export function PopupBuilderPrototypePage() {
  const { kind: routeKind } = useParams();
  const { user } = useAuth();
  const kind: PrototypeKind = routeKind === 'lead-form' ? 'lead-form' : 'product';
  const storageKey = `mt-popup-prototype-v1:${user?.id || 'local'}:${kind}`;
  return <PrototypeStudio key={storageKey} kind={kind} storageKey={storageKey} />;
}
