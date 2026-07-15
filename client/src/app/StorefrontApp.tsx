import { Navigate, Route, Routes } from 'react-router-dom';
import { StorefrontPage } from '../pages/StorefrontPage';

export function StorefrontApp() {
  return (
    <Routes>
      <Route path="/storefront" element={<StorefrontPage />} />
      <Route path="/storefront/smartphones/:slug" element={<StorefrontPage />} />
      <Route path="/catalog/preview/storefront" element={<StorefrontPage preview />} />
      <Route path="/catalog/preview/storefront/smartphones/:slug" element={<StorefrontPage preview />} />
      <Route path="*" element={<Navigate to="/storefront" replace />} />
    </Routes>
  );
}
