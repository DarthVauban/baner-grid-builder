import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StoreMapLocationPreviewApp, StoreMapRegistrationApp } from './app/StoreMapRegistrationApp';
import './styles/store-map-registration.css';

const root = document.getElementById('store-map-registration-root');
if (root) {
  const preview = window.location.pathname === '/store-map/location-preview';
  document.body.classList.toggle('store-registration-preview', preview);
  createRoot(root).render(<StrictMode>{preview ? <StoreMapLocationPreviewApp /> : <StoreMapRegistrationApp />}</StrictMode>);
}
