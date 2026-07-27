import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { TradeInPublicPage } from '../components/trade-in/TradeInPublicPage';
import { api } from '../lib/api';

export function TradeInPublicApp() {
  const location = useLocation();
  const preview = location.pathname.startsWith('/trade-in/preview');
  const settings = useQuery({
    queryKey: ['trade-in-public-settings', preview],
    queryFn: preview ? api.tradeIn.previewSettings : api.tradeIn.publicSettings,
    retry: false
  });

  if (settings.isLoading) {
    return <main className="ti-state"><span className="ti-state__loader" /><h1>Завантажуємо Trade-in</h1></main>;
  }
  if (settings.error || !settings.data) {
    return <main className="ti-state"><strong>MT</strong><h1>Сторінка Trade-in тимчасово недоступна</h1><p>{settings.error instanceof Error ? settings.error.message : 'Спробуйте оновити сторінку пізніше.'}</p></main>;
  }
  return (
    <TradeInPublicPage
      config={settings.data.config}
      preview={preview}
      onSubmit={(values) => api.tradeIn.submitApplication({
        values,
        context: {
          sourceUrl: window.location.href,
          pageTitle: settings.data.config.seo.title,
          referrer: document.referrer,
          ...Object.fromEntries(new URLSearchParams(window.location.search))
        },
        idempotencyKey: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`
      })}
    />
  );
}
