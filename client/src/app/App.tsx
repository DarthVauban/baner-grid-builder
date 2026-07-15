import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppShell } from '../components/AppShell';
import { LoadingScreen } from '../components/LoadingScreen';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { TasksPage } from '../pages/TasksPage';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { AdminIntegrationsPage } from '../pages/AdminIntegrationsPage';
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
const StorefrontPage = lazy(() => import('../pages/StorefrontPage').then((module) => ({
  default: module.StorefrontPage
})));
const FormsBuilderPage = lazy(() => import('../pages/FormsBuilderPage').then((module) => ({
  default: module.FormsBuilderPage
})));
const UsedSmartphonesCatalogPage = lazy(() => import('../pages/UsedSmartphonesCatalogPage').then((module) => ({
  default: module.UsedSmartphonesCatalogPage
})));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((module) => ({
  default: module.ProfilePage
})));

function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function AnonymousRoute() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingScreen />;
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

export function App() {
  return (
    <Routes>
      <Route path="/storefront" element={<Suspense fallback={<LoadingScreen />}><StorefrontPage /></Suspense>} />
      <Route path="/storefront/smartphones/:slug" element={<Suspense fallback={<LoadingScreen />}><StorefrontPage /></Suspense>} />

      <Route element={<AnonymousRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
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
          <Route element={<ToolAccessRoute tool="used_smartphones_catalog" />}>
            <Route path="tools/used-smartphones" element={<Suspense fallback={<LoadingScreen />}><UsedSmartphonesCatalogPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="chat" />}>
            <Route path="chat" element={<Suspense fallback={<LoadingScreen />}><ChatPage /></Suspense>} />
          </Route>
          <Route element={<AccessManagementRoute />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
          <Route element={<AdminOnlyRoute />}>
            <Route path="admin/integrations" element={<AdminIntegrationsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
