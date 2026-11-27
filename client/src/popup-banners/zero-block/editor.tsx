'use client';

import {createTimerSession} from '@zero/timer.mjs';
import { restoreTwoCompositions } from '@zero/responsive.mjs';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirmDialog } from '@workspace/dialogs/ConfirmDialogContext';
import { useToast } from '@workspace/toast/ToastContext';
import { ModalDialog } from '@workspace/components/ModalDialog';
import { AppLink, Badge, Button, Card, ColorInput, Dialog, ErrorState, Field, IconButton, Menu, NumberInput, Panel, Spinner, Switch, TextInput } from './ui/components';
import { EditorPaletteItem, EditorSegments, EditorSelectionCard, EditorSelectionFrame, EditorSelectionOutline, EditorZoomControl, type ResizeHandle } from './ui/editor-controls';
import { EditorLayerTree, type EditorLayerNode } from './ui/editor-layer-tree';
import { ContextMenu, type ContextMenuItem } from './ui/context-menu';
import { canvasLayer, groupLayers, layerIndex, leafIds, moveLayer, removeLayers, selectCanvasMember, selectionBounds, selectionRoots, ungroupLayers } from '@zero/layers.mjs';
import {resizeShapeBox,rotatedShapeBounds,shapeValues} from '@zero/shape.mjs';
import {textFallback,textHandles,textValues} from '@zero/text.mjs';
import type {TextContent} from '@zero/text-types';
import {InlineTextEditor} from './ui/inline-text-editor';
import {InlineButtonEditor} from './ui/inline-button-editor';
import {buttonValues,buttonFallback,buttonHandles,editorLocked,setEditorLocked,isStyledButton,upgradeButton} from '@zero/button.mjs';
import type {ButtonContent} from '@zero/button-types';
import {copyLayers,pasteLayers} from '@zero/clipboard.mjs';
import { resizeGroup } from '@zero/group-resize.mjs';
import { Timer, ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Copy, ClipboardPaste, Eye, Image as ImageIcon, Info, Layers3, Monitor, MoreHorizontal, Percent, Plus, RectangleHorizontal, Redo2, Save, ShoppingBag, Smartphone, Square, TextCursorInput, Trash2, Type, Undo2, SlidersHorizontal, X } from 'lucide-react';
import { DisplayRulesScreen } from './display-rules-screen';
import { ElementProperties } from './element-properties';
import {bindBannerProduct,bindingDiagnostics,detachBannerProduct,hasProductBindings} from '@zero/product-bindings.mjs';
import {useProductData} from './use-product-data';
import {CatalogProductPicker} from './ui/product-editor';
import type {ProductMap} from '@zero/product-types';
import { SurfaceProperties } from './surface-properties';
import { enforceButtonMinimums } from './button-geometry';
import { useLayerClipboard } from './use-layer-clipboard';
import { mergeFormConfiguration } from '@zero/form-style-options.mjs';
import { isZeroForm,upgradeZeroForm } from '@zero/zero-form.mjs';
import { FormBuilderDialog } from './ui/form-builder-dialog';
import type { FormContent } from '@zero/form-types';
import { renderEditorPlaceholder } from './ui/editor-placeholder';
import { EditorViewport, type EditorViewportHandle } from './ui/editor-viewport';
import { zeroBlockApi } from './workspace-api';
import { createElement, popupDiagnostics } from '@zero/document.mjs';
import { imageBox, imageFileError, imageFit, imageRatio, imageSource, resizeImageBox } from '@zero/images.mjs';
import {alignSelection, positionSelection, spacingPlan, spaceSelection} from '@zero/selection-layout.mjs';
import {SelectionPositionProperties} from './selection-position-properties';
import {EditorAlignmentControls, type EditorAlignment} from './ui/editor-alignment-controls';
import {EditorSpacingControls, type SpacingAxis} from './ui/editor-spacing-controls';
import { measureButtonContent, mountPopupArtboard, mountPopupOverlay } from '@zero/renderer.mjs';
import { EditorPreview } from './ui/editor-preview';
import {BannerPlacementEditor} from './ui/banner-placement-editor';
import type { Box, PopupDocument, PopupElement, Widget } from './types';

const elementRotation=(item:PopupElement,device:'desktop'|'mobile')=>item.type==='shape'?shapeValues(item.content,device).rotation:item.type==='text'?textValues(item.content,device).rotation:item.type==='button'?buttonValues(item.content,device).rotation:0;
const names: Record<PopupElement['type'], string> = { text: 'Текст', image: 'Зображення', button: 'Кнопка', shape: 'Фігура', product: 'Товар', promo: 'Промокод', timer:'Таймер', form: 'Форма', field: 'Поле форми' };
const paletteTypes = (Object.keys(names) as PopupElement['type'][]).filter(type => type !== 'field' && type !== 'product');
const elementIcons = { text: Type, image: ImageIcon, button: RectangleHorizontal, shape: Square, product: ShoppingBag, promo: Percent, timer:Timer, form: TextCursorInput, field: TextCursorInput };
const clone = <T,>(value: T): T => structuredClone(value);
const asText = (value: unknown) => typeof value === 'string' ? value : '';

function ReviewPreview({ document,products }: { document: PopupDocument;products:ProductMap }) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    shadow.replaceChildren();
    const mounted=mountPopupOverlay(host,document,{mode:'preview',contained:true,device:'desktop',products,removeHost:false,renderPlaceholder:renderEditorPlaceholder});
    return ()=>mounted.destroy();
  }, [document,products]);
  return <div className="builder-review-preview"><p>Прев’ю банера · desktop</p><div ref={hostRef} style={{ display:'block',position:'relative',width: document.desktop.width * 0.5, height: document.desktop.height * 0.5 }}/></div>;
}

function PublicationView({ mode, widget, document, shop, busy, onEdit, onPublish, onPause,products }: {
  products:ProductMap;mode: 'review' | 'result'; widget: Widget; document: PopupDocument; shop?: { name: string; domain: string; verified: boolean };
  busy: boolean; onEdit: () => void; onPublish: () => void; onPause: () => void;
}) {
  return <section className="builder-review" aria-label={mode === 'review' ? 'Перевірка публікації' : 'Результат публікації'}>
    <Panel tone="dark"><h1>{mode === 'review' ? 'Перевірка публікації' : 'Конфігурацію опубліковано'}</h1><Card><dl className="builder-review-facts"><div><dt>Магазин</dt><dd>{shop?.name || '—'} · {shop?.domain || '—'}</dd></div><div><dt>Елементів у чернетці</dt><dd>{document.elements.length}</dd></div><div><dt>Опублікована версія</dt><dd>{widget.publishedVersionId?.slice(0, 8) || 'Перший випуск'}</dd></div><div><dt>Умови та пріоритет</dt><dd>{document.rules.rules.length ? document.rules.rules.map((rule) => rule.type).join(', ') : 'Без додаткових умов'} · {document.priority}</dd></div></dl></Card>{mode === 'review' ? <ReviewPreview document={document} products={products}/> : null}<p>Показ на вітрині залежить від умов. Нова конфігурація доступна протягом 30 секунд після підтвердженої публікації.</p></Panel>
    <Card>{mode === 'review' ? <><h2>Готовність</h2><ul className="builder-review-checks"><li><Badge tone="success">Готово</Badge> Вміст і дії перевірені</li><li><Badge tone={shop?.verified ? 'success' : 'danger'}>{shop?.verified ? 'Готово' : 'Блоковано'}</Badge> Магазин Хорошоп підключено</li><li><Badge tone="success">Готово</Badge> Чернетку збережено</li><li><Badge tone="info">Інформація</Badge> {(hasProductBindings(document)||document.elements.some(item=>item.type==='product'))?'Товари поточного каталогу перевірені':'Каталог не потрібний для цього банера'}</li></ul><div className="product-actions"><Button variant="secondary" onClick={onEdit}>Назад до редактора</Button><Button onClick={onPublish} disabled={!shop?.verified || busy} loading={busy}>Опублікувати</Button></div></> : <><h2>Перевірте у магазині</h2><p className="product-muted">Відкрийте тестову вітрину й звірте desktop/mobile. Умови можуть обмежувати показ.</p><div className="product-actions">{shop?.domain ? <AppLink variant="primary" href={`https://${shop.domain}`} target="_blank" rel="noopener noreferrer">Відкрити магазин</AppLink> : null}<Button variant="secondary" onClick={onEdit}>Редагувати чернетку</Button><Button variant="secondary" onClick={onPause} disabled={!widget.enabled || busy} loading={busy}>Призупинити показ</Button></div></>}</Card>
  </section>;
}


const campaignLibrary = '/tools/popup-banners';

export function PopupBuilder({ widgetId }: { widgetId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const { showToast } = useToast();
  const [editName, setEditName] = useState<string | null>(null);
  const requestMedia = zeroBlockApi.uploadImage;
  const uploadMediaAsset = useCallback(async (file: File) => (await requestMedia(file)).id, [requestMedia]);
  const uploadRewardAsset = zeroBlockApi.uploadReward;
  const [formSteps,setFormSteps]=useState<Record<string,number|'success'>>({});
  const imageUploadToken = useRef(0), imageUploadPending = useRef(false);
  useEffect(() => () => { imageUploadToken.current += 1; imageUploadPending.current = false; }, []);
  const [widget, setWidget] = useState<Widget | null>(null);
  const [document, setDocument] = useState<PopupDocument | null>(null);
  const shopId = widget?.shopId || '';
  const shop = widget?.store ? { name: 'Хорошоп', domain: widget.store.domain, verified: true, timezone: widget.store.timezone } : undefined;
  const {products,productsRef,rememberProduct,error:productError}=useProductData(document);
  const [productPickerId,setProductPickerId]=useState<string|null>(null);
  const [detachProductOpen,setDetachProductOpen]=useState(false);
  const loadProductPage = zeroBlockApi.catalog;
  const documentRef = useRef<PopupDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  const selectIds = useCallback((ids: string[]) => { selectionRef.current = ids; setSelectedIds(ids); }, []);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [canvasInput, setCanvasInput] = useState<{ scope: string; axis: 'width' | 'height'; value: string } | null>(null);
  const [panel, setPanel] = useState<'element' | 'rules'>('element');
  const rulesTrigger = useRef<HTMLDivElement>(null);
  const previousPanel = useRef(panel);
  useLayoutEffect(() => {
    if (previousPanel.current === 'rules' && panel === 'element') rulesTrigger.current?.querySelector('button')?.focus({ preventScroll: true });
    previousPanel.current = panel;
  }, [panel]);
  const [leftTab, setLeftTab] = useState('elements');
  const [phase, setPhase] = useState<'edit' | 'review' | 'result'>('edit');
  const [zoom, setZoom] = useState(0.7);
  const [preview, setPreview] = useState(false);
  const [timerExpired,setTimerExpired]=useState(false);
  const timerPreviewSession=useRef(createTimerSession());
  const previewMount=useRef<ReturnType<typeof mountPopupOverlay>|null>(null);
  const timerExpiredRef=useRef(false);
  useEffect(()=>{timerExpiredRef.current=timerExpired;previewMount.current?.setTimerExpired(timerExpired);},[timerExpired]);
  const [placementOpen,setPlacementOpen]=useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [exitOpen, setExitOpen] = useState(false);
  const [formEditor,setFormEditor] = useState<{ element: PopupElement; name: string } | null>(null);
  const [inlineEditorId,setInlineEditorId]=useState<string|null>(null),[textToolbar,setTextToolbar]=useState<HTMLDivElement|null>(null);
  const inlineSession=useRef<PopupDocument|null>(null);
  const openInlineEditor=useCallback((id:string)=>{const current=documentRef.current,item=current?.elements.find(item=>item.id===id&&['text','button'].includes(item.type));if(!current||!item||editorLocked(item))return;inlineSession.current=clone(current);selectIds([id]);setPanel('element');setInlineEditorId(id);},[selectIds]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [imageFeedback, setImageFeedback] = useState<{ message: string; error?: boolean; success?: boolean } | null>(null);
  useEffect(() => {
    if (!imageFeedback?.success) return;
    const timer = window.setTimeout(() => setImageFeedback(current => current === imageFeedback ? null : current), 2000);
    return () => window.clearTimeout(timer);
  }, [imageFeedback]);
  const [conflict, setConflict] = useState(false);
  const publishOperation = useRef<{ draft: number; campaign: number; id: string } | null>(null);
  const [history, setHistory] = useState<PopupDocument[]>([]); const [future, setFuture] = useState<PopupDocument[]>([]);
  const futureRef=useRef<PopupDocument[]>([]);
  useEffect(()=>{futureRef.current=future;},[future]);
  const [spacingView,setSpacingView] = useState<{axis:SpacingAxis;value:number|null;min:number;max:number;disabled:boolean}|null>(null);
  const spacingGesture = useRef<{before:PopupDocument; plan:ReturnType<typeof spacingPlan>; value?:number}|null>(null);
  const endSpacing = useCallback(() => {
    const before = spacingGesture.current?.before; spacingGesture.current = null; setSpacingView(null);
    if (before && documentRef.current && JSON.stringify(before) !== JSON.stringify(documentRef.current)) {setHistory(items => [...items.slice(-99),before]);setFuture([]);}
  },[]);
  useEffect(() => endSpacing, [device, selectedIds, panel, endSpacing]);
  const finishInline=useCallback(()=>{const before=inlineSession.current;inlineSession.current=null;setInlineEditorId(null);if(before&&documentRef.current&&JSON.stringify(before)!==JSON.stringify(documentRef.current)){setHistory(items=>[...items.slice(-99),before]);setFuture([]);}},[]);
  const colorGesture = useRef<PopupDocument | null>(null);
  const beginColor = useCallback(() => { if (!colorGesture.current && documentRef.current) colorGesture.current = clone(documentRef.current); }, []);
  const endColor = useCallback(() => {
    const before = colorGesture.current; colorGesture.current = null;
    if (before && documentRef.current && JSON.stringify(before) !== JSON.stringify(documentRef.current)) {
      setHistory(items => [...items.slice(-99), before]); setFuture([]);
    }
  }, []);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mountedCanvas=useRef<{shadow:ShadowRoot;render:ReturnType<typeof mountPopupArtboard>;destroy:()=>void}|null>(null);
  useEffect(()=>()=>{mountedCanvas.current?.destroy();mountedCanvas.current=null;},[]);
  const viewportRef = useRef<EditorViewportHandle>(null);
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const feedback=mainRef.current?.querySelector<HTMLElement>('.builder-header-feedback');if(!feedback)return;
    const update=()=>{feedback.dataset.compact=String(feedback.getBoundingClientRect().width<150);};
    const observer=new ResizeObserver(update);update();observer.observe(feedback);return()=>observer.disconnect();
  },[document?.widgetId,phase]);
  const drag = useRef<{ ids: string[]; groupId?: string; pointer: number; mode: 'move' | ResizeHandle; x: number; y: number; boxes: Map<string, Box>; before: PopupDocument; recorded: boolean; futureBefore: PopupDocument[] } | null>(null);
  const marquee = useRef<{ pointer: number; x: number; y: number; before: string[]; additive: boolean; members: boolean; moved: boolean } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<Box | null>(null);
  const selectedLeaves = document ? leafIds(document, selectedIds) as string[] : [];
  const selectedId = selectedLeaves.length === 1 ? selectedLeaves[0] : null;
  const selected = document?.elements.find((item) => item.id === selectedId) || null;
  const dirty = !!document && !!widget && JSON.stringify(document) !== JSON.stringify(widget.document);
  const headerStatus = dirty && notice.startsWith('Чернетку збережено') ? 'Є незбережені зміни' : notice || (dirty ? 'Є незбережені зміни' : 'Чернетка збережена');
  const diagnostics = document ? [...popupDiagnostics(document,products), ...document.elements.filter(item => item.type === 'button' && (['desktop', 'mobile'] as const).some(device => { const minimum = measureButtonContent(item, device,products); return minimum.width > 3000 || minimum.height > 3000; })).map(item => ({ elementId: item.id, code: 'button_content_too_large', message: 'Скоротіть підпис кнопки або зменште шрифт: потрібний розмір перевищує 3000 px' }))] : [];
  const size = document?.[device];
  const closeControlMissing = diagnostics.some(item => item.code === 'close_control_missing');
  const footerDiagnostics = diagnostics.filter(item => item.code !== 'close_control_missing');

  const load = useCallback(async () => {
    imageUploadToken.current += 1;
    setImageFeedback(null);
    if (imageUploadPending.current) { imageUploadPending.current = false; setBusy(false); }
    try { const data = await zeroBlockApi.get(widgetId); const draft=clone(data.document);const dailyAdapted=draft.rules.rules.some(rule=>rule.type==='frequency');draft.rules.rules=draft.rules.rules.map(rule=>rule.type==='frequency'?{type:'daily_frequency',max:rule.max}:rule);const modesRestored=restoreTwoCompositions(draft);let migrated=false;for(const item of draft.elements)if(item.type==='form'&&!isZeroForm(item.content)){item.content=upgradeZeroForm(item.content);migrated=true;}const fitted = enforceButtonMinimums(draft, false,productsRef.current); setWidget(data); setDocument(fitted); documentRef.current = fitted; setHistory([]); setFuture([]); setPhase('edit'); setError(''); setConflict(false); setNotice(JSON.stringify(fitted) === JSON.stringify(data.document) ? '' : dailyAdapted?'Частоту адаптовано до денного ліміту. Збережіть чернетку.':modesRestored?'Редактор повернуто до двох режимів. Збережіть чернетку.':migrated?'Форму адаптовано до нового редактора. Збережіть чернетку.':'Розміри елементів узгоджено з вмістом. Збережіть чернетку.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не вдалося відкрити конструктор'); }
  }, [widgetId, productsRef]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(()=>{
    const fonts=globalThis.document.fonts;
    const fit=()=>{if(!documentRef.current)return;const next=enforceButtonMinimums(clone(documentRef.current),false,productsRef.current);if(JSON.stringify(next)!==JSON.stringify(documentRef.current)){documentRef.current=next;setDocument(next);}};
    void Promise.resolve().then(fit);fonts?.addEventListener('loadingdone',fit);window.addEventListener('kramkin:text-font-ready',fit);return()=>{fonts?.removeEventListener('loadingdone',fit);window.removeEventListener('kramkin:text-font-ready',fit);};
  },[products,productsRef]);

  useEffect(() => {
    function beforeLeave(event: BeforeUnloadEvent) { if (documentRef.current && widget && JSON.stringify(documentRef.current) !== JSON.stringify(widget.document)) event.preventDefault(); }
    window.addEventListener('beforeunload', beforeLeave); return () => window.removeEventListener('beforeunload', beforeLeave);
  }, [widget]);
  function replace(next: PopupDocument, remember = true) {
    const current = documentRef.current; if (!current) return;
    try { enforceButtonMinimums(next,true,productsRef.current); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Підпис кнопки завеликий'); return; }
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    if (remember && !colorGesture.current&&!inlineSession.current&&!spacingGesture.current) { setHistory((items) => [...items.slice(-99), clone(current)]); setFuture([]); }
    documentRef.current = next; setDocument(next); setNotice('');
  }
  function edit(change: (next: PopupDocument) => void) { const current = documentRef.current; if (!current) return; const next = clone(current); change(next); replace(next); }
  const clipboard = useLayerClipboard({ documentRef, selectionRef, surfaceRef: mainRef,
    blocked: () => phase !== 'edit' || panel === 'rules' || preview || placementOpen || exitOpen || !!formEditor || !!productPickerId || detachProductOpen || !!inlineSession.current || busy || !!drag.current || !!marquee.current || !!colorGesture.current,
    onPaste: (next, ids) => { replace(next); selectIds(ids); setPanel('element'); mainRef.current?.focus({ preventScroll: true }); },
    onMessage: setNotice,
  });
  const undo = useCallback(() => { const previous = history.at(-1); if (!previous || !documentRef.current) return; const current = clone(documentRef.current); setFuture((items) => [current, ...items].slice(0, 100)); setHistory((items) => items.slice(0, -1)); const restored = { ...previous, revision: widget?.revision || previous.revision }; documentRef.current = restored; setDocument(restored); }, [history, widget?.revision]);
  const redo = useCallback(() => { const next = future[0]; if (!next || !documentRef.current) return; const current = clone(documentRef.current); setHistory((items) => [...items.slice(-99), current]); setFuture((items) => items.slice(1)); const restored = { ...next, revision: widget?.revision || next.revision }; documentRef.current = restored; setDocument(restored); }, [future, widget?.revision]);
  function add(type: PopupElement['type']) {
    if (!document) return;
    if (document.elements.length >= 100 || type === 'form' && document.forms.length >= 20) { setNotice('Досягнуто технічну межу елементів або форм'); return; }
    let id = '';
    edit((next) => {
      let formId = next.forms[0]?.id || null;
      if (type === 'form') { formId = crypto.randomUUID(); next.forms.push({ id:formId, name:`Форма ${next.forms.length+1}` }); }
      if (type === 'field' && !formId) { formId = crypto.randomUUID(); next.forms.push({ id: formId, name: 'Форма 1' }); }
      const element = createElement(type, formId) as PopupElement;
      const index = next.elements.length;
      element.desktop.x = 60 + (index % 3) * 280; element.desktop.y = 60 + Math.floor(index / 3) * 110;
      if (element.mobile) { element.mobile.x = 24; element.mobile.y = 60 + index * 90; }
      if(type==='timer') (element.content.timer as {timezone:string}).timezone=next.timezone||shop?.timezone||'Europe/Kyiv';
      if (type === 'button') element.action = { type: 'close' };
      id = element.id; next.elements.push(element);
    });
    selectIds([id]); setPanel('element');
  }
  function updateElement(change: (item: PopupElement) => void) { if (!selectedId) return; edit((next) => { const item = next.elements.find((part) => part.id === selectedId); if (item&&!editorLocked(item)) change(item); }); }
  function toggleLayerLock(id:string,locked:boolean){
    if(busy||inlineSession.current)return;
    edit(next=>{const ids=new Set(leafIds(next,[id]));for(const item of next.elements)if(ids.has(item.id)&&editorLocked(item)!==locked)setEditorLocked(item,locked);});
  }
  function lockedSelection(){return !!documentRef.current?.elements.some(item=>leafIds(documentRef.current,selectionRef.current).includes(item.id)&&editorLocked(item));}
  function alignSelected(value:EditorAlignment) {
    endSpacing(); if (lockedSelection()) return;
    edit(next => {alignSelection(next,selectionRef.current,device,value);});
  }
  function positionSelected(axis:'x'|'y',value:number) {
    endSpacing(); if (lockedSelection()) return;
    edit(next => {positionSelection(next,selectionRef.current,device,axis,value);});
  }
  function beginSpacing(axis:SpacingAxis) {
    if (spacingGesture.current || !documentRef.current || lockedSelection()) return;
    const before = clone(documentRef.current); const plan=spacingPlan(before,selectionRef.current,device,axis); spacingGesture.current = {before,plan}; setSpacingView({axis,value:plan.value,min:plan.min,max:plan.max,disabled:plan.disabled});
  }
  function changeSpacing(axis:SpacingAxis,value:number) {
    beginSpacing(axis); const gesture = spacingGesture.current;
    if (!gesture || gesture.plan.axis !== axis || lockedSelection()) return;
    const next = clone(gesture.before); spaceSelection(next,gesture.plan,value); gesture.value=value; setSpacingView({axis,value,min:gesture.plan.min,max:gesture.plan.max,disabled:gesture.plan.disabled}); replace(next);
  }
  function removeSelected() { if (!selectedLeaves.length||lockedSelection()||inlineSession.current) return; edit(next => removeLayers(next, selectionRef.current)); selectIds([]); requestAnimationFrame(() => mainRef.current?.focus()); }
  function layer(direction: number) { if (!selectedId || !document||lockedSelection()) return; const { parents, nodes, roots } = layerIndex(document); const parent = parents.get(selectedId) || null; const siblings = parent ? nodes.get(parent).children : roots; const index = siblings.indexOf(selectedId); if (index + direction < 0 || index + direction >= siblings.length) return; edit(next => moveLayer(next, selectedId, parent, siblings.length - 1 - index - direction)); }
  const selectNode = useCallback((id: string, additive = false) => {
    const current = documentRef.current; if (!current) return;
    if (!additive) selectIds([id]);
    else {
      const leaves = leafIds(current, selectionRef.current) as string[]; const target = leafIds(current, [id]) as string[];
      selectIds(target.every(key => leaves.includes(key)) ? leaves.filter(key => !target.includes(key)) : selectionRoots(current, [...selectionRef.current, id]) as string[]);
    }
    setPanel('element');
  }, [selectIds]);
  const openFormEditor = useCallback((id: string) => {
    const current=documentRef.current, element=current?.elements.find(item=>item.id===id&&item.type==='form');
    if(!current||!element||editorLocked(element))return;selectIds([id]);setFormEditor({element:clone(element),name:current.forms.find(form=>form.id===element.content.formId)?.name||'Форма'});
  },[selectIds]);
  function groupSelection(ungroup = false) {
    if(lockedSelection())return;
    const current = documentRef.current; if (!current || leafIds(current, selectionRef.current).length < 2) return;
    const next = clone(current);
    const result = ungroup ? ungroupLayers(next, selectionRef.current) as string[] : groupLayers(next, selectionRef.current);
    replace(next); if (result) selectIds(Array.isArray(result) ? result : [result]);
    mainRef.current?.focus({ preventScroll: true });
  }
  const beginDrag = useCallback((id: string, mode: 'move' | ResizeHandle, event: PointerEvent | React.PointerEvent) => {
    if (event.button !== 0 || !documentRef.current||inlineSession.current) return;
    event.preventDefault(); mainRef.current?.focus({ preventScroll: true });
    const current = documentRef.current; const nodeId = mode !== 'move' || event.shiftKey ? id : canvasLayer(current, id);
    if(mode!=='move'&&current.elements.some(item=>item.id===id&&(item.type==='product'||item.type==='form'&&isZeroForm(item.content)))&&!['w','e'].includes(mode))return;
    if(mode!=='move'&&current.elements.some(item=>item.id===id&&(item.type==='text'&&textHandles(item.content,device)?.includes(mode)===false||item.type==='button'&&buttonHandles(item.content,device)?.includes(mode)===false)))return;
    if (mode === 'move' && event.shiftKey) { selectIds(selectCanvasMember(current,selectionRef.current,id)); setPanel('element'); return; }
    if (mode === 'move' && (event.ctrlKey || event.metaKey)) { selectNode(nodeId, true); return; }
    if(current.elements.some(item=>item.id===id&&editorLocked(item)))return;
    let ids = leafIds(current, selectionRef.current) as string[];
    if (!ids.includes(id)) { selectIds([nodeId]); ids = leafIds(current, [nodeId]) as string[]; }
    if(current.elements.some(item=>ids.includes(item.id)&&editorLocked(item)))return;
    const boxes = new Map(current.elements.filter(item => ids.includes(item.id)).map(item => [item.id, clone((device === 'mobile' ? item.mobile : item.desktop) || item.desktop)]));
    drag.current = { ids, groupId: mode !== 'move' && current.groups?.some(group => group.id === id) ? id : undefined, pointer: event.pointerId, mode, x: event.clientX, y: event.clientY, boxes, before: clone(current), recorded: false, futureBefore: futureRef.current };
  }, [device, selectIds, selectNode]);
  useEffect(() => {
    function move(event: PointerEvent) {
      const state = drag.current; const current = documentRef.current; if (!state || !current || state.pointer !== event.pointerId) return;
      const scale = viewportRef.current?.getScale() || 1;
      const next = state.groupId ? resizeGroup(state.before, state.groupId, device, state.mode, (event.clientX - state.x) / scale, (event.clientY - state.y) / scale, (item?:PopupElement,device:'desktop'|'mobile'='desktop')=>item?measureButtonContent(item,device,productsRef.current):{width:16,height:16}) as PopupDocument : clone(current);
      const dx = Math.round((event.clientX - state.x) / scale); const dy = Math.round((event.clientY - state.y) / scale);
      if (!state.recorded && Math.hypot(event.clientX - state.x, event.clientY - state.y) < 3) return;
      const startBoxes = [...state.boxes.values()];
      const safeDx = Math.max(...startBoxes.map(box => -1000 - box.x), Math.min(dx, ...startBoxes.map(box => 3000 - box.x)));
      const safeDy = Math.max(...startBoxes.map(box => -1000 - box.y), Math.min(dy, ...startBoxes.map(box => 3000 - box.y)));
      for (const item of next.elements.filter(item => !state.groupId && state.ids.includes(item.id))) {
        const box = device === 'mobile' ? (item.mobile ||= clone(item.desktop)) : item.desktop;
        const start = state.boxes.get(item.id)!; const minimum = measureButtonContent(item, device,productsRef.current);
        if (state.mode === 'move') { box.x = start.x + safeDx; box.y = start.y + safeDy; }
        else if(item.type==='image'&&imageFit(item,device)==='contain'){Object.assign(box,resizeImageBox(start,state.mode,dx,dy,imageRatio(item,device,productsRef.current[next.productId||''])));}
        else if(item.type==='shape'||item.type==='text'||item.type==='button'&&isStyledButton(item.content)){Object.assign(box,resizeShapeBox(start,state.mode,dx,dy,elementRotation(item,device),event.shiftKey));if(item.type!=='shape'){box.width=Math.max(16,box.width);box.height=Math.max(16,box.height);}}
        else {
          if (state.mode.includes('e')) box.width = Math.min(3000, Math.max(minimum.width, start.width + dx));
          if (state.mode.includes('s')) box.height = Math.min(3000, Math.max(minimum.height, start.height + dy));
          if (state.mode.includes('w')) { box.width = Math.min(3000, Math.max(minimum.width, start.width - dx)); box.x = start.x + start.width - box.width; }
          if (state.mode.includes('n')) { box.height = Math.min(3000, Math.max(minimum.height, start.height - dy)); box.y = start.y + start.height - box.height; }
          if(item.type==='product'||item.type==='form'&&isZeroForm(item.content))box.height=measureButtonContent(item,device,productsRef.current).height;
        }
      }
      try{enforceButtonMinimums(next,true,productsRef.current);}catch{return;}
      if (JSON.stringify(next) === JSON.stringify(current)) return;
      if (!state.recorded) { setHistory((items) => [...items.slice(-99), clone(current)]); setFuture([]); state.recorded = true; }
      documentRef.current = next; setDocument(next);
    }
    function finish(cancel: boolean) {
      const state = drag.current; if (!state) return; drag.current = null;
      if (state.recorded && (cancel || JSON.stringify(documentRef.current) === JSON.stringify(state.before))) {
        documentRef.current = state.before; setDocument(state.before); setHistory(items => items.slice(0, -1)); setFuture(state.futureBefore);
      }
    }
    function stop(event: PointerEvent) { if (drag.current?.pointer === event.pointerId) finish(event.type === 'pointercancel'); }
    function key(event: globalThis.KeyboardEvent) { if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); finish(true); } }
    const blur = () => finish(true);
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', key, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); };
  }, [device,productsRef]);
  const startMarquee = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !documentRef.current || event.button !== 0 || event.defaultPrevented || drag.current||inlineSession.current) return;
    event.preventDefault(); mainRef.current?.focus({ preventScroll: true });
    const bounds = canvasRef.current.getBoundingClientRect(); const scale = viewportRef.current?.getScale() || 1;
    marquee.current = { pointer: event.pointerId, x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale, before: [...selectionRef.current], additive: event.ctrlKey || event.metaKey || event.shiftKey, members:event.shiftKey, moved: false };
    if (!(event.ctrlKey || event.metaKey || event.shiftKey)) selectIds([]);
  }, [selectIds]);
  useEffect(() => {
    function finish(cancel = false) { const state = marquee.current; if (!state) return; marquee.current = null; setMarqueeBox(null); if (cancel) selectIds(state.before); }
    function move(event: PointerEvent) {
      const state = marquee.current; const current = documentRef.current; const host = canvasRef.current;
      if (!state || !current || !host || event.pointerId !== state.pointer) return;
      const rect = host.getBoundingClientRect(); const scale = viewportRef.current?.getScale() || 1;
      const x = (event.clientX - rect.left) / scale, y = (event.clientY - rect.top) / scale;
      if (!state.moved && Math.hypot(x - state.x, y - state.y) * scale < 4) return;
      event.preventDefault(); state.moved = true;
      const box = { x: Math.min(state.x, x), y: Math.min(state.y, y), width: Math.abs(x - state.x), height: Math.abs(y - state.y) }; setMarqueeBox(box);
      const hits = current.elements.filter(item => { if(editorLocked(item))return false;const raw = (device === 'mobile' ? item.mobile : item.desktop) || item.desktop; const target=item.type==='shape'?rotatedShapeBounds(raw,shapeValues(item.content,device).rotation):item.type==='text'||item.type==='button'?rotatedShapeBounds(raw,elementRotation(item,device)):raw; return target.x <= box.x + box.width && target.x + target.width >= box.x && target.y <= box.y + box.height && target.y + target.height >= box.y; }).map(item => state.members ? item.id : canvasLayer(current, item.id));
      if(state.members)selectIds(hits.reduce((ids,id)=>selectCanvasMember(current,ids,id,false),state.before) as string[]);
      else selectIds(selectionRoots(current, [...(state.additive ? state.before : []), ...hits]) as string[]);
    }
    function up(event: PointerEvent) { if (marquee.current?.pointer === event.pointerId) finish(event.type === 'pointercancel'); }
    function key(event: globalThis.KeyboardEvent) { if (event.key === 'Escape' && marquee.current) { event.preventDefault(); event.stopPropagation(); finish(true); } }
    const blur = () => finish(true);
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('keydown', key, true); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', blur); };
  }, [device, selectIds]);
  useEffect(() => {
    const host = canvasRef.current,previous=mountedCanvas.current;
    if (!host || !document){previous?.destroy();mountedCanvas.current=null;return;}
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    const renderOptions={products,formSteps,device,hiddenElementId:inlineEditorId,onSelect:(id:string,event:PointerEvent)=>beginDrag(id,'move',event)};
    if(previous?.shadow===shadow&&previous.render.updateDocument(document,renderOptions))return;
    previous?.destroy();mountedCanvas.current=null;shadow.replaceChildren();
    let live=true,imageFrame:number|null=null;
    const loadedImages=new Map<string,{source:string;width:number;height:number}>();
    const fitLoadedImages=()=>{
      imageFrame=null;if(!live)return;
      if(drag.current||colorGesture.current||spacingGesture.current){imageFrame=requestAnimationFrame(fitLoadedImages);return;}
      const current=documentRef.current;if(!current||current.widgetId!==document.widgetId)return;
      const next=clone(current);let changed=false;
      for(const [id,size]of loadedImages){const item=next.elements.find(item=>item.id===id&&item.type==='image');if(!item||imageSource(item,productsRef.current[next.productId||''])!==size.source)continue;if(JSON.stringify(item.content.imageSize)===JSON.stringify(size))continue;item.content.imageSize=size;changed=true;}
      loadedImages.clear();if(!changed)return;
      try{enforceButtonMinimums(next,false,productsRef.current);}catch{return;}
      documentRef.current=next;setDocument(next);
    };
    const mounted = mountPopupArtboard(shadow, document, { mode: 'editor', ...renderOptions, scale: 1, renderPlaceholder: renderEditorPlaceholder,
      onImageSize:(id:string,source:string,width:number,height:number)=>{if(!live||![width,height].every(value=>Number.isInteger(value)&&value>0&&value<=1000000))return;loadedImages.set(id,{source,width,height});if(imageFrame===null)imageFrame=requestAnimationFrame(fitLoadedImages);},
      onSelect: (id: string, event: PointerEvent) => beginDrag(id, 'move', event) });
    if(inlineEditorId)mounted.nodes.get(inlineEditorId)?.style.setProperty('visibility','hidden');
    function selectMember(event: Event) {
      const node = event.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && !!target.dataset.elementId);
      if (!node || !(event instanceof MouseEvent) || event.button !== 0) return;
      if(event.shiftKey||event.ctrlKey||event.metaKey){event.preventDefault();return;}
      event.preventDefault(); drag.current = null; selectNode(node.dataset.elementId!); mainRef.current?.focus({ preventScroll: true });
      if (documentRef.current?.elements.find(item=>item.id===node.dataset.elementId)?.type==='product') setProductPickerId(node.dataset.elementId!);
      if (documentRef.current?.elements.find(item=>item.id===node.dataset.elementId)?.type==='form') openFormEditor(node.dataset.elementId!);
      if (['text','button'].includes(documentRef.current?.elements.find(item=>item.id===node.dataset.elementId)?.type||'')) openInlineEditor(node.dataset.elementId!);
    }
    shadow.addEventListener('dblclick', selectMember);
    mountedCanvas.current={shadow,render:mounted,destroy(){live=false;if(imageFrame!==null)cancelAnimationFrame(imageFrame);shadow.removeEventListener('dblclick',selectMember);mounted.destroy();}};
  }, [document,products,productsRef, formSteps, device, beginDrag, phase, selectNode, openFormEditor,openInlineEditor,inlineEditorId]);
  const renderPreview = useCallback((host: HTMLDivElement) => {
    if (!document) return;
    const overlay = mountPopupOverlay(host, document, { mode: 'preview', contained: true, products, device: previewDevice, timerSession:timerPreviewSession.current,timerExpired:timerExpiredRef.current,removeHost: false, onClose: () => setPreview(false), renderPlaceholder: renderEditorPlaceholder });
    previewMount.current=overlay;
    return () => {overlay.destroy();if(previewMount.current===overlay)previewMount.current=null;};
  }, [document,products, previewDevice]);
  async function save() {
    if (!document || !widget) return false;
    setBusy(true); setError(''); setConflict(false);
    try {
      const data = await zeroBlockApi.save(widgetId, widget.revision, document);
      setWidget(data); setDocument(data.document); documentRef.current = data.document; setNotice('Чернетку збережено.');
      void queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
      return true;
    } catch (failure) {
      if (!(failure as { status?: number }).status) {
        try {
          const latest = await zeroBlockApi.get(widgetId);
          const content = (value: PopupDocument) => JSON.stringify({ ...value, revision: 0 });
          if (latest.revision > widget.revision && content(latest.document) === content(document)) {
            setWidget(latest); setDocument(latest.document); documentRef.current = latest.document; setNotice('Чернетку збережено.'); return true;
          }
          if (latest.revision !== widget.revision) setConflict(true);
        } catch { /* local draft stays available */ }
      } else if ((failure as { status?: number }).status === 409) setConflict(true);
      setError(failure instanceof Error ? failure.message : 'Збереження не вдалося');
      return false;
    }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!widget || !document) return;
    if (dirty) { setError('Спершу збережіть чернетку'); return; }
    if (diagnostics.length || !document.elements.length) { setError('Виправте помилки перед публікацією'); return; }
    setBusy(true); setError('');
    const prior = publishOperation.current;
    const operation = prior?.draft === widget.revision && prior.campaign === widget.campaignRevision ? prior : { draft: widget.revision, campaign: widget.campaignRevision, id: crypto.randomUUID() };
    publishOperation.current = operation;
    try {
      const payload = { draftRevision: operation.draft, campaignRevision: operation.campaign, operationId: operation.id };
      let data;
      try { data = await zeroBlockApi.publish(widgetId, payload); }
      catch (failure) { if ((failure as { status?: number }).status) throw failure; data = await zeroBlockApi.publish(widgetId, payload); }
      setWidget(data); publishOperation.current = null;
      if (data.operationVersionId !== data.publishedVersionId || !data.enabled) {
        setPhase('edit');
        setNotice('Попередню публікацію підтверджено. Стан показу вже оновили в іншій вкладці.');
      } else {
        setPhase('result');
        setNotice('Опубліковано. Вітрина отримає нову версію протягом 30 секунд.');
      }
      void queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
    } catch (failure) { if ((failure as { status?: number }).status === 409) setConflict(true); setError(failure instanceof Error ? failure.message : 'Результат публікації невідомий. Повторіть запит або завантажте версію.'); }
    finally { setBusy(false); }
  }
  async function pause() {
    if (!widget) return; setBusy(true); setError('');
    try {
      const data = await zeroBlockApi.pause(widgetId, widget.campaignRevision);
      setWidget(data);
      setNotice('Показ призупинено.');
      void queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не вдалося призупинити'); } finally { setBusy(false); }
  }
  async function removeCampaign() {
    if (!widget || busy || !await confirm({
      title: 'Видалити кампанію Zero Block?',
      message: 'Кампанія зникне зі списку й припинить показ. Заявки залишаться в розділі «Заявки Zero Block».',
      confirmLabel: 'Видалити', tone: 'danger'
    })) return;
    setBusy(true);
    try {
      await zeroBlockApi.remove(widgetId, { draftRevision: widget.revision, campaignRevision: widget.campaignRevision });
      void queryClient.invalidateQueries({ queryKey: ['popup-campaigns'] });
      showToast('Кампанію видалено.', 'success');
      navigate(campaignLibrary);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не вдалося видалити кампанію.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(file: File | null, targetId = selectedId, placement?: { device: 'desktop' | 'mobile'; x: number; y: number }) {
    const initial = documentRef.current;
    if (!file || !initial || busy || imageUploadPending.current || phase !== 'edit' || preview || exitOpen || formEditor || productPickerId || inlineSession.current || drag.current || marquee.current || colorGesture.current) return;
    const invalid = imageFileError([file]);
    if (invalid) { setImageFeedback({ message: invalid, error: true }); return; }
    const target = initial.elements.find(item => item.id === targetId && item.type === 'image');
    if (targetId && (!target || editorLocked(target))) return;
    if (!targetId && (!placement || initial.elements.length >= 100)) { setImageFeedback({ message: 'Досягнуто технічну межу 100 елементів.', error: true }); return; }
    const previousSource = JSON.stringify({resourceId:target?.content.resourceId,productImage:target?.content.productImage,externalUrl:target?.content.externalUrl,productId:target?.content.productImage?initial.productId:undefined}), operation = ++imageUploadToken.current;
    imageUploadPending.current = true; setBusy(true); setImageFeedback({ message: 'Завантаження й оптимізація зображення…' });
    try {
      const media = await requestMedia(file), current = documentRef.current;
      if (operation !== imageUploadToken.current || !current || current.widgetId !== initial.widgetId || current.shopId !== initial.shopId) return;
      const next = clone(current);
      let item: PopupElement;
      if (targetId) {
        const existing = next.elements.find(item => item.id === targetId && item.type === 'image');
        if (!existing || editorLocked(existing) || JSON.stringify({resourceId:existing.content.resourceId,productImage:existing.content.productImage,externalUrl:existing.content.externalUrl,productId:existing.content.productImage?current.productId:undefined}) !== previousSource) { setImageFeedback({ message: 'Зображення змінилося під час завантаження. Файл не застосовано.', error: true }); return; }
        item = existing;
        item.desktop = imageBox(item.desktop, media);
        if (item.mobile) item.mobile = imageBox(item.mobile, media);
      } else {
        if (next.elements.length >= 100) throw new Error('Досягнуто технічну межу 100 елементів.');
        item = createElement('image') as PopupElement;
        for (const side of ['desktop', 'mobile'] as const) {
          const board = next[side], box = imageBox(item[side]!, media, board);
          box.x = Math.max(0, Math.min(box.x, board.width - box.width)); box.y = Math.max(0, Math.min(box.y, board.height - box.height));
          item[side] = box;
        }
        const board = next[placement!.device], box = item[placement!.device]!;
        box.x = Math.max(0, Math.min(Math.round(placement!.x), board.width - box.width));
        box.y = Math.max(0, Math.min(Math.round(placement!.y), board.height - box.height));
        next.elements.push(item);
      }
      delete item.content.productImage;delete item.content.externalUrl;item.content.resourceId = media.id;item.content.imageSize={source:media.id,width:media.width,height:media.height}; item.content.alt = asText(item.content.alt) || file.name;
      replace(next);
      if (!targetId) { selectIds([item.id]); setPanel('element'); }
      setImageFeedback({ message: 'Зображення завантажено у WebP.', success: true });
    } catch (failure) { if (operation === imageUploadToken.current) setImageFeedback({ message: failure instanceof Error ? failure.message : 'Завантаження не вдалося', error: true }); }
    finally { if (operation === imageUploadToken.current) { imageUploadPending.current = false; setBusy(false); } }
  }
  function dropImages(files: File[], event: DragEvent<HTMLDivElement>) {
    const invalid = imageFileError(files); if (invalid) { setImageFeedback({ message: invalid, error: true }); return; }
    const host = canvasRef.current, current = documentRef.current;
    if (!host || !current) return;
    const rect = host.getBoundingClientRect(), scale = rect.width / current[device].width;
    const pathNode = event.nativeEvent.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && !!node.dataset.elementId);
    const hit = pathNode || [...(host.shadowRoot?.querySelectorAll<HTMLElement>('[data-element-id]') || [])].reverse().find(node => {
      const bounds = node.getBoundingClientRect(); return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    });
    const target = current.elements.find(item => item.id === hit?.dataset.elementId && item.type === 'image');
    if (target) { selectIds([target.id]); setPanel('element'); }
    void upload(files[0], target?.id || null, { device, x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale });
  }
  const cancelDrag = useCallback(() => {
    const state = drag.current; if (!state || !documentRef.current) return false;
    drag.current = null;
    documentRef.current = state.before; setDocument(state.before);
    if (state.recorded) { setHistory((items) => items.slice(0, -1)); setFuture(state.futureBefore); }
    return true;
  }, []);
  useEffect(() => {
    function keydown(event: globalThis.KeyboardEvent) { if (event.key === 'Escape' && cancelDrag()) { event.preventDefault(); event.stopPropagation(); } }
    window.addEventListener('keydown', keydown, true); return () => window.removeEventListener('keydown', keydown, true);
  }, [cancelDrag]);
  useEffect(() => {
    function historyKey(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || !documentRef.current) return;
      const key = event.code || (event.key.toLowerCase() === 'z' ? 'KeyZ' : event.key.toLowerCase() === 'y' ? 'KeyY' : '');
      if (key !== 'KeyZ' && key !== 'KeyY') return;
      const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (path.some(node => node.isContentEditable || node.matches('input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]),textarea,select,[role=textbox],[role=combobox]'))) return;
      event.preventDefault();
      // Native browser undo can edit the last blurred textarea even while a dialog owns focus.
      if (phase !== 'edit' || preview || exitOpen || path.some(node => node.matches('[role=menu],[role=dialog],[role=alertdialog]') && !node.hasAttribute('data-color-picker'))) return;
      if (colorGesture.current||inlineSession.current) return;
      if (drag.current) { cancelDrag(); return; }
      if (key === 'KeyY' || event.shiftKey) redo(); else undo();
    }
    window.addEventListener('keydown', historyKey); return () => window.removeEventListener('keydown', historyKey);
  }, [undo, redo, cancelDrag, phase, preview, exitOpen]);
  useEffect(() => {
    function selectAll(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      if ((event.code || (event.key.toLowerCase() === 'a' ? 'KeyA' : '')) !== 'KeyA') return;
      if (phase !== 'edit' || panel === 'rules' || preview || exitOpen || formEditor || productPickerId || !documentRef.current) return;
      const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (path.some(node => node.isContentEditable || node.matches('input,textarea,select,[role=textbox],[role=combobox],[role=menu],[role=dialog],[role=alertdialog]'))) return;
      event.preventDefault();
      if (busy || drag.current || marquee.current || colorGesture.current||inlineSession.current) return;
      window.getSelection()?.removeAllRanges();
      selectIds(layerIndex(documentRef.current).roots);
      setPanel('element');
      mainRef.current?.focus({ preventScroll: true });
    }
    window.addEventListener('keydown', selectAll); return () => window.removeEventListener('keydown', selectAll);
  }, [phase, panel, preview, exitOpen, formEditor,productPickerId, busy, selectIds]);
  useEffect(() => {
    function key(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || (event.code || '') !== 'KeyG') return;
      // Reserve the editor chord even when a field or overlay owns focus: the browser's
      // Find Next / Find Previous must not steal focus from the active editor control.
      event.preventDefault();
      if (phase !== 'edit' || panel === 'rules' || preview || exitOpen || drag.current || marquee.current) return;
      const path = event.composedPath().filter((node): node is HTMLElement => node instanceof HTMLElement);
      if (path.some(node => node.isContentEditable || node.matches('input,textarea,select,[role=dialog],[role=alertdialog],[role=menu],[role=textbox]'))) return;
      groupSelection(event.shiftKey);
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  function changeText(id:string,content:TextContent){
    const current=documentRef.current,target=current?.elements.find(item=>item.id===id&&item.type==='text');
    if(!current||!target||editorLocked(target))return 'Текст недоступний для редагування.';
    if(JSON.stringify(target.content)===JSON.stringify(content))return;
    const requested=clone(content),previous=target.content as unknown as TextContent;
    if(device==='desktop'&&target.mobileStyle&&requested.typography){
      const inherited=textValues(target.content,'mobile',textFallback(target,'mobile'));
      if(previous.typography?.base?.fontSize!==requested.typography.base.fontSize&&requested.typography.mobile?.fontSize===undefined&&inherited.fontSize>=8&&inherited.fontSize<=300)(requested.typography.mobile||={}).fontSize=inherited.fontSize;
      if(target.mobileStyle.radius!==undefined&&JSON.stringify(previous.typography?.base?.corners)!==JSON.stringify(requested.typography.base.corners)&&requested.typography.mobile?.corners===undefined&&Object.values(inherited.corners).every(value=>typeof value==='number'&&value>=0&&value<=999))(requested.typography.mobile||={}).corners=inherited.corners;
    }
    const next=clone(current);next.elements.find(item=>item.id===id)!.content=requested as unknown as Record<string,unknown>;replace(next);
    if(documentRef.current!==next)return 'Текст завеликий. Змініть ширину, шрифт або вміст.';
  }
  function changeButton(id:string,content:ButtonContent,expected?:ButtonContent){
    const current=documentRef.current,target=current?.elements.find(item=>item.id===id&&item.type==='button');
    if(!current||!target||editorLocked(target))return 'Кнопка недоступна для редагування.';
    if(expected&&JSON.stringify(target.content)!==JSON.stringify(expected))return 'Кнопка змінилася під час завантаження. Спробуйте ще раз.';
    if(JSON.stringify(target.content)===JSON.stringify(content))return;
    const requested=clone(content),prior=target.content as unknown as ButtonContent;
    if(!isStyledButton(prior)&&requested.button){const upgraded=upgradeButton(target);requested.button={...upgraded.button,...requested.button,base:{...upgraded.button.base,...requested.button.base},mobile:{...upgraded.button.mobile,...requested.button.mobile}};}
    if(device==='desktop'&&target.mobileStyle&&requested.button){const inherited=buttonValues(target.content,'mobile',buttonFallback(target,'mobile'));if(prior.button?.base.fontSize!==requested.button.base.fontSize&&requested.button.mobile?.fontSize===undefined)(requested.button.mobile||={}).fontSize=inherited.fontSize;if(target.mobileStyle.radius!==undefined&&JSON.stringify(prior.button?.base.corners)!==JSON.stringify(requested.button.base.corners)&&requested.button.mobile?.corners===undefined)(requested.button.mobile||={}).corners=inherited.corners;}
    const next=clone(current);next.elements.find(item=>item.id===id)!.content=requested as unknown as Record<string,unknown>;replace(next);if(documentRef.current!==next)return 'Кнопка завелика. Змініть підпис, ширину або оформлення.';
  }
  function shortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || preview || exitOpen || phase !== 'edit' || panel === 'rules') return;
    const target = event.target as HTMLElement; if (target.closest('input,textarea,[contenteditable=true],[role=dialog],[role=alertdialog],[role=menu]')) return;
    if (!selectedLeaves.length||inlineSession.current) return;
    if((event.ctrlKey||event.metaKey)&&event.code==='KeyD'){event.preventDefault();try{const fragment=copyLayers(document,selectionRef.current);if(fragment){const pasted=pasteLayers(document,fragment);replace(pasted.document);selectIds(pasted.ids);}}catch(e){setNotice(e instanceof Error?e.message:'Не вдалося дублювати');}return;}
    if(event.code==='KeyL'&&!event.ctrlKey&&!event.metaKey&&selected){event.preventDefault();toggleLayerLock(selected.id,!editorLocked(selected));return;}
    if(lockedSelection())return;
    if(['BracketLeft','BracketRight'].includes(event.code)&&selectedId&&document){event.preventDefault();if(event.ctrlKey||event.metaKey)layer(event.code==='BracketRight'?1:-1);else{const index=layerIndex(document),parent=index.parents.get(selectedId)||null,siblings=parent?index.nodes.get(parent).children:index.roots;edit(next=>moveLayer(next,selectedId,parent,event.code==='BracketRight'?0:siblings.length-1));}return;}
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); return; }
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[event.key]) { event.preventDefault(); const [dx, dy] = arrows[event.key]; const step = event.shiftKey ? 10 : 1; edit(next => { for (const item of next.elements.filter(item => selectedLeaves.includes(item.id))) { const box = device === 'mobile' ? (item.mobile ||= clone(item.desktop)) : item.desktop; if (event.altKey && selectedLeaves.length === 1) { if(item.type==='shape'||item.type==='text'||item.type==='button'&&isStyledButton(item.content))Object.assign(box,resizeShapeBox(box,'se',dx*step,dy*step,elementRotation(item,device)));else{box.width = Math.max(16, box.width + dx * step); box.height = Math.max(16, box.height + dy * step);} } else if (!event.altKey) { box.x = Math.max(-1000, Math.min(3000, box.x + dx * step)); box.y = Math.max(-1000, Math.min(3000, box.y + dy * step)); } } }); }
  }

  if (!document || !widget) return <div className="builder-loading">{error ? <ErrorState title="Конструктор не відкрився" description={error} action={<Button onClick={() => void load()}>Повторити</Button>}/> : <Spinner label="Відкриваємо конструктор"/>}</div>;
  const box = (selectedIds.length===1&&selectedIds[0]===selected?.id&&selected&&['shape','text','button'].includes(selected.type)?((device==='mobile'?selected.mobile:selected.desktop)||selected.desktop):selectionBounds(document, selectedIds, device)) as Box | null;
  const closeWarning = closeControlMissing ? <p role="alert" className="builder-warning">Банер повинен мати об’єкт із дією «Закрити банер». Публікацію заблоковано.</p> : null;
  const selectedGroup = selectedIds.length === 1 ? document.groups?.find(group => group.id === selectedIds[0]) : null;
  const editingInline=document.elements.find(item=>item.id===inlineEditorId&&['text','button'].includes(item.type));
  const hasLocked=document.elements.some(item=>selectedLeaves.includes(item.id)&&editorLocked(item));
  const SelectionIcon = selectedGroup ? Layers3 : selected ? elementIcons[selected.type] : Layers3;
  const index = layerIndex(document); const parent = index.parents.get(selectedId); const siblings = parent ? index.nodes.get(parent).children : index.roots;
  const selectedIndex = siblings.indexOf(selectedId);
  const selectionMenu = selected ? <Menu finalFocus={mainRef} trigger={<IconButton label="Дії з елементом" icon={<MoreHorizontal size={20}/>} variant="chrome"/>} items={[
    { label: 'Вище', icon: <ArrowUp size={16}/>, disabled: hasLocked||selectedIndex === siblings.length - 1, onClick: () => layer(1) },
    { label: 'Нижче', icon: <ArrowDown size={16}/>, disabled: hasLocked||selectedIndex === 0, onClick: () => layer(-1) },
    { label: 'На передній план', disabled:hasLocked||selectedIndex===siblings.length-1,onClick:()=>edit(next=>moveLayer(next,selectedId,parent||null,0)) },
    { label: 'На задній план', disabled:hasLocked||selectedIndex===0,onClick:()=>edit(next=>moveLayer(next,selectedId,parent||null,siblings.length-1)) },
    { label: 'Видалити', icon: <Trash2 size={16}/>, tone: 'danger', disabled:hasLocked||!!inlineEditorId, onClick: removeSelected },
  ]}/> : undefined;
  function resizeKey(handle: ResizeHandle, event: KeyboardEvent<HTMLButtonElement>) {
    if(lockedSelection())return;
    if ((!selected && !selectedGroup) || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    if (selectedGroup) { replace(resizeGroup(document!, selectedGroup.id, device, handle, dx, dy, (item?:PopupElement,device:'desktop'|'mobile'='desktop')=>item?measureButtonContent(item,device,productsRef.current):{width:16,height:16}) as PopupDocument); return; }
    if (!selected) return;
    const minimum = measureButtonContent(selected, device,productsRef.current);
    updateElement(item => {
      const target = device === 'mobile' ? (item.mobile ||= clone(item.desktop)) : item.desktop;
      if(item.type==='image'&&imageFit(item,device)==='contain'){Object.assign(target,resizeImageBox(target,handle,dx,dy,imageRatio(item,device,productsRef.current[document?.productId||''])));return;}
      if(item.type==='shape'||item.type==='text'||item.type==='button'&&isStyledButton(item.content)){Object.assign(target,resizeShapeBox(target,handle,dx,dy,elementRotation(item,device)));if(item.type!=='shape'){target.width=Math.max(16,target.width);target.height=Math.max(16,target.height);}return;}
      if (handle.includes('e')) target.width = Math.min(3000, Math.max(minimum.width, target.width + dx));
      if (handle.includes('s')) target.height = Math.min(3000, Math.max(minimum.height, target.height + dy));
      if (handle.includes('w')) { const width = Math.min(3000, Math.max(minimum.width, target.width - dx)); target.x += target.width - width; target.width = width; }
      if (handle.includes('n')) { const height = Math.min(3000, Math.max(minimum.height, target.height - dy)); target.y += target.height - height; target.height = height; }
    });
  }
  const menuItems: ContextMenuItem[] = [
    { label: 'Додати елемент', icon: <Plus size={16}/>, children: [
      { label: names.text, icon: <Type size={16}/>, onClick: () => add('text') },
      { label: names.image, icon: <ImageIcon size={16}/>, onClick: () => add('image') },
      { label: names.button, icon: <RectangleHorizontal size={16}/>, onClick: () => add('button') },
      { label: names.shape, icon: <Square size={16}/>, onClick: () => add('shape') },
      { label: names.timer,icon:<Timer size={16}/>,onClick:()=>add('timer') },
      { label: names.promo, icon: <Percent size={16}/>, onClick: () => add('promo') },
      { label: names.form, icon: <TextCursorInput size={16}/>, disabled: document.forms.length >= 20, onClick: () => add('form') },
    ] },
    { label: 'Копіювати', icon: <Copy size={16}/>, shortcut: 'Ctrl+C', disabled: !selectedLeaves.length || busy, onClick: () => void clipboard.copy() },
    { label: 'Вставити', icon: <ClipboardPaste size={16}/>, shortcut: 'Ctrl+V', disabled: busy, onClick: () => void clipboard.paste() },
    { label: 'Згрупувати', icon: <Layers3 size={16}/>, shortcut: 'Ctrl+G', disabled: hasLocked||selectedLeaves.length < 2 || (document.groups?.length || 0) >= 50, onClick: () => groupSelection() },
    { label: 'Розгрупувати', icon: <Layers3 size={16}/>, shortcut: 'Ctrl+Shift+G', disabled: hasLocked||selectedLeaves.length < 2, onClick: () => groupSelection(true) },
  ];
  function layerNodes(ids: string[]): EditorLayerNode[] { return [...ids].reverse().map(id => {
    const group = document!.groups?.find(item => item.id === id);
    if (group) {
      const ids=new Set(leafIds(document,[id])),locks=document!.elements.filter(item=>ids.has(item.id)).map(editorLocked);
      return { id, label: group.name, icon: <Layers3 size={18}/>, children: layerNodes(group.children), locked:locks.every(Boolean)?true:locks.some(Boolean)?'mixed':false,moveDisabled:locks.some(Boolean),lockDisabled:busy||!!inlineEditorId };
    }
    const item = document!.elements.find(item => item.id === id)!; const Icon = elementIcons[item.type]; const detail = asText(item.content.text || item.content.label || item.content.alt).slice(0, 24);
    return { id, label: item.name || `${names[item.type]}${detail ? ` · ${detail}` : ''}`, icon: <Icon size={18}/>,locked:editorLocked(item),moveDisabled:editorLocked(item),lockDisabled:busy||!!inlineEditorId };
  }); }
  const treeSelection = [...selectedIds, ...selectedLeaves];
  const canvasScope = `${shopId}/${widgetId}/${device}`;
  const canvasFieldValue = (axis: 'width' | 'height') => canvasInput?.scope === canvasScope && canvasInput.axis === axis ? canvasInput.value : String(document[device][axis]);
  function changeCanvasField(axis: 'width' | 'height', value: string) {
    setCanvasInput({ scope: canvasScope, axis, value });
    if (!value.trim() || !Number.isFinite(Number(value))) return;
    edit(next => { next[device][axis] = Math.max(axis === 'width' ? 320 : 240, Math.min(axis === 'width' ? Infinity : 2000, Number(value))); });
  }
  const artboardResize = {
    scope: `${shopId}/${widgetId}/${device}`, minWidth: 320, maxWidth: Infinity, minHeight: 240, maxHeight: 2000,
    disabled: busy || preview || placementOpen || exitOpen || !!formEditor || !!productPickerId || detachProductOpen || !!inlineEditorId,
    onInteractionStart: () => { endSpacing(); beginColor(); },
    onInteractionEnd: () => {
      if (documentRef.current?.shopId === shopId && documentRef.current.widgetId === widgetId) endColor();
      else colorGesture.current = null;
    },
    onChange: ({width,height}: {width:number;height:number}) => edit(next => {
      if (next.shopId === shopId && next.widgetId === widgetId) { next[device].width = width; next[device].height = height; }
    }),
  };
  const layerList = <ContextMenu items={menuItems} finalFocus={mainRef}><div className="builder-layers">{document.elements.length ? <EditorLayerTree nodes={layerNodes(index.roots)} selectedIds={treeSelection} onSelect={selectNode} onLockChange={toggleLayerLock} onMove={(id,parentId,at) => {if(document.elements.some(item=>leafIds(document,[id]).includes(item.id)&&editorLocked(item)))return;edit(next => moveLayer(next,id,parentId,at));}} onRename={(id,name) => edit(next => { const node = next.elements.find(item => item.id === id) || next.groups?.find(group => group.id === id); if (node) node.name = name; })}/> : <p className="builder-help">Додайте елемент — він з’явиться тут. Верхній рядок відповідає верхньому шару.</p>}</div></ContextMenu>;
  const headerFeedback=<div className="builder-header-feedback"><span className="builder-header-status" role="status" title={headerStatus}>{headerStatus}</span></div>;
  return <section ref={mainRef} tabIndex={-1} className="builder-shell" aria-label="Конструктор Zero Block" onKeyDown={shortcut}>
    <header className="builder-header">
      <div className="builder-header-identity">
        <AppLink variant="chrome" href={campaignLibrary} onClick={event => { if (dirty) { event.preventDefault(); setExitOpen(true); } }}><span className="builder-back-icon"><ArrowLeft size={18}/></span><span>До кампаній</span></AppLink>
        <div className="builder-title"><strong title={document.name}>{document.name}</strong><span>{shop?.name || 'Магазин'}{shop?.domain ? ` · ${shop.domain}` : ''}</span></div>
        <Menu trigger={<IconButton label="Дії кампанії" icon={<MoreHorizontal size={19} />} variant="chrome" />} items={[
          { label: 'Перейменувати', disabled: busy, onClick: () => setEditName(document.name) },
          { label: 'Заявки', onClick: () => navigate(`${campaignLibrary}/zero-block/contacts?campaign=${widgetId}`) },
          { label: 'Видалити кампанію', tone: 'danger', disabled: busy, onClick: () => void removeCampaign() }
        ]} />
        <div className="builder-publication-status"><Badge surface="dark" dot tone={dirty ? 'warning' : 'neutral'}>Чернетка</Badge>{widget.publishedVersionId ? <Menu trigger={<Button variant="chrome" size="sm" icon={<Eye size={13}/>}>{widget.enabled ? 'На вітрині' : 'Пауза'} · {widget.publishedVersionId.slice(0, 6)}<ChevronRight size={12}/></Button>} items={[{ label: 'Призупинити показ', disabled: !widget.enabled || busy, onClick: () => void pause() }]}/> : null}</div>
      </div>
      {phase === 'edit' ? <>
        <div className="builder-header-tools"><div className="builder-device-switch" style={{ opacity: panel === 'rules' ? 0 : undefined }} inert={panel === 'rules'} aria-hidden={panel === 'rules' ? true : undefined}><EditorSegments label="Пристрій" value={device} onValueChange={value => setDevice(value as 'desktop' | 'mobile')} items={[{ value: 'desktop', label: 'Комп’ютер', icon: <Monitor size={17}/> }, { value: 'mobile', label: 'Телефон', icon: <Smartphone size={17}/> }]}/></div><div className="builder-history"><IconButton label="Скасувати" icon={<Undo2 size={18}/>} variant="chrome" size="lg" disabled={!!inlineEditorId||!history.length} title={inlineEditorId?'Завершіть редагування тексту; всередині працює Ctrl/Cmd+Z':undefined} onClick={undo}/><IconButton label="Повторити" icon={<Redo2 size={18}/>} variant="chrome" size="lg" disabled={!!inlineEditorId||!future.length} title={inlineEditorId?'Завершіть редагування тексту; всередині працює Ctrl/Cmd+Shift+Z':undefined} onClick={redo}/></div></div>
        {headerFeedback}
        <div className="builder-header-actions"><Button variant="chrome" size="lg" icon={<Eye size={18}/>} onClick={() => { timerPreviewSession.current=createTimerSession();setTimerExpired(false);timerExpiredRef.current=false;setPreviewDevice(device); setPreview(true); }}>Перегляд</Button><Button variant="chrome" size="lg" icon={<Save size={17}/>} onClick={() => void save()} disabled={!dirty} loading={busy}>Зберегти</Button><div className="builder-publish-action"><Button variant="inverse" size="lg" onClick={() => setPhase('review')} disabled={dirty || !!diagnostics.length || !document.elements.length} title={dirty ? 'Спершу збережіть чернетку' : diagnostics.length ? 'Виправте помилки в документі' : !document.elements.length ? 'Додайте елемент' : undefined}>До перевірки</Button></div></div>
      </> : <>{headerFeedback}<Button variant="chrome" icon={<ArrowLeft size={17}/>} onClick={() => setPhase('edit')}>До редактора</Button></>}

    </header>
    {editName !== null && <ModalDialog ariaLabelledBy="zero-block-name" eyebrow="Zero Block" title="Перейменувати кампанію"
      onClose={() => setEditName(null)} onSubmit={(event) => {
        event.preventDefault();
        if (editName.trim().length < 2) return;
        edit((next) => { next.name = editName.trim(); });
        setEditName(null);
      }}
      footer={<button className="button button--primary" disabled={editName.trim().length < 2}>Застосувати</button>}>
      <label className="field"><span>Назва кампанії</span>
        <input value={editName} minLength={2} maxLength={100} onChange={(event) => setEditName(event.target.value)} required />
      </label>
    </ModalDialog>}
    {productPickerId?<CatalogProductPicker key={shopId+'-'+productPickerId} open onOpenChange={open=>{if(!open)setProductPickerId(null);}} value={productPickerId==='@banner'?document.productId||null:String(document.elements.find(item=>item.id===productPickerId)?.content.productId||'')||null} product={products[productPickerId==='@banner'?document.productId||'':String(document.elements.find(item=>item.id===productPickerId)?.content.productId)]} loadPage={loadProductPage} onSelect={product=>{if(!documentRef.current)return;if(productPickerId==='@banner'){rememberProduct(product);replace(bindBannerProduct(documentRef.current,product.id));}else{if(!documentRef.current.elements.some(item=>item.id===productPickerId&&item.type==='product'))return;rememberProduct(product);edit(next=>{next.elements.find(item=>item.id===productPickerId)!.content.productId=product.id;});}}}/>:null}
    <Dialog open={detachProductOpen} onOpenChange={setDetachProductOpen} title="Відв’язати товар" description="Оберіть, що зробити з товарними вставками, фото й посиланнями цього банера." footer={<><Button variant="secondary" onClick={()=>setDetachProductOpen(false)}>Скасувати</Button><Button variant="secondary" onClick={()=>{replace(detachBannerProduct(document,products,false));setDetachProductOpen(false);}}>Очистити товарні дані</Button><Button disabled={!products[document.productId||'']||bindingDiagnostics(document,products).length>0} onClick={()=>{replace(detachBannerProduct(document,products,true));setDetachProductOpen(false);}}>Залишити поточний контент</Button></>}><p className="builder-help">Поточний контент стане звичайним текстом, фото та посиланням. Подальші зміни каталогу його не оновлюватимуть. Очищення прибирає лише товарні вставки, зберігаючи решту тексту й оформлення.</p></Dialog>
    {productError?<p role="alert" className="builder-warning">{productError}</p>:null}
    <EditorPreview timerExpired={timerExpired} onTimerExpiredChange={document.elements.some(item=>item.type==='timer')?setTimerExpired:undefined} open={preview} onOpenChange={setPreview} title={document.name} device={previewDevice} onDeviceChange={setPreviewDevice} renderOverlay={renderPreview} modal={document[previewDevice].placement?.overlay!==false}/>
    <Dialog open={placementOpen} onOpenChange={setPlacementOpen} size="wide" compactHeader title="Розміщення банера" description="Перетягніть банер на схемі. Опорні точки — швидкі пресети; налаштування комп’ютера й телефона незалежні." footer={<Button onClick={()=>setPlacementOpen(false)}>Готово</Button>}>
      {placementOpen?<BannerPlacementEditor document={document} products={products} disabled={busy} onInteractionStart={beginColor} onInteractionEnd={endColor} onChange={(target,placement)=>{if(documentRef.current?.widgetId!==document.widgetId||documentRef.current?.shopId!==document.shopId)return;edit(next=>{if(placement)next[target].placement=placement;else delete next[target].placement;});}}/>:null}
    </Dialog>
    {formEditor ? <FormBuilderDialog open content={formEditor.element.content as FormContent} name={formEditor.name} device={device} onUploadFile={uploadRewardAsset} onUploadMedia={uploadMediaAsset} onOpenChange={open=>{if(!open){setFormEditor(null);requestAnimationFrame(()=>mainRef.current?.focus({preventScroll:true}));}}} onApply={(name,content,original)=>{const next=clone(documentRef.current!);const item=next.elements.find(item=>item.id===formEditor.element.id);if(!item)return 'Форму не знайдено';item.content=mergeFormConfiguration(item.content as unknown as FormContent,content,original);const form=next.forms.find(form=>form.id===content.formId);if(form)form.name=name;else next.forms.push({id:content.formId,name});try{enforceButtonMinimums(next,true,productsRef.current);}catch(failure){return failure instanceof Error?failure.message:'Форма завелика';}replace(next);setFormEditor(null);requestAnimationFrame(()=>mainRef.current?.focus({preventScroll:true}));}}/> : null}
    <Dialog open={exitOpen} onOpenChange={setExitOpen} title="Незбережені зміни" description="Зміни в чернетці ще не підтверджені сервером."><div className="product-actions"><Button variant="secondary" onClick={() => void save().then(saved => { if (saved) { setExitOpen(false); navigate(campaignLibrary); } })} disabled={busy} loading={busy}>Зберегти й вийти</Button><AppLink variant="secondary" href={campaignLibrary}>Вийти без збереження</AppLink></div>{error ? <p role="alert" className="builder-warning">{error}</p> : null}<p className="builder-help">Закрийте діалог, щоб продовжити редагування.</p></Dialog>
    {error ? <div className="builder-alert" role="alert"><strong>{conflict ? 'Конфлікт змін. Поточна чернетка не перезаписана.' : 'Дію не завершено.'}</strong> {error} {conflict ? <Button variant="secondary" onClick={() => void load()}>Відкрити актуальну версію</Button> : null}</div> : null}
    {phase === 'edit' ? <>
      <div className="builder-editor-screens">
      <div className="builder-design-screen" data-inactive={panel === 'rules'} inert={panel === 'rules'} aria-hidden={panel === 'rules' ? true : undefined}>
      <div className="builder-main">
        <aside className="builder-left" aria-label="Елементи та шари">
          <EditorSegments label="Панель елементів" value={leftTab} onValueChange={setLeftTab} items={[{ value: 'elements', label: 'Елементи' }, { value: 'layers', label: 'Шари' }]}/>
          {leftTab === 'elements' ? <div className="builder-palette">{paletteTypes.map(type => { const Icon = elementIcons[type]; return <EditorPaletteItem key={type} disabled={document.elements.length>=100 || type==='form' && document.forms.length>=20} label={names[type]} icon={<Icon size={24} strokeWidth={1.5}/>} onClick={() => add(type)}/>; })}</div> : null}
          {leftTab === 'layers' ? <Card className="builder-layers-card"><div className="builder-section-heading"><h2>Шари</h2><span>{document.elements.length}</span></div>{layerList}<Button variant="secondary" icon={<Plus size={19}/>} onClick={() => setLeftTab('elements')}>Додати елемент</Button></Card> : null}
        </aside>
        <div className="builder-workbench">
          <ContextMenu items={menuItems} finalFocus={mainRef} onContextMenu={event => { const node = event.nativeEvent.composedPath().find((target): target is HTMLElement => target instanceof HTMLElement && !!target.dataset.elementId); if (node && !selectedLeaves.includes(node.dataset.elementId!)) selectNode(canvasLayer(document,node.dataset.elementId!)); }}><section className="builder-stage" aria-label="Полотно конструктора">
            <div ref={setTextToolbar} className="builder-text-tools" hidden={!inlineEditorId}/>
            <div className="builder-viewport-slot"><EditorViewport ref={viewportRef} width={size!.width} height={size!.height} onScaleChange={setZoom} onMarqueeStart={startMarquee} onFilesDrop={dropImages} fileDropDisabled={busy || preview || exitOpen || !!formEditor || !!productPickerId || !!inlineEditorId} fileDropHint="На зображення — замінити; на полотно — додати" artboardLabel={`Поп-ап · ${size!.width} × ${size!.height}`} artboardResize={artboardResize}>
                <div className="builder-canvas-wrap" style={{ width: size!.width, height: size!.height }}>
                  <div ref={canvasRef} className="builder-canvas" style={{ width: size!.width, height: size!.height }}/>
                  {editingInline?.type==='text'?<InlineTextEditor key={`${editingInline.id}-${device}`} element={editingInline} device={device} toolbarTarget={textToolbar} productFieldsEnabled={!!document.productId&&!!products[document.productId]} onChange={content=>changeText(editingInline.id,content)} onFinish={finishInline}/>:editingInline?.type==='button'?<InlineButtonEditor key={`${editingInline.id}-${device}`} element={editingInline} device={device} toolbarTarget={textToolbar} onChange={content=>changeButton(editingInline.id,content)} onFinish={finishInline}/>:null}
                  {!document.elements.length ? <div className="builder-empty-canvas"><Layers3 size={32} strokeWidth={1}/><h2>Почніть із першого елемента</h2><p>Текст, зображення чи кнопка — оберіть у палітрі ліворуч.</p></div> : null}
                  {box&&!inlineEditorId&&!hasLocked ? <><div className="builder-guide-horizontal" aria-hidden="true" style={{top:box.y + box.height / 2}}/><div className="builder-guide-vertical" aria-hidden="true" style={{left:box.x + box.width / 2}}/>{selectedGroup ? <><EditorSelectionFrame box={box} label="Масштабувати групу" hint="Тягніть ручку для пропорційного масштабування. Стрілки змінюють розмір, Shift — 10 px, Escape скасовує drag." onResizeStart={(handle,event) => beginDrag(selectedGroup.id,handle,event)} onResizeKey={resizeKey}/>{document.elements.filter(item => selectedLeaves.includes(item.id)).map(item => <EditorSelectionOutline key={item.id} variant="member" box={(device === 'mobile' ? item.mobile : item.desktop) || item.desktop}/>)}</> : selectedLeaves.length === 1 && selected ? <EditorSelectionFrame box={box} rotation={elementRotation(selected,device)} variant={selected.type==='form'?'form':'default'} handles={selected.type==='product'||selected.type==='form'&&isZeroForm(selected.content)?['w','e']:selected.type==='text'?textHandles(selected.content,device):selected.type==='button'?buttonHandles(selected.content,device) as ResizeHandle[]|undefined:undefined} hint={selected.type==='form'?'Змінюється лише ширина. Висота визначається вмістом. Стрілки вліво/вправо, Shift — 10 px; Escape скасовує drag.':undefined} onResizeStart={(handle,event) => beginDrag(selected.id,handle,event)} onResizeKey={resizeKey}/> : <><EditorSelectionOutline box={box}/>{document.elements.filter(item => selectedLeaves.includes(item.id)).map(item => <EditorSelectionOutline key={item.id} variant="member" box={(device === 'mobile' ? item.mobile : item.desktop) || item.desktop}/>)}</>}</> : null}
                  {marqueeBox ? <EditorSelectionOutline variant="marquee" box={marqueeBox}/> : null}
                </div>
            </EditorViewport>{imageFeedback ? <div className="builder-image-feedback"><Card padding="none"><div className="builder-image-feedback-content"><p className="builder-help" role={imageFeedback.error ? 'alert' : 'status'}>{imageFeedback.message}</p><div className="builder-image-feedback-close"><IconButton label="Закрити повідомлення про зображення" variant="ghost" size="sm" icon={<X size={16}/>} onClick={()=>setImageFeedback(null)}/></div></div></Card></div> : null}</div>
          </section></ContextMenu>
          <aside className="builder-right" aria-label="Властивості">
            <div className="builder-properties-heading"><h2>Властивості</h2></div>
            <div className="builder-properties-scroll">
              <section className="builder-property-section" aria-label="Товар банера"><h3>Товар банера</h3>{document.productId?<><strong>{products[document.productId]?.name||'Товар недоступний'}</strong><p className="builder-help">{products[document.productId]?.article} · Спільний для текстів, кнопок і зображень.</p></>:<p className="builder-help">Прив’яжіть один товар, щоб використати його дані в елементах.</p>}<div className="builder-property-stack"><Button variant="secondary" disabled={busy||!!inlineEditorId} onClick={()=>setProductPickerId('@banner')}>{document.productId?'Замінити товар банера':'Прив’язати товар'}</Button>{document.productId?<Button variant="ghost" disabled={busy||!!inlineEditorId} onClick={()=>setDetachProductOpen(true)}>Відв’язати товар</Button>:null}</div></section>
              <section className="builder-property-section" aria-label="Закриття банера"><Switch label="Стандартна кнопка закриття" checked={document.showCloseButton !== false} disabled={busy || !!inlineEditorId} onCheckedChange={checked => edit(next => { next.showCloseButton = checked; })}/><p className="builder-help">Фіксований хрестик у правому верхньому куті банера. Спільний для комп’ютера й телефона.</p></section>
              <EditorSelectionCard title={selectedGroup?.name || (selectedLeaves.length > 1 ? `Вибрано: ${selectedLeaves.length}` : selected ? names[selected.type] : 'Полотно')} description={selectedLeaves.length > 1 ? `${selectedLeaves.length} елементів · ${selectedGroup ? 'Група' : 'Множинний вибір'}` : selected ? 'Вибраний елемент' : 'Налаштування поп-апа'} icon={<SelectionIcon size={25} strokeWidth={1.5}/>} action={selectionMenu}/>
              {selectedGroup || selectedLeaves.length > 1 ? <div className="builder-property-stack"><SelectionPositionProperties key={'position-'+device+selectedIds.join(',')} document={document} ids={selectedIds} device={device} disabled={hasLocked||busy} onChange={positionSelected}/><p className="builder-help">Вирівнювання: {selectionRoots(document,selectedIds).length > 1 ? 'відносно вибраних об’єктів' : 'відносно полотна'}.</p><EditorAlignmentControls label={selectionRoots(document,selectedIds).length > 1 ? 'Вирівнювання між елементами' : 'Вирівнювання на полотні'} disabled={hasLocked || busy} onAlign={alignSelected}/><EditorSpacingControls key={device+selectedIds.join(',')} x={spacingView?.axis==='x' ? spacingView : spacingPlan(document,selectedIds,device,'x')} y={spacingView?.axis==='y' ? spacingView : spacingPlan(document,selectedIds,device,'y')} disabled={hasLocked || busy} onInteractionStart={beginSpacing} onValueChange={changeSpacing} onInteractionEnd={endSpacing}/><p className="builder-help">{hasLocked ? 'Розблокуйте всі вибрані елементи для вирівнювання й зміни відступів.' : 'Горизонтальний відступ — між краями у рядах, вертикальний — у колонках. Від’ємне значення створює перекриття.'}</p><p className="builder-help">Переміщуйте вибрані елементи разом на полотні або стрілками. Ручки рамки групи масштабують усіх учасників пропорційно. Shift+клік на полотні додає або прибирає окремий елемент, зокрема всередині групи. Подвійний клік відкриває елемент; у шарах множинний вибір — Ctrl+клік.</p><Button variant="secondary" onClick={() => groupSelection()}>Згрупувати</Button><Button variant="secondary" onClick={() => groupSelection(true)}>Розгрупувати</Button><Button variant="secondary" icon={<Trash2 size={16}/>} onClick={removeSelected}>Видалити вибране</Button></div> : selected ? <ElementProperties key={selected.id} selected={selected} document={document} device={device} busy={busy} diagnostics={diagnostics} product={products[String(selected.content.productId)]} bannerProduct={products[document.productId||'']} productTimezone={shop?.timezone} onChooseProduct={()=>setProductPickerId(selected.id)} colorInteraction={{ onInteractionStart: beginColor, onInteractionEnd: endColor }} updateElement={updateElement} edit={edit} onUpload={file => void upload(file)} onEditForm={()=>openFormEditor(selected.id)} onEditText={()=>openInlineEditor(selected.id)} onEditButton={()=>openInlineEditor(selected.id)} onButtonStyleChange={(content,expected)=>changeButton(selected.id,content,expected)} onToggleLock={locked=>toggleLayerLock(selected.id,locked)} onTextStyleChange={content=>changeText(selected.id,content)} onUploadFormMedia={uploadMediaAsset} onUploadFormFile={uploadRewardAsset} stepView={formSteps[String(selected.content.formId)]??0} onStepViewChange={view=>setFormSteps(current=>({...current,[String(selected.content.formId)]:view}))} onShapeStyleChange={(content,expected)=>{
                const current=documentRef.current,target=current?.elements.find(item=>item.id===selected.id&&item.type==='shape');
                if(!current||!target||editorLocked(target)||(expected&&JSON.stringify(target.content)!==JSON.stringify(expected)))return 'Фігура змінилася під час дії. Спробуйте ще раз.';
                if(JSON.stringify(target.content)===JSON.stringify(content))return;
                const next=clone(current),item=next.elements.find(item=>item.id===selected.id)!;
                if((target.content.shape as {kind?:string}|undefined)?.kind!==content.shape?.kind&&content.shape?.kind){for(const box of [item.desktop,item.mobile].filter(Boolean) as Box[])box.height=content.shape.kind==='line'?5:box.width;}
                item.content=clone(content) as unknown as Record<string,unknown>;replace(next);
                if(documentRef.current!==next)return 'Налаштування не застосовано. Перевірте значення фігури.';
              }} onFormStyleChange={(content,expected)=>{
                const current=documentRef.current,target=current?.elements.find(item=>item.id===selected.id&&item.type==='form');
                if(!current||!target||editorLocked(target)||(expected&&JSON.stringify(target.content)!==JSON.stringify(expected)))return 'Форма змінилася під час дії. Спробуйте ще раз.';
                if(JSON.stringify(target.content)===JSON.stringify(content))return;
                const next=clone(current);next.elements.find(item=>item.id===selected.id)!.content=clone(content) as unknown as Record<string,unknown>;replace(next);
                if(documentRef.current!==next)return 'Налаштування не застосовано. Перевірте розміри форми.';
              }}/> : <div className="builder-property-stack"><Field label="Назва банера"><TextInput value={document.name} maxLength={100} onChange={event => edit(next => { next.name = event.target.value; })}/></Field><section className="builder-property-section"><h3>Розмір полотна</h3><div className="builder-property-grid"><Field label="Ширина полотна"><NumberInput min={320} value={canvasFieldValue('width')} onChange={event => changeCanvasField('width', event.target.value)} onBlur={() => setCanvasInput(null)}/></Field><Field label="Висота полотна"><NumberInput min={240} max={2000} value={canvasFieldValue('height')} onChange={event => changeCanvasField('height', event.target.value)} onBlur={() => setCanvasInput(null)}/></Field></div></section><ColorInput onInteractionStart={beginColor} onInteractionEnd={endColor} label="Фон полотна" value={document[device].background} onValueChange={value => edit(next => { next[device].background = value; })}/><SurfaceProperties colorInteraction={{ onInteractionStart: beginColor, onInteractionEnd: endColor }} composition={document[device]} onChange={patch => edit(next => { Object.assign(next[device], patch); })}/><p className="builder-help">Оберіть елемент, щоб налаштувати його вміст, дію та оформлення.</p></div>}
            </div>
            <div className="builder-properties-footer">{panel === 'element' ? closeWarning : null}<Button variant="secondary" icon={<Monitor size={17}/>} disabled={busy||!!inlineEditorId} onClick={()=>setPlacementOpen(true)}>Розміщення банера<ChevronRight size={16}/></Button><div ref={rulesTrigger} className="builder-rules-entry"><Button variant="secondary" icon={<SlidersHorizontal size={17}/>} disabled={busy||!!inlineEditorId} onClick={() => setPanel('rules')}>Правила показу<ChevronRight size={16}/></Button></div></div>
          </aside>
        </div>
      </div>
      <footer className="builder-footer"><span className="builder-footer-context"><Info size={16}/>{footerDiagnostics.length || (!document.elements.length && !closeControlMissing) ? <span title={footerDiagnostics.map(item => item.message).join(' · ')} className="builder-diagnostics" role="status">Публікацію заблоковано: {footerDiagnostics.length ? footerDiagnostics.map(item => item.message).join(' · ') : 'Додайте елемент до банера'}</span> : <span>{document.elements.length} елементів · {device === 'mobile' ? 'Мобільна версія' : 'Комп’ютер'}</span>}</span><EditorZoomControl value={zoom} onValueChange={value => viewportRef.current?.setScale(value)} onFit={() => viewportRef.current?.fit()}/><span className="builder-footer-hint">Колесо — масштаб · Затиснуте колесо — переміщення</span></footer>
      </div>
      {panel === 'rules' ? <DisplayRulesScreen document={document} timezone={document.timezone || shop?.timezone || 'Europe/Kyiv'} update={replace} onBack={() => setPanel('element')} warning={closeWarning}/> : null}
      </div>
    </> : <PublicationView mode={phase} widget={widget} document={document} products={products} shop={shop} busy={busy} onEdit={() => setPhase('edit')} onPublish={() => void publish()} onPause={() => void pause()}/>}
  </section>;
}
