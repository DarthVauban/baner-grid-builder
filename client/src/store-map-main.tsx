import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreMapPublicApp } from './app/StoreMapPublicApp';
import './styles/store-map-public.css';

const root = document.getElementById('store-map-root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <StoreMapPublicApp />
    </StrictMode>
  );
}
