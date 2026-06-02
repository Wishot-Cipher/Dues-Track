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
import { useTheme } from '@/hooks/useTheme';

// Pages
// NOTE: src/pages/DashboardPage.tsx is the legacy student dashboard. It is
// intentionally NOT imported here so it stays as a safe-to-revert backup on
// disk. The active student route now uses StudentDashboardPage.
import StudentDashboardPage from '@/pages/StudentDashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/student/SettingsPage';
// NOTE: src/pages/student/PaymentHistoryPage.tsx is the legacy 916-line
// dues hub. It stays on disk as a safe-to-revert backup but is no longer
// routed. The active /payments route uses the new mockup-faithful MyDuesPage.
import PaymentDetailPage from '@/pages/PaymentDetailPage';
import MakePaymentPage from '@/pages/MakePaymentPage';
import MyDuesPage from '@/pages/MyDuesPage';
import MyGroupsPage from '@/pages/MyGroupsPage';
import MyTicketsPage from '@/pages/MyTicketsPage';
import TicketPage from '@/pages/TicketPage';
import UpcomingEventsPage from '@/pages/UpcomingEventsPage';
import TicketCheckInPage from '@/pages/admin/TicketCheckInPage';
import PaymentVerifyPage from '@/pages/PaymentVerifyPage';
import ReceiptPage from '@/pages/ReceiptPage';
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import DepartmentExecDashboardPage from '@/pages/admin/DepartmentExecDashboardPage';
import FacultyExecDashboardPage from '@/pages/admin/FacultyExecDashboardPage';
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
import PayoutSetupPage from '@/pages/admin/PayoutSetupPage';
import OrgGroupsPage from '@/pages/admin/OrgGroupsPage';
import OrgAcademicCalendarPage from '@/pages/admin/OrgAcademicCalendarPage';
import ContributePage from '@/pages/ContributePage';
import PublicEventCheckoutPage from '@/pages/PublicEventCheckoutPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Multi-Tenant Pages (public / onboarding)
import LandingPage from '@/pages/LandingPage';
import BringMySchoolPage from '@/pages/BringMySchoolPage';
import OrgLoginPage from '@/pages/OrgLoginPage';
import OrgCompleteProfilePage from '@/pages/OrgCompleteProfilePage';
import OrgChangePasswordPage from '@/pages/OrgChangePasswordPage';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import JoinOrganizationPage from '@/pages/JoinOrganizationPage';
import OrgOverviewPage from '@/pages/OrgOverviewPage';
import FacultyDetailPage from '@/pages/FacultyDetailPage';
import DepartmentDetailPage from '@/pages/DepartmentDetailPage';
import GroupWelcomePage from '@/pages/GroupWelcomePage';
import AddDepartmentPage from '@/pages/AddDepartmentPage';
import AddFacultyPage from '@/pages/AddFacultyPage';
import ClaimSubmitPage from '@/pages/ClaimSubmitPage';
import ClaimDecisionPage from '@/pages/ClaimDecisionPage';
// Legacy console kept on disk as a backup; the active console is the new command-room build.
import PlatformConsole from '@/pages/PlatformConsole';
import ForgotPasswordPage from '@/pages/student/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/student/ResetPasswordPage';

function App() {
  // Ensure html[data-theme] is applied on every route, not only theme-aware pages.
  useTheme();
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
              <Route path="/pvx-console" element={<PlatformConsole />} />

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
              <Route path="/:orgSlug/events/:eventId" element={<PublicEventCheckoutPage />} />

              {/* Org-scoped public join page */}
              <Route path="/:orgSlug/join" element={<JoinOrganizationPage />} />

              {/* Public event ticket — resolvable by code (saved link / screenshot) */}
              <Route path="/:orgSlug/ticket/:code" element={<TicketPage />} />

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
                <Route path="events" element={<OrgProtectedRoute><UpcomingEventsPage /></OrgProtectedRoute>} />
                <Route path="claim" element={<OrgProtectedRoute><ClaimSubmitPage /></OrgProtectedRoute>} />
                <Route path="claim/:claimId/decide" element={<OrgProtectedRoute><ClaimDecisionPage /></OrgProtectedRoute>} />
                <Route path="payments" element={<OrgProtectedRoute><MyDuesPage /></OrgProtectedRoute>} />
                <Route path="groups" element={<OrgProtectedRoute><MyGroupsPage /></OrgProtectedRoute>} />
                <Route path="tickets" element={<OrgProtectedRoute><MyTicketsPage /></OrgProtectedRoute>} />
                {/* Default Pay flow — clean Paystack-first MakePaymentPage. */}
                <Route path="payment/:id" element={<OrgProtectedRoute><MakePaymentPage /></OrgProtectedRoute>} />
                {/* Manual / offline fallback — bank transfer + receipt upload. */}
                <Route path="payment/:id/manual" element={<OrgProtectedRoute><PaymentDetailPage /></OrgProtectedRoute>} />
                {/* Paystack redirects back here after hosted checkout (mig P1) */}
                <Route path="payments/verify" element={<PaymentVerifyPage />} />
                {/* Post-payment receipt — also reachable from My Dues paid rows */}
                <Route path="receipt/:paymentId" element={<OrgProtectedRoute><ReceiptPage /></OrgProtectedRoute>} />
                <Route path="profile" element={<OrgProtectedRoute><ProfilePage /></OrgProtectedRoute>} />
                <Route path="settings" element={<OrgProtectedRoute><SettingsPage /></OrgProtectedRoute>} />
                <Route path="change-password" element={<OrgProtectedRoute><OrgChangePasswordPage /></OrgProtectedRoute>} />
                <Route path="complete-profile" element={<OrgProtectedRoute><OrgCompleteProfilePage /></OrgProtectedRoute>} />
                <Route path="verify-email" element={<OrgProtectedRoute><VerifyEmailPage /></OrgProtectedRoute>} />

                {/* Admin pages. Layered trust:
                      ACTING (Layer 2, school-email verified) → setup-only routes
                      FULL  (Layer 4, fully verified)         → money + members + sensitive
                    A pending founder (Layer < 2) is bounced to the member dashboard. */}
                <Route path="admin/dashboard" element={<OrgProtectedRoute requireActing><AdminDashboardPage /></OrgProtectedRoute>} />
                {/* Departmental exec dashboard — Layer-4 unit-scope admins
                    whose group is a department. The page does its own
                    "is this the right kind of admin?" check and bounces
                    non-matching callers, so requireVerified is enough. */}
                <Route path="admin/dept" element={<OrgProtectedRoute requireVerified><DepartmentExecDashboardPage /></OrgProtectedRoute>} />
                {/* Faculty exec dashboard — same pattern, one tier up. */}
                <Route path="admin/faculty" element={<OrgProtectedRoute requireVerified><FacultyExecDashboardPage /></OrgProtectedRoute>} />
                <Route path="admin/groups" element={<OrgProtectedRoute requireActing><OrgGroupsPage /></OrgProtectedRoute>} />
                <Route path="admin/academic-calendar" element={<OrgProtectedRoute requireActing><OrgAcademicCalendarPage /></OrgProtectedRoute>} />
                <Route path="admin/members" element={<OrgProtectedRoute requiredPermission="can_manage_members" requireVerified><OrgMembersPage /></OrgProtectedRoute>} />
                <Route path="admin/create-payment" element={<OrgProtectedRoute requiredPermission="can_create_payments" requireVerified><CreateDuePage /></OrgProtectedRoute>} />
                <Route path="admin/manage-dues" element={<OrgProtectedRoute requiredPermission="can_create_payments" requireVerified><ManageDuesPage /></OrgProtectedRoute>} />
                <Route path="admin/review" element={<OrgProtectedRoute requiredPermission="can_approve_payments" requireVerified><AdminReviewPage /></OrgProtectedRoute>} />
                <Route path="admin/expenses" element={<OrgProtectedRoute requiredPermission="can_manage_expenses" requireVerified><ExpensesPage /></OrgProtectedRoute>} />
                <Route path="admin/collected" element={<OrgProtectedRoute requireAdmin requireVerified><AdminCollectedPage /></OrgProtectedRoute>} />
                <Route path="admin/waive-payment" element={<OrgProtectedRoute requireAdmin requireVerified><WaivePaymentPage /></OrgProtectedRoute>} />
                <Route path="admin/scan-qr" element={<OrgProtectedRoute requiredPermission="can_approve_payments" requireVerified><ScanQRCodePage /></OrgProtectedRoute>} />
                <Route path="admin/check-in" element={<OrgProtectedRoute requireActing><TicketCheckInPage /></OrgProtectedRoute>} />
                <Route path="admin/contributions" element={<OrgProtectedRoute requiredPermission="can_approve_payments" requireVerified><PublicContributionsPage /></OrgProtectedRoute>} />
                <Route path="admin/donation-settings" element={<OrgProtectedRoute requiredPermission="can_approve_payments" requireVerified><DonationSettingsPage /></OrgProtectedRoute>} />
                <Route path="admin/billing" element={<OrgProtectedRoute requireAdmin requireVerified><BillingPage /></OrgProtectedRoute>} />
                <Route path="admin/payout" element={<OrgProtectedRoute requiredPermission="can_manage_settings" requireVerified><PayoutSetupPage /></OrgProtectedRoute>} />
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
