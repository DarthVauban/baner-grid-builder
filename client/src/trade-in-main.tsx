import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { TradeInPublicApp } from './app/TradeInPublicApp';
import './styles/trade-in-entry.css';
import './styles/trade-in-public.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false
    }
  }
});

createRoot(document.getElementById('trade-in-root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TradeInPublicApp />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
