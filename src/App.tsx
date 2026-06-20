import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
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
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useTheme } from '@/hooks/useTheme';

// ── Eagerly imported pages ─────────────────────────────────────────
// Member-facing routes (StudentDashboardPage, MyDues, profile, etc.)
// stay eager so the most common first-load shows data immediately
// instead of an extra suspense flash. Onboarding + login pages stay
// eager too — they're the entry points for unauthenticated visitors
// and a loader on those would feel broken.
import StudentDashboardPage from '@/pages/StudentDashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import SettingsPage from '@/pages/student/SettingsPage';
import PaymentDetailPage from '@/pages/PaymentDetailPage';
import MakePaymentPage from '@/pages/MakePaymentPage';
import MyDuesPage from '@/pages/MyDuesPage';
import NotificationsPage from '@/pages/NotificationsPage';
import NotificationDetailPage from '@/pages/NotificationDetailPage';
import MyGroupsPage from '@/pages/MyGroupsPage';
import MyTicketsPage from '@/pages/MyTicketsPage';
import TicketPage from '@/pages/TicketPage';
import UpcomingEventsPage from '@/pages/UpcomingEventsPage';
import PaymentVerifyPage from '@/pages/PaymentVerifyPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Multi-Tenant Pages (public / onboarding) — eager. Entry-point UX.
import LandingPage from '@/pages/LandingPage';
import OrgLoginPage from '@/pages/OrgLoginPage';
import OrgCompleteProfilePage from '@/pages/OrgCompleteProfilePage';
import OrgChangePasswordPage from '@/pages/OrgChangePasswordPage';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import JoinOrganizationPage from '@/pages/JoinOrganizationPage';
import OrgOverviewPage from '@/pages/OrgOverviewPage';
import FacultyDetailPage from '@/pages/FacultyDetailPage';
import DepartmentDetailPage from '@/pages/DepartmentDetailPage';
import GroupWelcomePage from '@/pages/GroupWelcomePage';
import ForgotPasswordPage from '@/pages/student/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/student/ResetPasswordPage';
import HowItWorksPage from './pages/student/how-it-works';
import PrivacyPolicyPage from './pages/student/Privacypolicypage';
import TermsOfServicePage from './pages/student/Termsofservicepage';

// ── Lazily imported pages ──────────────────────────────────────────
// Admin surface, platform console, heavy public pages (receipt PDF,
// bring-school wizard, contribute / event checkout). These ship in
// their own chunks; a member who never opens /admin/* downloads
// nothing for that surface. Cuts the initial JS by an estimated
// 30-50% for the most common user.
const ReceiptPage = lazy(() => import('@/pages/ReceiptPage'));
const BringMySchoolPage = lazy(() => import('@/pages/BringMySchoolPage'));
const ContributePage = lazy(() => import('@/pages/ContributePage'));
const PublicEventCheckoutPage = lazy(() => import('@/pages/PublicEventCheckoutPage'));
const AddDepartmentPage = lazy(() => import('@/pages/AddDepartmentPage'));
const AddFacultyPage = lazy(() => import('@/pages/AddFacultyPage'));
const ClaimSubmitPage = lazy(() => import('@/pages/ClaimSubmitPage'));
const ClaimDecisionPage = lazy(() => import('@/pages/ClaimDecisionPage'));
const PlatformConsole = lazy(() => import('@/pages/PlatformConsole'));

const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const DepartmentExecDashboardPage = lazy(() => import('@/pages/admin/DepartmentExecDashboardPage'));
const FacultyExecDashboardPage = lazy(() => import('@/pages/admin/FacultyExecDashboardPage'));
const ClassExecDashboardPage = lazy(() => import('@/pages/admin/ClassExecDashboardView'));
const CreateDuePage = lazy(() => import('@/pages/admin/CreateDuePage'));
const ManageDuesPage = lazy(() => import('@/pages/admin/ManageDuesPage'));
const AdminReviewPage = lazy(() => import('@/pages/admin/AdminReviewPage'));
const WaivePaymentPage = lazy(() => import('@/pages/admin/WaivePaymentPage'));
const ScanQRCodePage = lazy(() => import('@/pages/admin/ScanQRCodePageNew'));
const OrgMembersPage = lazy(() => import('@/pages/admin/OrgMembersPage'));
const AdminCollectedPage = lazy(() => import('@/pages/admin/AdminCollectedPage'));
const ExpensesPage = lazy(() => import('@/pages/admin/ExpensesPage'));
const PublicContributionsPage = lazy(() => import('@/pages/admin/PublicContributionsPage'));
const DonationSettingsPage = lazy(() => import('@/pages/admin/DonationSettingsPage'));
const BillingPage = lazy(() => import('@/pages/admin/GroupBillingPage'));
const PayoutSetupPage = lazy(() => import('@/pages/admin/PayoutSetupPage'));
const OrgGroupsPage = lazy(() => import('@/pages/admin/OrgGroupsPage'));
const OrgAcademicCalendarPage = lazy(() => import('@/pages/admin/OrgAcademicCalendarPage'));
const TicketCheckInPage = lazy(() => import('@/pages/admin/TicketCheckInPage'));
const AuditPage = lazy(() => import('@/pages/admin/AuditPage'));

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
                {/* Lazy-route fallback. fullScreen LoadingSpinner uses
                position:fixed + inset:0 + bg:#0F0703 + z:9999 — it
                covers the OrgLayout's top header and bottom tab bar
                while the chunk downloads, which read as "my nav
                disappeared." Replaced with a minimal centred
                spinner that occupies only the content area; the
                layout chrome (header + bottom tabs) stays visible. */}
                <Suspense fallback={
                  <div className="flex items-center justify-center py-24 min-h-[40vh]">
                    <LoadingSpinner size="md" />
                  </div>
                }>
                  <Routes>
                    {/* ============================================ */}
                    {/* PUBLIC ROUTES                                */}
                    {/* ============================================ */}

                    {/* Landing — search for your organization */}
                    <Route path="/" element={<LandingPage />} />

                    {/* Bring a school / org online (community trust) */}
                    <Route path="/bring-school" element={<BringMySchoolPage />} />
                    <Route path="/how-it-works" element={<HowItWorksPage />} />

                    {/* * PrivacyPolicyPage & TermsOfServicePage — Payvexo's privacy policy and terms of service. */}
                    <Route path="/privacy" element={<PrivacyPolicyPage />} />
                    <Route path="/terms" element={<TermsOfServicePage />} />

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
                    <Route path="/:orgSlug/reset-password" element={<ResetPasswordPage />} />

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
                      <Route path="notifications" element={<OrgProtectedRoute><NotificationsPage /></OrgProtectedRoute>} />
                      <Route path="notifications/:id" element={<OrgProtectedRoute><NotificationDetailPage /></OrgProtectedRoute>} />
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
                      <Route path="admin/class" element={<OrgProtectedRoute requireVerified><ClassExecDashboardPage /></OrgProtectedRoute>} />
                      {/* Faculty exec dashboard — same pattern, one tier up. */}
                      <Route path="admin/faculty" element={<OrgProtectedRoute requireVerified><FacultyExecDashboardPage /></OrgProtectedRoute>} />
                      <Route path="admin/groups" element={<OrgProtectedRoute requireActing><OrgGroupsPage /></OrgProtectedRoute>} />
                      <Route path="admin/academic-calendar" element={<OrgProtectedRoute requireActing><OrgAcademicCalendarPage /></OrgProtectedRoute>} />
                      {/* Manage Members is a CLASS-REP capability. Dept and
                    faculty execs do not add/remove/edit students in
                    classes below them — that stays with each class
                    rep. allowedScopes pins the route to class- or
                    org-tier callers; unit-scope (dept/faculty)
                    bounce back to their own dashboard. Plain members
                    never have an exec role so they're rejected too. */}
                      <Route path="admin/members" element={<OrgProtectedRoute requiredPermission="can_manage_members" requireVerified allowedScopes={['group', 'org']}><OrgMembersPage /></OrgProtectedRoute>} />
                      <Route path="admin/create-payment" element={<OrgProtectedRoute requiredPermission="can_create_payments" requireVerified><CreateDuePage /></OrgProtectedRoute>} />
                      {/* Edit due — reuses CreateDuePage in edit mode. The
                    :id param triggers the prefill + UPDATE branch in
                    CreateDuePage so the publisher gets the full
                    create-style editor, not a cramped modal. */}
                      <Route path="admin/dues/:id/edit" element={<OrgProtectedRoute requiredPermission="can_create_payments" requireVerified><CreateDuePage /></OrgProtectedRoute>} />
                      <Route path="admin/manage-dues" element={<OrgProtectedRoute requiredPermission="can_create_payments" requireVerified><ManageDuesPage /></OrgProtectedRoute>} />
                      <Route path="admin/review" element={<OrgProtectedRoute requiredPermission="can_approve_payments" requireVerified><AdminReviewPage /></OrgProtectedRoute>} />
                      {/* Audit — payments grouped per dept/class for execs
                    above the class tier. allowedScopes pins it to
                    unit (faculty/dept) + org. A class rep doesn't
                    get a separate audit view — they already see
                    their class on ManageDues. */}
                      <Route path="admin/audit" element={<OrgProtectedRoute requiredPermission="can_approve_payments" requireVerified allowedScopes={['unit', 'org']}><AuditPage /></OrgProtectedRoute>} />
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
                </Suspense>
              </AuthProvider>
            </MultiTenantAuthProvider>
          </OrganizationProvider>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
