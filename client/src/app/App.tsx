import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppShell } from '../components/AppShell';
import { LoadingScreen } from '../components/LoadingScreen';
import { ServiceUnavailableScreen } from '../components/ServiceUnavailableScreen';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { TasksPage } from '../pages/TasksPage';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { AdminIntegrationsPage } from '../pages/AdminIntegrationsPage';
import { AdminBackupsPage } from '../pages/AdminBackupsPage';
import { BannerWorkspaceProvider } from '../workspace/BannerWorkspaceContext';
import { BannerBuilderPage } from '../pages/BannerBuilderPage';
import { ProductSelectionPage } from '../pages/ProductSelectionPage';
import { ToolsPage } from '../pages/ToolsPage';
import { ToolAccessRoute } from '../components/ToolAccessRoute';
import { BlogPublicationsPage } from '../pages/BlogPublicationsPage';

const ProductTablesPage = lazy(() => import('../pages/ProductTablesPage').then((module) => ({
  default: module.ProductTablesPage
})));
const ChatPage = lazy(() => import('../pages/ChatPage').then((module) => ({
  default: module.ChatPage
})));
const ApplicationsPage = lazy(() => import('../pages/ApplicationsPage').then((module) => ({
  default: module.ApplicationsPage
})));
const FormsBuilderPage = lazy(() => import('../pages/FormsBuilderPage').then((module) => ({
  default: module.FormsBuilderPage
})));
const UsedSmartphonesCatalogPage = lazy(() => import('../pages/UsedSmartphonesCatalogPage').then((module) => ({
  default: module.UsedSmartphonesCatalogPage
})));
const CatalogCharacteristicsPage = lazy(() => import('../pages/CatalogCharacteristicsPage').then((module) => ({
  default: module.CatalogCharacteristicsPage
})));
const CatalogBrandsPage = lazy(() => import('../pages/CatalogBrandsPage').then((module) => ({
  default: module.CatalogBrandsPage
})));
const CatalogWorkspacePage = lazy(() => import('../pages/CatalogWorkspacePage').then((module) => ({
  default: module.CatalogWorkspacePage
})));
const CatalogStorefrontSettingsPage = lazy(() => import('../pages/CatalogStorefrontSettingsPage').then((module) => ({
  default: module.CatalogStorefrontSettingsPage
})));
const CatalogProductCardSettingsPage = lazy(() => import('../pages/CatalogProductCardSettingsPage').then((module) => ({
  default: module.CatalogProductCardSettingsPage
})));
const CatalogProductPageSettingsPage = lazy(() => import('../pages/CatalogProductPageSettingsPage').then((module) => ({
  default: module.CatalogProductPageSettingsPage
})));
const CatalogAuditPage = lazy(() => import('../pages/CatalogAuditPage').then((module) => ({
  default: module.CatalogAuditPage
})));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((module) => ({
  default: module.ProfilePage
})));

function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'unavailable') return <ServiceUnavailableScreen />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function AnonymousRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'unavailable') return <ServiceUnavailableScreen />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

function AccessManagementRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin' && !user?.canManageToolAccess) return <Navigate to="/" replace />;
  return <Outlet />;
}

function AdminOnlyRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

function WorkspaceShell() {
  return <BannerWorkspaceProvider><AppShell /></BannerWorkspaceProvider>;
}

function CatalogLegacyRedirect() {
  const location = useLocation();
  return <Navigate to={`/catalog/products${location.search}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<AnonymousRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<ToolAccessRoute tool="used_smartphones_catalog" />}>
          <Route path="tools/used-smartphones" element={<CatalogLegacyRedirect />} />
          <Route path="catalog" element={<Suspense fallback={<LoadingScreen />}><CatalogWorkspacePage /></Suspense>}>
            <Route index element={<Navigate to="products" replace />} />
            <Route path="products" element={<Suspense fallback={<LoadingScreen />}><UsedSmartphonesCatalogPage /></Suspense>} />
            <Route path="imports" element={<Navigate to="/catalog/audit?source=xlsx" replace />} />
            <Route path="brands" element={<Suspense fallback={<LoadingScreen />}><CatalogBrandsPage /></Suspense>} />
            <Route path="characteristics" element={<Suspense fallback={<LoadingScreen />}><CatalogCharacteristicsPage /></Suspense>} />
            <Route path="filters" element={<Navigate to="characteristics" replace />} />
            <Route path="storefront" element={<Suspense fallback={<LoadingScreen />}><CatalogStorefrontSettingsPage /></Suspense>} />
            <Route path="product-card" element={<Suspense fallback={<LoadingScreen />}><CatalogProductCardSettingsPage /></Suspense>} />
            <Route path="product-page" element={<Suspense fallback={<LoadingScreen />}><CatalogProductPageSettingsPage /></Suspense>} />
            <Route path="preview" element={<Navigate to="/catalog/storefront" replace />} />
            <Route path="audit" element={<Suspense fallback={<LoadingScreen />}><CatalogAuditPage /></Suspense>} />
          </Route>
        </Route>
        <Route element={<WorkspaceShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="profile" element={<Suspense fallback={<LoadingScreen />}><ProfilePage /></Suspense>} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/chat" element={<Navigate to="/chat" replace />} />
          <Route element={<ToolAccessRoute tool="banner_grid" />}>
            <Route path="tools/banner-grid" element={<BannerBuilderPage />} />
            <Route path="tools/saved-grids" element={<Navigate to="/tools/banner-grid?tab=grids" replace />} />
            <Route path="tools/saved-banners" element={<Navigate to="/tools/banner-grid?tab=banners" replace />} />
          </Route>
          <Route element={<ToolAccessRoute tool="product_selection" />}>
            <Route path="tools/product-selection" element={<ProductSelectionPage />} />
          </Route>
          <Route element={<ToolAccessRoute tool="product_tables" />}>
            <Route path="tools/product-tables" element={<Suspense fallback={<LoadingScreen />}><ProductTablesPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="blog_publications" />}>
            <Route path="tools/blog-publications" element={<BlogPublicationsPage />} />
          </Route>
          <Route element={<ToolAccessRoute tool="applications" />}>
            <Route path="tools/applications" element={<Suspense fallback={<LoadingScreen />}><ApplicationsPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="form_builder" />}>
            <Route path="tools/forms" element={<Suspense fallback={<LoadingScreen />}><FormsBuilderPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="chat" />}>
            <Route path="chat" element={<Suspense fallback={<LoadingScreen />}><ChatPage /></Suspense>} />
          </Route>
          <Route element={<AccessManagementRoute />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
          <Route element={<AdminOnlyRoute />}>
            <Route path="admin/integrations" element={<AdminIntegrationsPage />} />
            <Route path="admin/backups" element={<AdminBackupsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
