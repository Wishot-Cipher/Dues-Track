import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MultiTenantAuthProvider } from '@/hooks/useMultiTenantAuth';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import OrgProtectedRoute from '@/components/auth/OrgProtectedRoute';
import OrgLayout from '@/components/layout/OrgLayout';
import OfflineIndicator from '@/components/OfflineIndicator';
import InstallPWA from '@/components/InstallPWA';
import UpdateNotification from '@/components/UpdateNotification';

// Pages
import DashboardPage from '@/pages/DashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/student/SettingsPage';
import PaymentHistoryPage from '@/pages/student/PaymentHistoryPage';
import PaymentDetailPage from '@/pages/PaymentDetailPage';
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import CreatePaymentTypePage from '@/pages/admin/CreatePaymentTypePage';
import ManageDuesPage from '@/pages/admin/ManageDuesPage';
import AdminReviewPage from '@/pages/admin/AdminReviewPage';
import WaivePaymentPage from '@/pages/admin/WaivePaymentPage';
import ScanQRCodePage from '@/pages/admin/ScanQRCodePageNew';
import OrgMembersPage from '@/pages/admin/OrgMembersPage';
import AdminCollectedPage from '@/pages/admin/AdminCollectedPage';
import ExpensesPage from '@/pages/admin/ExpensesPage';
import PublicContributionsPage from '@/pages/admin/PublicContributionsPage';
import DonationSettingsPage from '@/pages/admin/DonationSettingsPage';
import BillingPage from '@/pages/admin/BillingPage';
import ContributePage from '@/pages/ContributePage';
import NotFoundPage from '@/pages/NotFoundPage';

// Multi-Tenant Pages (public / onboarding)
import LandingPage from '@/pages/LandingPage';
import OrgLoginPage from '@/pages/OrgLoginPage';
import CreateOrganizationPage from '@/pages/CreateOrganizationPage';
import OrgCompleteProfilePage from '@/pages/OrgCompleteProfilePage';
import OrgChangePasswordPage from '@/pages/OrgChangePasswordPage';
import JoinOrganizationPage from '@/pages/JoinOrganizationPage';
import CreateDepartmentPage from '@/pages/CreateDepartmentPage';
import PlatformConsolePage from '@/pages/PlatformConsolePage';
import ForgotPasswordPage from '@/pages/student/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/student/ResetPasswordPage';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <OrganizationProvider>
            <MultiTenantAuthProvider>
            <AuthProvider>
            <OfflineIndicator />
            <InstallPWA />
            <UpdateNotification />
            <Routes>
              {/* ============================================ */}
              {/* PUBLIC ROUTES                                */}
              {/* ============================================ */}

              {/* Landing — search or create your organization */}
              <Route path="/" element={<LandingPage />} />

              {/* Create a new organization */}
              <Route path="/create" element={<CreateOrganizationPage />} />

              {/* Join existing org by creating a department */}
              <Route path="/join-org" element={<CreateDepartmentPage />} />

              {/* Platform console (hidden, not linked in navigation) */}
              <Route path="/pvx-console" element={<PlatformConsolePage />} />

              {/* Org-scoped login */}
              <Route path="/:orgSlug/login" element={<OrgLoginPage />} />

              {/* Org-scoped public contribution page */}
              <Route path="/:orgSlug/contribute" element={<ContributePage />} />
              <Route path="/:orgSlug/donate" element={<ContributePage />} />

              {/* Org-scoped public join page */}
              <Route path="/:orgSlug/join" element={<JoinOrganizationPage />} />

              {/* Org-scoped forgot password */}
              <Route path="/:orgSlug/forgot-password" element={<ForgotPasswordPage />} />

              {/* Public reset password (link from email — no org context needed) */}
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* ============================================ */}
              {/* PROTECTED — ORG-SCOPED ROUTES (/:orgSlug/*)  */}
              {/* OrgLayout provides the top navigation bar    */}
              {/* ============================================ */}
              <Route path="/:orgSlug" element={<OrgLayout />}>
                {/* Member pages */}
                <Route path="dashboard" element={<OrgProtectedRoute><DashboardPage /></OrgProtectedRoute>} />
                <Route path="payments" element={<OrgProtectedRoute><PaymentHistoryPage /></OrgProtectedRoute>} />
                <Route path="payment/:id" element={<OrgProtectedRoute><PaymentDetailPage /></OrgProtectedRoute>} />
                <Route path="profile" element={<OrgProtectedRoute><ProfilePage /></OrgProtectedRoute>} />
                <Route path="settings" element={<OrgProtectedRoute><SettingsPage /></OrgProtectedRoute>} />
                <Route path="change-password" element={<OrgProtectedRoute><OrgChangePasswordPage /></OrgProtectedRoute>} />
                <Route path="complete-profile" element={<OrgProtectedRoute><OrgCompleteProfilePage /></OrgProtectedRoute>} />

                {/* Admin pages */}
                <Route path="admin/dashboard" element={<OrgProtectedRoute requireAdmin><AdminDashboardPage /></OrgProtectedRoute>} />
                <Route path="admin/members" element={<OrgProtectedRoute requiredPermission="can_manage_members"><OrgMembersPage /></OrgProtectedRoute>} />
                <Route path="admin/create-payment" element={<OrgProtectedRoute requiredPermission="can_create_payments"><CreatePaymentTypePage /></OrgProtectedRoute>} />
                <Route path="admin/manage-dues" element={<OrgProtectedRoute requiredPermission="can_create_payments"><ManageDuesPage /></OrgProtectedRoute>} />
                <Route path="admin/review" element={<OrgProtectedRoute requiredPermission="can_approve_payments"><AdminReviewPage /></OrgProtectedRoute>} />
                <Route path="admin/expenses" element={<OrgProtectedRoute requiredPermission="can_manage_expenses"><ExpensesPage /></OrgProtectedRoute>} />
                <Route path="admin/collected" element={<OrgProtectedRoute requireAdmin><AdminCollectedPage /></OrgProtectedRoute>} />
                <Route path="admin/waive-payment" element={<OrgProtectedRoute requireAdmin><WaivePaymentPage /></OrgProtectedRoute>} />
                <Route path="admin/scan-qr" element={<OrgProtectedRoute requiredPermission="can_approve_payments"><ScanQRCodePage /></OrgProtectedRoute>} />
                <Route path="admin/contributions" element={<OrgProtectedRoute requiredPermission="can_approve_payments"><PublicContributionsPage /></OrgProtectedRoute>} />
                <Route path="admin/donation-settings" element={<OrgProtectedRoute requiredPermission="can_approve_payments"><DonationSettingsPage /></OrgProtectedRoute>} />
                <Route path="admin/billing" element={<OrgProtectedRoute requireAdmin><BillingPage /></OrgProtectedRoute>} />
              </Route>

              {/* ============================================ */}
              {/* LEGACY REDIRECTS — send old URLs to home     */}
              {/* ============================================ */}
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/dashboard" element={<Navigate to="/" replace />} />
              <Route path="/forgot-password" element={<Navigate to="/" replace />} />

              {/* Catch-all */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </AuthProvider>
            </MultiTenantAuthProvider>
          </OrganizationProvider>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
