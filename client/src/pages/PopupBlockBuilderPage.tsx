import type { PopupPromoProduct } from '../types/popup-banner';
import { CatalogBlockPicker } from '../components/popup-builder/CatalogBlockPicker';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { StyledSelect } from '../components/StyledSelect';
import { BlockInspector, Choice } from '../components/popup-builder/BlockInspector';
import { BlockTree } from '../components/popup-builder/BlockTree';
import { BlockRenderer, type DropPlacement } from '../components/popup-builder/BlockRenderer';
import { useBlockDocument } from '../components/popup-builder/useBlockDocument';
import { usePrototypeViewport } from '../components/popup-prototype/usePrototypeViewport';
import { createTemplate, templateLabels, type TemplateName } from '../components/popup-builder/templates';
import { blockLabels, duplicateBlock, effectiveStyle, findBlock, flatten, insertBlock, isContainer, makeBlock, moveBlock, patchBlock, removeBlock, validateDocument, wrapBlock, type BlockDocument, type BlockNode, type BlockType, type Device } from '../components/popup-builder/block-model';
import '../styles/popup-prototype.css';
import '../styles/popup-block-builder.css';

export interface LiveBlockStudio {
  collections?: Record<string, PopupPromoProduct[]>; pageProduct?: PopupPromoProduct | null;
  workspace?: (tab: string, document: BlockDocument, update: (document: BlockDocument) => void, select: (id: string) => void) => ReactNode;
  initialTab?: string;
  onTemplate?: (name: TemplateName) => Promise<boolean>;
  onLeave: () => void;
  initialDocument: BlockDocument; busy: boolean; products: PopupPromoProduct[]; campaignCode?: string;
  onDocumentChange: (document: BlockDocument) => void;
  controls: (document: BlockDocument) => ReactNode;
  settings: ReactNode;
  preview: (document: BlockDocument, device: Device, restart: number) => ReactNode;
}
export function BlockStudio({ storageKey, live }: { storageKey: string; live?: LiveBlockStudio }) {
  const { document: draft, update, undo, redo, canUndo, canRedo, storageError } = useBlockDocument(storageKey, live?.initialDocument);
  const onDocumentChange = live?.onDocumentChange;
  useEffect(() => { onDocumentChange?.(draft); }, [draft, onDocumentChange]);
  const [workspaceTab, setWorkspaceTab] = useState(live?.initialTab || 'design');
  const [selection, setSelection] = useState(draft.root.id);
  const [device, setDevice] = useState<Device>('desktop');
  const [testing, setTesting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState('canvas');
  const [leftTab, setLeftTab] = useState<'tree' | 'add'>('tree');
  const [templates, setTemplates] = useState(false);
  const [notice, setNotice] = useState('');
  const [restart, setRestart] = useState(0);
  const upload = useRef<HTMLInputElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const selected = findBlock(draft.root, selection) || findBlock(draft.root, draft.root.id)!;
  const rootStyle = effectiveStyle(draft.root, device);
  const bannerWidth = rootStyle.widthMode === 'fixed' ? rootStyle.width : device === 'mobile' ? 350 : 640;
  const viewport = usePrototypeViewport(live && testing ? device === 'mobile' ? 454 : 1164 : bannerWidth + 64, device + ':' + testing);
  const entries = flatten(draft.root);
  const childrenIds = new Set(flatten(selected.node).map(({ node }) => node.id));
  const parents = entries.filter(({ node }) => isContainer(node) && !childrenIds.has(node.id));
  const breadcrumbs: BlockNode[] = [];
  let ancestor: BlockNode | null = selected.node;
  while (ancestor) { breadcrumbs.unshift(ancestor); ancestor = findBlock(draft.root, ancestor.id)?.parent || null; }
  const collectionOwner = [...breadcrumbs].reverse().find(node => node.type === 'collection');
  const productSource = [...breadcrumbs].reverse().find(node => (node.type === 'product' || node === draft.root) && node.props.productExternalId);
  const productOwner = productSource || [...breadcrumbs].reverse().find(node => node.type === 'product') || draft.root;
  const catalogProduct = (node?: BlockNode) => node?.props.productExternalId ? live?.products.find(item => item.productExternalId === node.props.productExternalId && (item.modificationExternalId || '') === node.props.modificationExternalId) : undefined;
  const bannerProduct = catalogProduct(draft.root);
  const boundProduct = catalogProduct(productSource);
  const inheritedProduct = catalogProduct([...breadcrumbs].slice(0, -1).reverse().find(node => (node.type === 'product' || node === draft.root) && node.props.productExternalId));
  const insertionParent = isContainer(selected.node) ? selected.node : selected.parent || draft.root;

  function perform(action: () => void) { try { action(); setNotice(''); } catch (error) { setNotice(error instanceof Error ? error.message : 'Не вдалося змінити макет.'); } }
  function select(id: string) { setWorkspaceTab('design'); setSelection(id); setMobilePanel('properties'); }
  function change(changeDraft: (value: BlockDocument) => BlockDocument) { perform(() => update(changeDraft)); }
  function add(type: BlockType, direction: 'row' | 'column' = 'column') { perform(() => { const block = makeBlock(type, direction); if (live) { block.props.code = ''; if (type === 'coupon') block.props.couponSource = 'campaign'; if (type === 'form') block.children[1].props.text = 'Надіслати'; } update((current) => insertBlock(current, insertionParent.id, block)); setSelection(block.id); }); }
  function erase() { perform(() => { update((current) => removeBlock(current, selected.node.id)); setSelection(selected.parent?.id || draft.root.id); }); }
  function duplicate() { perform(() => { const result = duplicateBlock(draft, selected.node.id); update(() => result.document); setSelection(result.id); }); }
  function wrap(direction: 'row' | 'column') { perform(() => { const result = wrapBlock(draft, selected.node.id, direction); update(() => result.document); setSelection(result.id); }); }
  function reorder(direction: -1 | 1) { if (!selected.parent) return; const index = selected.parent.children.findIndex((node) => node.id === selected.node.id); const next = index + direction; if (next < 0 || next >= selected.parent.children.length) return; change((current) => moveBlock(current, selected.node.id, selected.parent!.id, direction < 0 ? next : next + 1)); }
  function outdent() { const parent = selected.parent && findBlock(draft.root, selected.parent.id); if (!parent?.parent) return; change((current) => moveBlock(current, selected.node.id, parent.parent!.id, parent.parent!.children.findIndex((node) => node.id === parent.node.id) + 1)); }
  function drop(sourceId: string, targetId: string, placement: DropPlacement) {
    const target = findBlock(draft.root, targetId); if (!target || sourceId === targetId) return;
    change((current) => placement === 'inside' ? moveBlock(current, sourceId, targetId) : target.parent ? moveBlock(current, sourceId, target.parent.id, target.parent.children.findIndex((node) => node.id === targetId) + (placement === 'after' ? 1 : 0)) : current);
  }
  function exportDraft() { const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'popup-block-layout.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Макет експортовано у JSON'); }
  async function importDraft(file?: File) { if (!file) return; try { if (file.size > 500000) throw new Error('Файл макета має бути меншим за 500 КБ.'); const next = validateDocument(JSON.parse(await file.text())); update(() => next); setSelection(next.root.id); setNotice('Макет імпортовано. Попередній можна повернути через «Скасувати».'); setRestart((value) => value + 1); } catch (error) { setNotice(error instanceof Error ? error.message : 'Не вдалося імпортувати макет.'); } finally { if (upload.current) upload.current.value = ''; } }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') { if (templates) setTemplates(false); else if (fullscreen) { setFullscreen(false); fullscreenButton.current?.focus(); } else if (testing) setTesting(false); return; }
      if (workspaceTab !== 'design') return;
      if ((event.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey && canRedo) redo(); else if (!event.shiftKey && canUndo) undo(); }
      if (testing) return;
      if (event.key === 'Delete' && selected.parent) { event.preventDefault(); erase(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') { event.preventDefault(); if (selected.parent) duplicate(); }
    }
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  });
  const parentIndex = selected.parent?.children.findIndex((node) => node.id === selected.node.id) ?? 0;
  return <main className={'pp-studio pb-studio ' + (fullscreen ? 'is-focus ' : '') + 'is-panel-' + mobilePanel}>
    <header className="pp-studio-header" inert={live?.busy || undefined}><Link className="pp-back" to="/tools/popup-banners" onClick={live ? event => { event.preventDefault(); live.onLeave(); } : undefined} aria-label="До попап-банерів"><Icon name="arrowLeft" size={20} /></Link><div className="pp-studio-identity"><div><span>POPUP STUDIO</span><b>БЛОКОВИЙ</b></div><input aria-label="Назва макета" maxLength={160} value={draft.name} onChange={(event) => change((current) => ({ ...current, name: event.target.value }))} /></div><button type="button" className="pb-template-button" aria-expanded={templates} onClick={() => { setWorkspaceTab('design'); setTemplates((value) => !value); }}>Шаблони <span>⌄</span></button><div className="pp-header-actions">{!live && <span className={'pp-save-state ' + (storageError ? 'is-error' : '')} role="status"><i />{storageError ? 'Помилка збереження' : 'Збережено в браузері'}</span>}{live && <button type="button" aria-pressed={workspaceTab === 'rules'} onClick={() => setWorkspaceTab('rules')}>Умови показу</button>}<div className="pp-history"><button type="button" aria-label="Скасувати зміну" disabled={!canUndo} onClick={undo}><Icon name="undo" size={18} /></button><button type="button" aria-label="Повторити зміну" disabled={!canRedo} onClick={redo}><span className="pp-redo-icon"><Icon name="undo" size={18} /></span></button></div><button type="button" className="pb-import" onClick={() => upload.current?.click()}>Імпорт JSON</button><input ref={upload} type="file" accept="application/json,.json" aria-label="Імпорт макета" hidden onChange={(event) => void importDraft(event.target.files?.[0])} /><button type="button" className="pp-primary" onClick={exportDraft}><Icon name="download" size={16} />Експорт JSON</button>{live?.controls(draft)}</div></header>
    <div className="pp-prototype-note"><Icon name="edit" size={14} /><span>{live ? 'Чернетка зберігається у кампанії. Кнопка «Опублікувати» застосовує її на сайті. У тестуванні контакти й замовлення не створюються.' : 'Блоковий конструктор · локальний макет · демодані в тестуванні · публікацію на сайт ще не підключено'}</span></div>
    {live?.workspace && <nav className="pc-tabs" aria-label="Розділи кампанії">{[['design', 'Дизайн'], ['data', 'Сценарій і дані'], ['rules', 'Правила показу'], ['test', 'Перевірка']].map(([tab, title]) => <button type="button" key={tab} aria-pressed={workspaceTab === tab} onClick={() => { setWorkspaceTab(tab); setFullscreen(false); }}>{title}</button>)}</nav>}
    {live?.workspace && workspaceTab !== 'design' && live.workspace(workspaceTab, draft, next => change(() => next), select)}
    <div className="pc-design" style={{ display: workspaceTab === 'design' ? undefined : 'none' }}>
    {live && <div className="pb-product-bar"><button type="button" disabled={live.busy} onClick={() => select(draft.root.id)}><Icon name="productCard" size={16} />Товар банера</button><span>{bannerProduct ? `${bannerProduct.title} · ${bannerProduct.sku}` : draft.root.props.productExternalId ? 'Оновлюємо дані обраного товару…' : 'Не обрано · прив’яжіть товар для тексту, фото, цін і кнопок'}</span></div>}
    {templates && <div className="pb-templates" role="group" aria-label="Шаблони банерів"><p>Почни з готової композиції або чистого аркуша. Заміну можна скасувати.</p>{(Object.keys(templateLabels) as TemplateName[]).map((name) => <button key={name} type="button" onClick={() => { void (async () => { if (live?.onTemplate && !await live.onTemplate(name)) return; const next = createTemplate(name, Boolean(live)); change(() => next); setSelection(next.root.id); setTemplates(false); setRestart(value => value + 1); })(); }}>{templateLabels[name]}</button>)}</div>}
    {storageError && <div className="pb-error" role="alert">{storageError}</div>}
    <nav className="pp-mobile-tabs" aria-label="Панелі конструктора">{[['structure', 'Структура'], ['canvas', 'Полотно'], ['properties', 'Властивості']].map(([value, label]) => <button key={value} type="button" aria-pressed={mobilePanel === value} onClick={() => setMobilePanel(value)}>{label}</button>)}</nav>
    <div className="pp-workbench" inert={live?.busy || undefined}>
      <aside className="pp-structure" aria-label="Структура банера"><div className="pb-left-tabs"><button type="button" aria-pressed={leftTab === 'tree'} onClick={() => setLeftTab('tree')}>Шари <small>{entries.length}</small></button><button type="button" aria-pressed={leftTab === 'add'} onClick={() => setLeftTab('add')}><Icon name="add" size={15} />Додати</button></div><div className="pp-structure-scroll">
        {leftTab === 'tree' ? <><BlockTree root={draft.root} selectedId={selected.node.id} device={device} onSelect={select} onDrop={drop} /><button type="button" className="pb-add-link" onClick={() => setLeftTab('add')}>＋ Додати блок</button></> : <div className="pb-palette"><small>ДОДАТИ ВСЕРЕДИНУ</small><strong>{insertionParent.name}</strong><div className="pb-palette-layout"><button type="button" aria-label="Горизонтальний блок" onClick={() => add('container', 'row')}><span>▯ ▯</span>Горизонтальний блок</button><button type="button" aria-label="Вертикальний блок" onClick={() => add('container', 'column')}><span>▱<br />▱</span>Вертикальний блок</button></div><small>ЕЛЕМЕНТИ</small><div className="pb-palette-elements">{(['text', 'image', 'button', 'divider', 'spacer', 'coupon', 'countdown', 'form', 'field', 'product', 'collection', 'acknowledgement'] as BlockType[]).map((type) => <button key={type} type="button" aria-label={blockLabels[type]} onClick={() => add(type)}><span>{({ text: 'T', image: '▧', button: '↗', divider: '―', spacer: '↧', coupon: '%', countdown: '◷', form: '▤', field: '▭', product: '◇', collection: '▦', acknowledgement: '☑' } as Record<string, string>)[type]}</span>{blockLabels[type]}</button>)}</div><p className="pb-help">Обери контейнер на полотні або в шарах. Новий елемент потрапить усередину нього. Поля додаються лише у форму.</p></div>}
      </div><footer className="pb-tree-actions"><div><button type="button" aria-label="Перемістити вище" disabled={!selected.parent || parentIndex === 0} onClick={() => reorder(-1)}>↑</button><button type="button" aria-label="Перемістити нижче" disabled={!selected.parent || parentIndex === selected.parent.children.length - 1} onClick={() => reorder(1)}>↓</button><button type="button" aria-label="На рівень вище" disabled={!selected.parent || selected.parent.id === draft.root.id} onClick={outdent}>↰</button><button type="button" aria-label="Дублювати блок" disabled={!selected.parent} onClick={duplicate}><Icon name="copy" size={16} /></button><button type="button" aria-label="Видалити блок" disabled={!selected.parent} onClick={erase}><Icon name="delete" size={16} /></button></div>{selected.parent && <><Choice label="Батьківський контейнер" value={selected.parent.id} options={parents.map(({ node, depth }) => [node.id, '· '.repeat(depth) + (node.name || blockLabels[node.type])] as const)} onChange={(id) => change((current) => moveBlock(current, selected.node.id, id))} /><div className="pb-wrap-actions"><button type="button" onClick={() => wrap('row')}>Обгорнути в ряд</button><button type="button" onClick={() => wrap('column')}>У колонку</button></div></>}</footer></aside>
      <section className="pp-canvas-workspace" aria-label="Полотно конструктора"><div className="pp-canvas-toolbar"><div className="pp-mode-switch"><button type="button" aria-pressed={!testing} onClick={() => setTesting(false)}><Icon name="edit" size={15} />Редагувати</button><button type="button" aria-pressed={testing} onClick={() => { setTesting(true); setRestart((value) => value + 1); }}><Icon name="visibility" size={15} />Тестувати</button></div><div className="pp-device-switch" role="group" aria-label="Формат екрана"><button type="button" aria-label="Desktop" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><Icon name="monitor" size={19} /></button><button type="button" aria-label="Mobile" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')}><Icon name="phone" size={18} /></button></div><div className="pp-zoom-controls"><button type="button" aria-label="Переміщення полотна" aria-pressed={viewport.handTool} onClick={() => viewport.setHandTool((value) => !value)}>✥</button><button type="button" aria-label="Зменшити масштаб" disabled={viewport.scale <= 0.1} onClick={() => viewport.zoomBy(1 / 1.2)}>−</button><StyledSelect compact ariaLabel="Масштаб полотна" value={viewport.isFit ? 'fit' : String(Math.round(viewport.scale * 100))} options={[{ value: 'fit', label: viewport.isFit ? Math.round(viewport.scale * 100) + '% · Вписати' : 'Вписати' }, ...Array.from(new Set([10, 25, 50, 75, 100, 125, 150, 200, 300, Math.round(viewport.scale * 100)])).sort((a, b) => a - b).map((value) => ({ value: String(value), label: value + '%' }))]} onChange={(value) => value === 'fit' ? viewport.fit() : viewport.setZoom(Number(value) / 100)} /><button type="button" aria-label="Збільшити масштаб" disabled={viewport.scale >= 3} onClick={() => viewport.zoomBy(1.2)}>+</button><button type="button" aria-label="Вписати банер" onClick={viewport.fit}><Icon name="fullscreenExit" size={17} /></button><button ref={fullscreenButton} type="button" aria-label={fullscreen ? 'Повернутися до редактора' : 'Розгорнути прев’ю'} onClick={() => setFullscreen((value) => !value)}><Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={19} />{fullscreen && 'Вийти'}</button></div></div>
      <div className="pb-breadcrumbs" aria-label="Шлях до блока">{breadcrumbs.map((node) => <button key={node.id} type="button" onClick={() => select(node.id)}>{node.name}<span>›</span></button>)}</div><div className="pp-stage-caption"><span>{device.toUpperCase()} <b>{bannerWidth} PX</b></span><small>Ctrl / ⌘ + колесо — зум · пробіл + перетягування — рух</small></div>
      <div className={'pp-stage-viewport ' + (viewport.grabbing ? 'is-grabbing' : viewport.handTool || viewport.spaceHeld ? 'is-hand' : '')} ref={viewport.viewportRef} tabIndex={0} aria-label="Навігація полотном" data-scale={viewport.scale}><div className="pp-scene-shell" ref={viewport.sceneRef} style={viewport.sceneStyle}>{live && testing ? live.preview(draft, device, restart) : <BlockRenderer collections={live?.collections} pageProduct={live?.pageProduct} products={live?.products} campaignCode={live?.campaignCode} key={testing + ':' + restart} root={draft.root} device={device} selectedId={selected.node.id} testing={testing} onSelect={select} onDrop={drop} />}</div></div><footer className="pp-canvas-footer"><span><i />{testing ? 'Тестування взаємодії' : selected.node.name}</span><span>{entries.length} / 120 блоків · {Math.round(viewport.scale * 100)}%</span></footer></section>
      <aside className="pp-inspector" aria-label="Властивості блока">{<BlockInspector products={live?.products} live={Boolean(live)}
        productPicker={live && (selected.node === draft.root || selected.node.type === 'product') ? <CatalogBlockPicker node={selected.node} product={catalogProduct(selected.node)} inheritedProduct={inheritedProduct} onChange={node => change(current => ({ ...current, root: patchBlock(current.root, node.id, () => node) }))} /> : undefined}
        productBinding={live ? <div className="pb-product-binding"><p className="pb-help">{breadcrumbs.some(n => n.type === 'collection') ? 'Шаблон усіх карток добірки: вміст успадковується від поточної картки.' : selected.node.props.dataSource === 'page' ? 'Дані товару відкритої сторінки. Для прикладу задайте URL у вкладці «Сценарій і дані».' : productSource ? `${productOwner === draft.root ? 'Товар банера' : 'Товар блока «' + productOwner.name + '»'}: ${boundProduct ? boundProduct.title + ' · ' + boundProduct.sku : 'очікуємо дані каталогу'}` : 'Товар не обрано. Прив’яжіть його, щоб цей елемент отримував дані каталогу.'}</p>{selected.node.props.dataSource === 'page' ? <button type="button" onClick={() => setWorkspaceTab('data')}>Контекст сторінки</button> : collectionOwner && ['inherit', 'item'].includes(selected.node.props.dataSource) ? <button type="button" onClick={() => select(collectionOwner.id)}>Налаштувати добірку</button> : <button type="button" onClick={() => select(selected.node.props.dataSource === 'banner' ? draft.root.id : productOwner.id)}>{productSource ? 'Змінити товар' : 'Обрати товар'}</button>}</div> : undefined}
        key={selected.node.id} node={selected.node} device={device} onChange={(node) => change((current) => ({ ...current, root: patchBlock(current.root, node.id, () => node) }))} />}</aside>
    </div></div>{notice && <div className="pp-announcement" role="status">{notice}<button type="button" aria-label="Прибрати сповіщення" onClick={() => setNotice('')}><Icon name="close" size={16} /></button></div>}
  </main>;
}
export function PopupBlockBuilderPage() { const { user } = useAuth(); const storageKey = 'mt-popup-block-builder-v1:' + (user?.id || 'local'); return <BlockStudio key={storageKey} storageKey={storageKey} />; }
