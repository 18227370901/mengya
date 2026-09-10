import { Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import RequireAuth from "./layouts/RequireAuth";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import TimelinePage from "./pages/TimelinePage";
import TimelineDetailPage from "./pages/TimelineDetailPage";
import ProductListPage from "./pages/ProductListPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import ComparePage from "./pages/ComparePage";
import ShoppingListPage from "./pages/ShoppingListPage";
import ShoppingListDetailPage from "./pages/ShoppingListDetailPage";
import GenerateShoppingListPage from "./pages/GenerateShoppingListPage";
import BabyShoppingDetailPage from "./pages/BabyShoppingDetailPage";
import HealthPage from "./pages/HealthPage";
import AIAssistantPage from "./pages/AIAssistantPage";
import ProfilePage from "./pages/ProfilePage";
import AIConfigPage from "./pages/AIConfigPage";
import RegistrationManagePage from "./pages/RegistrationManagePage";
import ProductAdminPage from "./pages/ProductAdminPage";
import UserManagePage from "./pages/UserManagePage";
import AuditLogPage from "./pages/AuditLogPage";
import BrandListPage from "./pages/BrandListPage";
import BrandDetailPage from "./pages/BrandDetailPage";
import PregnancyWeeklyPage from "./pages/PregnancyWeeklyPage";
import PregnancyRecipePage from "./pages/PregnancyRecipePage";
import KidsEncyclopediaPage from "./pages/KidsEncyclopediaPage";
import FetalStoryPage from "./pages/FetalStoryPage";
import NotificationPage from "./pages/NotificationPage";
import FavoritePage from "./pages/FavoritePage";
import NotFoundPage from "./pages/NotFoundPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/weekly" element={<PregnancyWeeklyPage />} />
        <Route path="/recipes" element={<PregnancyRecipePage />} />
        <Route path="/kids-encyclopedia" element={<KidsEncyclopediaPage />} />
        <Route path="/timeline/:id" element={<TimelineDetailPage />} />
        <Route path="/products" element={<ProductListPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/shopping-list" element={<ShoppingListPage />} />
        <Route path="/shopping-list/generate" element={<GenerateShoppingListPage />} />
        <Route path="/shopping-list/ref/:id" element={<BabyShoppingDetailPage />} />
        <Route path="/shopping-list/:id" element={<ShoppingListDetailPage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings/ai" element={<AIConfigPage />} />
        <Route path="/admin/registration" element={<RegistrationManagePage />} />
        <Route path="/admin/products" element={<ProductAdminPage />} />
        <Route path="/admin/users" element={<UserManagePage />} />
        <Route path="/admin/audit-logs" element={<AuditLogPage />} />
        <Route path="/brands" element={<BrandListPage />} />
        <Route path="/brands/:id" element={<BrandDetailPage />} />
        <Route path="/fetal-stories" element={<FetalStoryPage />} />
        <Route path="/notifications" element={<NotificationPage />} />
        <Route path="/favorites" element={<FavoritePage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}