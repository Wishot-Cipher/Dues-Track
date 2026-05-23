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
// NOTE: src/pages/DashboardPage.tsx is the legacy student dashboard. It is
// intentionally NOT imported here so it stays as a safe-to-revert backup on
// disk. The active student route now uses StudentDashboardPage.
import StudentDashboardPage from '@/pages/StudentDashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/student/SettingsPage';
import PaymentHistoryPage from '@/pages/student/PaymentHistoryPage';
import PaymentDetailPage from '@/pages/PaymentDetailPage';
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
// NOTE: src/pages/admin/CreatePaymentTypePage.tsx is the legacy create-due page.
// It stays on disk as a safe-revert backup but is no longer routed.
import CreateDuePage from '@/pages/admin/CreateDuePage';
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
import OrgGroupsPage from '@/pages/admin/OrgGroupsPage';
import OrgAcademicCalendarPage from '@/pages/admin/OrgAcademicCalendarPage';
import ContributePage from '@/pages/ContributePage';
import NotFoundPage from '@/pages/NotFoundPage';

// Multi-Tenant Pages (public / onboarding)
import LandingPage from '@/pages/LandingPage';
import BringMySchoolPage from '@/pages/BringMySchoolPage';
import OrgLoginPage from '@/pages/OrgLoginPage';
import OrgCompleteProfilePage from '@/pages/OrgCompleteProfilePage';
import OrgChangePasswordPage from '@/pages/OrgChangePasswordPage';
import JoinOrganizationPage from '@/pages/JoinOrganizationPage';
import OrgOverviewPage from '@/pages/OrgOverviewPage';
import FacultyDetailPage from '@/pages/FacultyDetailPage';
import DepartmentDetailPage from '@/pages/DepartmentDetailPage';
import GroupWelcomePage from '@/pages/GroupWelcomePage';
import AddDepartmentPage from '@/pages/AddDepartmentPage';
import AddFacultyPage from '@/pages/AddFacultyPage';
import ClaimSubmitPage from '@/pages/ClaimSubmitPage';
import ClaimDecisionPage from '@/pages/ClaimDecisionPage';
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

              {/* Landing — search for your organization */}
              <Route path="/" element={<LandingPage />} />

              {/* Bring a school / org online (community trust) */}
              <Route path="/bring-school" element={<BringMySchoolPage />} />

              {/* Create organization — NOW MOVED TO ADMIN CONSOLE (/pvx-console) */}
              {/* <Route path="/create" element={<CreateOrganizationPage />} /> */}

              {/* Legacy /join-org → bring-school (department creation now
                  happens inside FacultyDetailPage → AddDepartmentPage) */}
              <Route path="/join-org" element={<Navigate to="/bring-school" replace />} />

              {/* Platform console (hidden, not linked in navigation) */}
              <Route path="/pvx-console" element={<PlatformConsolePage />} />

              {/* Org-scoped login */}
              <Route path="/:orgSlug/overview" element={<OrgOverviewPage />} />
              <Route path="/:orgSlug/add-faculty" element={<AddFacultyPage />} />
              <Route path="/:orgSlug/f/:facultyShortName" element={<FacultyDetailPage />} />
              <Route path="/:orgSlug/f/:facultyShortName/new" element={<AddDepartmentPage />} />
              <Route path="/:orgSlug/d/:departmentShort" element={<DepartmentDetailPage />} />
              <Route path="/:orgSlug/d/:departmentShort/new" element={<AddDepartmentPage />} />
              <Route path="/:orgSlug/g/:groupShortName" element={<GroupWelcomePage />} />
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
                <Route path="dashboard" element={<OrgProtectedRoute><StudentDashboardPage /></OrgProtectedRoute>} />
                <Route path="claim" element={<OrgProtectedRoute><ClaimSubmitPage /></OrgProtectedRoute>} />
                <Route path="claim/:claimId/decide" element={<OrgProtectedRoute><ClaimDecisionPage /></OrgProtectedRoute>} />
                <Route path="payments" element={<OrgProtectedRoute><PaymentHistoryPage /></OrgProtectedRoute>} />
                <Route path="payment/:id" element={<OrgProtectedRoute><PaymentDetailPage /></OrgProtectedRoute>} />
                <Route path="profile" element={<OrgProtectedRoute><ProfilePage /></OrgProtectedRoute>} />
                <Route path="settings" element={<OrgProtectedRoute><SettingsPage /></OrgProtectedRoute>} />
                <Route path="change-password" element={<OrgProtectedRoute><OrgChangePasswordPage /></OrgProtectedRoute>} />
                <Route path="complete-profile" element={<OrgProtectedRoute><OrgCompleteProfilePage /></OrgProtectedRoute>} />

                {/* Admin pages */}
                <Route path="admin/dashboard" element={<OrgProtectedRoute requireAdmin><AdminDashboardPage /></OrgProtectedRoute>} />
                <Route path="admin/members" element={<OrgProtectedRoute requiredPermission="can_manage_members"><OrgMembersPage /></OrgProtectedRoute>} />
                <Route path="admin/groups" element={<OrgProtectedRoute requiredPermission="can_manage_members"><OrgGroupsPage /></OrgProtectedRoute>} />
                <Route path="admin/academic-calendar" element={<OrgProtectedRoute requireAdmin><OrgAcademicCalendarPage /></OrgProtectedRoute>} />
                <Route path="admin/create-payment" element={<OrgProtectedRoute requiredPermission="can_create_payments"><CreateDuePage /></OrgProtectedRoute>} />
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
