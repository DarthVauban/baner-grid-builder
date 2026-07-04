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
import { BannerWorkspaceProvider } from '../workspace/BannerWorkspaceContext';
import { BannerBuilderPage } from '../pages/BannerBuilderPage';
import { ProductSelectionPage } from '../pages/ProductSelectionPage';
import { ToolsPage } from '../pages/ToolsPage';
import { ToolAccessRoute } from '../components/ToolAccessRoute';
import { BlogPublicationsPage } from '../pages/BlogPublicationsPage';

const ProductTablesPage = lazy(() => import('../pages/ProductTablesPage').then((module) => ({
  default: module.ProductTablesPage
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

function AdminRoute() {
  const { user } = useAuth();
  if (user?.role !== 'admin' && !user?.canManageToolAccess) return <Navigate to="/" replace />;
  return <Outlet />;
}

function WorkspaceShell() {
  return <BannerWorkspaceProvider><AppShell /></BannerWorkspaceProvider>;
}

export function App() {
  return (
    <Routes>
      <Route element={<AnonymousRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<WorkspaceShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tools" element={<ToolsPage />} />
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
          <Route element={<AdminRoute />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
