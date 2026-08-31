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
const CatalogArchivePage = lazy(() => import('../pages/CatalogArchivePage').then((module) => ({
  default: module.CatalogArchivePage
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
const CatalogHeaderFooterSettingsPage = lazy(() => import('../pages/CatalogHeaderFooterSettingsPage').then((module) => ({
  default: module.CatalogHeaderFooterSettingsPage
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
const CatalogPhotoParserPage = lazy(() => import('../pages/CatalogPhotoParserPage').then((module) => ({
  default: module.CatalogPhotoParserPage
})));
const CatalogPhotoParserSettingsPage = lazy(() => import('../pages/CatalogPhotoParserSettingsPage').then((module) => ({
  default: module.CatalogPhotoParserSettingsPage
})));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((module) => ({
  default: module.ProfilePage
})));
const AdminSystemPage = lazy(() => import('../pages/AdminSystemPage').then((module) => ({
  default: module.AdminSystemPage
})));
const TradeInWorkspacePage = lazy(() => import('../pages/TradeInWorkspacePage').then((module) => ({
  default: module.TradeInWorkspacePage
})));
const TradeInOverviewPage = lazy(() => import('../pages/TradeInOverviewPage').then((module) => ({
  default: module.TradeInOverviewPage
})));
const TradeInBuilderPage = lazy(() => import('../pages/TradeInBuilderPage').then((module) => ({
  default: module.TradeInBuilderPage
})));
const StoreMapPage = lazy(() => import('../pages/StoreMapPage').then((module) => ({
  default: module.StoreMapPage
})));
const BlogPostEditorPage = lazy(() => import('../pages/BlogPostEditorPage').then((module) => ({
  default: module.BlogPostEditorPage
})));
const MediaLibraryPage = lazy(() => import('../pages/MediaLibraryPage').then((module) => ({
  default: module.MediaLibraryPage
})));
const FacebookPublicationsPage = lazy(() => import('../pages/FacebookPublicationsPage').then((module) => ({
  default: module.FacebookPublicationsPage
})));
const HoroshopRelatedProductsPage = lazy(() => import('../pages/HoroshopRelatedProductsPage').then((module) => ({
  default: module.HoroshopRelatedProductsPage
})));
const HoroshopPhotoParserPage = lazy(() => import('../pages/HoroshopPhotoParserPage').then((module) => ({
  default: module.HoroshopPhotoParserPage
})));
const OnlineSupportPage = lazy(() => import('../pages/OnlineSupportPage').then((module) => ({
  default: module.OnlineSupportPage
})));
const PopupBannersPage = lazy(() => import('../pages/PopupBannersPage').then((module) => ({
  default: module.PopupBannersPage
})));
const HoroshopCatalogMenuPage = lazy(() => import('../pages/HoroshopCatalogMenuPage').then((module) => ({
  default: module.HoroshopCatalogMenuPage
})));
const HoroshopCartThemePage = lazy(() => import('../pages/HoroshopCartThemePage').then((module) => ({
  default: module.HoroshopCartThemePage
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
            <Route path="archive" element={<Suspense fallback={<LoadingScreen />}><CatalogArchivePage /></Suspense>} />
            <Route path="imports" element={<Navigate to="/catalog/audit?source=xlsx" replace />} />
            <Route path="brands" element={<Suspense fallback={<LoadingScreen />}><CatalogBrandsPage /></Suspense>} />
            <Route path="characteristics" element={<Suspense fallback={<LoadingScreen />}><CatalogCharacteristicsPage /></Suspense>} />
            <Route path="filters" element={<Navigate to="characteristics" replace />} />
            <Route path="storefront" element={<Suspense fallback={<LoadingScreen />}><CatalogStorefrontSettingsPage /></Suspense>} />
            <Route path="header-footer" element={<Suspense fallback={<LoadingScreen />}><CatalogHeaderFooterSettingsPage /></Suspense>} />
            <Route path="product-card" element={<Suspense fallback={<LoadingScreen />}><CatalogProductCardSettingsPage /></Suspense>} />
            <Route path="product-page" element={<Suspense fallback={<LoadingScreen />}><CatalogProductPageSettingsPage /></Suspense>} />
            <Route path="photo-parser" element={<Suspense fallback={<LoadingScreen />}><CatalogPhotoParserPage /></Suspense>} />
            <Route path="photo-parser/settings" element={<Suspense fallback={<LoadingScreen />}><CatalogPhotoParserSettingsPage /></Suspense>} />
            <Route path="preview" element={<Navigate to="/catalog/storefront" replace />} />
            <Route path="audit" element={<Suspense fallback={<LoadingScreen />}><CatalogAuditPage /></Suspense>} />
          </Route>
        </Route>
        <Route element={<ToolAccessRoute tool="trade_in" />}>
          <Route path="trade-in" element={<Suspense fallback={<LoadingScreen />}><TradeInWorkspacePage /></Suspense>}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<Suspense fallback={<LoadingScreen />}><TradeInOverviewPage /></Suspense>} />
            <Route path="editor" element={<Suspense fallback={<LoadingScreen />}><TradeInBuilderPage /></Suspense>} />
            <Route path="prototype" element={<Navigate to="../editor" replace />} />
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
          <Route element={<ToolAccessRoute tool="blog_publications" />}>
            <Route path="tools/blog-publications" element={<BlogPublicationsPage />} />
            <Route path="tools/blog-publications/media" element={<Suspense fallback={<LoadingScreen />}><MediaLibraryPage /></Suspense>} />
            <Route path="tools/blog-publications/:publicationId/editor" element={<Suspense fallback={<LoadingScreen />}><BlogPostEditorPage /></Suspense>} />
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
          <Route element={<ToolAccessRoute tool="store_map" />}>
            <Route path="tools/store-map" element={<Suspense fallback={<LoadingScreen />}><StoreMapPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="facebook_group_publications" />}>
            <Route path="tools/facebook-publications" element={<Suspense fallback={<LoadingScreen />}><FacebookPublicationsPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="horoshop_related_products" />}>
            <Route path="tools/horoshop-related-products" element={<Suspense fallback={<LoadingScreen />}><HoroshopRelatedProductsPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="horoshop_photo_parser" />}>
            <Route path="tools/horoshop-photo-parser" element={<Suspense fallback={<LoadingScreen />}><HoroshopPhotoParserPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="online_support" />}>
            <Route path="tools/online-support" element={<Suspense fallback={<LoadingScreen />}><OnlineSupportPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="popup_banners" />}>
            <Route path="tools/popup-banners" element={<Suspense fallback={<LoadingScreen />}><PopupBannersPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="horoshop_catalog_menu" />}>
            <Route path="tools/horoshop-catalog-menu" element={<Suspense fallback={<LoadingScreen />}><HoroshopCatalogMenuPage /></Suspense>} />
          </Route>
          <Route element={<ToolAccessRoute tool="horoshop_cart_theme" />}>
            <Route path="tools/horoshop-cart-theme" element={<Suspense fallback={<LoadingScreen />}><HoroshopCartThemePage /></Suspense>} />
          </Route>
          <Route element={<AccessManagementRoute />}>
            <Route path="admin/users" element={<AdminUsersPage />} />
          </Route>
          <Route element={<AdminOnlyRoute />}>
            <Route path="admin/system" element={<Suspense fallback={<LoadingScreen />}><AdminSystemPage /></Suspense>} />
            <Route path="admin/integrations" element={<AdminIntegrationsPage />} />
            <Route path="admin/backups" element={<AdminBackupsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
