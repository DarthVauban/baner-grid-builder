import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../lib/api';
import type { ApplicationFormInput, ApplicationFormPreviewPayload } from '../types/application';
import { Icon } from './Icon';

type PreviewViewport = 'desktop' | 'mobile';
type PreviewState = 'form' | 'success';

function previewDocument(payload: ApplicationFormPreviewPayload, viewport: PreviewViewport, previewState: PreviewState) {
  const serializedPayload = JSON.stringify(payload)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&#60;');
  const origin = window.location.origin.replaceAll('"', '&quot;');
  return `<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<base href="${origin}/"><style>
*{box-sizing:border-box}html,body{width:100%;min-height:100%;margin:0}body{min-height:100vh;overflow:hidden;background:#f6f7f9;color:#172033;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
.store{min-height:100vh;background:#fff}.topline{height:26px;background:#121212}.header{display:flex;align-items:center;gap:24px;height:82px;padding:0 6%;border-bottom:1px solid #e7e9ee}.catalog{width:112px;height:38px;border-radius:11px;background:#ffe000}.search{width:min(290px,28vw);height:34px;border:1px solid #d8dde7;border-radius:999px}.logo{width:132px;height:29px;margin:auto;border-radius:8px;background:#171717}.icons{display:flex;gap:10px}.icons i{width:28px;height:28px;border:2px solid #30333a;border-radius:50%}.breadcrumbs{display:flex;gap:8px;padding:30px 9% 0}.breadcrumbs i{width:58px;height:7px;border-radius:6px;background:#e0e4eb}.product{display:grid;grid-template-columns:minmax(240px,1fr) minmax(260px,.82fr);gap:7%;padding:34px 9%}.photo{aspect-ratio:1.08;border-radius:22px;background:linear-gradient(140deg,#eeecff,#dfe8f7)}.copy{display:grid;align-content:start;gap:15px;padding-top:5%}.copy b,.copy span{display:block;border-radius:8px;background:#d5dae4}.copy b{width:90%;height:24px}.copy span{width:67%;height:10px}.copy span.short{width:42%}.price{width:128px;height:31px;margin-top:11px;border-radius:8px;background:#ef2636}.buy{width:100%;height:48px;margin-top:8px;border-radius:12px;background:#ffe000}
@media(max-width:600px){.topline{height:20px}.header{height:60px;padding:0 18px}.catalog{width:40px}.search{display:none}.logo{width:88px;height:22px}.icons i:nth-child(n+3){display:none}.breadcrumbs{padding:20px 18px 0}.product{grid-template-columns:1fr;gap:24px;padding:24px 18px}.photo{aspect-ratio:1.25}.copy{padding:0}.copy b{height:19px}.buy{height:44px}}
</style></head><body><div class="store" aria-hidden="true"><div class="topline"></div><div class="header"><div class="catalog"></div><div class="search"></div><div class="logo"></div><div class="icons"><i></i><i></i><i></i><i></i></div></div><div class="breadcrumbs"><i></i><i></i><i></i></div><div class="product"><div class="photo"></div><div class="copy"><b></b><span></span><span class="short"></span><div class="price"></div><div class="buy"></div></div></div></div>
<script src="/api/public/application-forms/loader.js" data-mt-application-loader="true" data-preview-payload="${serializedPayload}" data-preview-device="${viewport}" data-preview-state="${previewState}"></script>
</body></html>`;
}

export function ApplicationFormLivePreview({ input }: { input: ApplicationFormInput }) {
  const [viewport, setViewport] = useState<PreviewViewport>('desktop');
  const [previewState, setPreviewState] = useState<PreviewState>('form');
  const [fullscreen, setFullscreen] = useState(false);
  const [payload, setPayload] = useState<ApplicationFormPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void api.forms.preview(input, controller.signal).then((result) => {
        if (!controller.signal.aborted) setPayload(result);
      }).catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Не вдалося побудувати прев’ю.');
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input]);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const fullscreenButton = fullscreenButtonRef.current;
    const background = Array.from(document.body.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== previewRef.current)
      .map((node) => ({ node, inert: node.inert }));
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); };
    document.body.style.overflow = 'hidden';
    for (const { node } of background) node.inert = true;
    document.addEventListener('keydown', closeOnEscape);
    fullscreenButton?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const { node, inert } of background) node.inert = inert;
      document.removeEventListener('keydown', closeOnEscape);
      fullscreenButton?.focus({ preventScroll: true });
    };
  }, [fullscreen]);

  const documentSource = useMemo(
    () => payload ? previewDocument(payload, viewport, previewState) : '',
    [payload, previewState, viewport]
  );

  useEffect(() => {
    if (!fullscreen) return undefined;
    const iframe = iframeRef.current;
    let frameDocument: Document | null = null;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false); };
    const bindFrame = () => {
      frameDocument?.removeEventListener('keydown', closeOnEscape);
      frameDocument = iframe?.contentDocument || null;
      frameDocument?.addEventListener('keydown', closeOnEscape);
    };
    iframe?.addEventListener('load', bindFrame);
    bindFrame();
    return () => {
      iframe?.removeEventListener('load', bindFrame);
      frameDocument?.removeEventListener('keydown', closeOnEscape);
    };
  }, [documentSource, fullscreen]);

  const preview = <div
    ref={previewRef}
    className={`form-live-preview${fullscreen ? ' is-fullscreen' : ''}`}
    role={fullscreen ? 'dialog' : undefined}
    aria-modal={fullscreen || undefined}
    aria-label={fullscreen ? 'Повноекранний перегляд форми' : undefined}
  >
    <header>
      <div><strong>Живий перегляд</strong><small>Реальний storefront-runtime форми</small></div>
      <div className="form-preview-toolbar">
        <div className="form-preview-state" role="group" aria-label="Стан форми у попередньому перегляді">
          <button type="button" className={previewState === 'form' ? 'is-active' : ''} onClick={() => setPreviewState('form')} aria-pressed={previewState === 'form'}>Форма</button>
          <button type="button" className={previewState === 'success' ? 'is-active' : ''} onClick={() => setPreviewState('success')} aria-pressed={previewState === 'success'}>Після надсилання</button>
        </div>
        <div className="form-preview-device" role="group" aria-label="Розмір попереднього перегляду">
          <button type="button" className={viewport === 'desktop' ? 'is-active' : ''} onClick={() => setViewport('desktop')} aria-label="Комп’ютер" aria-pressed={viewport === 'desktop'}><Icon name="monitor" size={16} /><span>Десктоп</span></button>
          <button type="button" className={viewport === 'mobile' ? 'is-active' : ''} onClick={() => setViewport('mobile')} aria-label="Телефон" aria-pressed={viewport === 'mobile'}><Icon name="phone" size={16} /><span>Мобільний</span></button>
        </div>
        <button ref={fullscreenButtonRef} className="form-preview-fullscreen" type="button" onClick={() => setFullscreen((value) => !value)} aria-label={fullscreen ? 'Закрити повноекранний перегляд' : 'Відкрити прев’ю на весь екран'}>
          <Icon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} size={18} />
          <span>{fullscreen ? 'Вийти' : 'На весь екран'}</span>
        </button>
      </div>
    </header>
    <div className={`form-runtime-preview is-${viewport}`}>
      {payload && <iframe ref={iframeRef} title="Живий перегляд форми" srcDoc={documentSource} sandbox="allow-scripts allow-same-origin" />}
      {!payload && !error && <div className="form-runtime-preview__state">Готуємо точне прев’ю…</div>}
      {error && <div className="form-runtime-preview__state is-error"><Icon name="deadline" size={22} /><span>{error}</span></div>}
      {loading && payload && <span className="form-runtime-preview__refresh">Оновлюємо…</span>}
    </div>
  </div>;

  return fullscreen ? createPortal(preview, document.body) : preview;
}
