import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/ToastProvider';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import OfflineIndicator from '@/components/OfflineIndicator';
import InstallPWA from '@/components/InstallPWA';
import UpdateNotification from '@/components/UpdateNotification';

// Pages
import LoginPage from '@/pages/LoginPage';
import ChangePasswordPage from '@/pages/ChangePasswordPage';
import CompleteProfilePage from '@/pages/CompleteProfilePage';
import DashboardPage from '@/pages/DashboardPage';
import ProfilePage from '@/pages/ProfilePage';
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import CreatePaymentTypePage from '@/pages/admin/CreatePaymentTypePage';
import PaymentDetailPage from '@/pages/PaymentDetailPage';
import PaymentHistoryPage from '@/pages/student/PaymentHistoryPage';
import AdminReviewPage from '@/pages/admin/AdminReviewPage';
import WaivePaymentPage from '@/pages/admin/WaivePaymentPage';
import ScanQRCodePage from '@/pages/admin/ScanQRCodePage';
import ManageStudentsPage from '@/pages/admin/ManageStudentsPage';
import AdminCollectedPage from '@/pages/admin/AdminCollectedPage';
import ExpensesPage from '@/pages/admin/ExpensesPage';

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <OfflineIndicator />
          <InstallPWA />
          <UpdateNotification />
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected - Password Change (First Priority) */}
            <Route
              path="/change-password"
              element={
                <ProtectedRoute>
                  <ChangePasswordPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Profile Completion (Second Priority) */}
            <Route
              path="/complete-profile"
              element={
                <ProtectedRoute>
                  <CompleteProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Dashboard (Final Destination) */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Profile */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Payment Detail */}
            <Route
              path="/payment/:id"
              element={
                <ProtectedRoute>
                  <PaymentDetailPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Payment History */}
            <Route
              path="/payments"
              element={
                <ProtectedRoute>
                  <PaymentHistoryPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Dashboard */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Waive Payment */}
            <Route
              path="/admin/waive-payment"
              element={
                <ProtectedRoute requireAdmin>
                  <WaivePaymentPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Create Payment Type */}
            <Route
              path="/admin/create-payment"
              element={
                <ProtectedRoute requiredPermission="can_create_payments">
                  <CreatePaymentTypePage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Review Payments */}
            <Route
              path="/admin/review"
              element={
                <ProtectedRoute requiredPermission="can_approve_payments">
                  <AdminReviewPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Scan QR Code */}
            <Route
              path="/admin/scan-qr"
              element={
                <ProtectedRoute requiredPermission="can_approve_payments">
                  <ScanQRCodePage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Manage Students */}
            <Route
              path="/admin/manage-students"
              element={
                <ProtectedRoute requiredPermission="can_manage_students">
                  <ManageStudentsPage />
                </ProtectedRoute>
              }
            />

            {/* Default Redirect */}
            {/* Collected by category */}
            <Route
              path="/admin/collected"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminCollectedPage />
                </ProtectedRoute>
              }
            />
            {/* Protected - Admin: Expenses */}
            <Route
              path="/admin/expenses"
              element={
                <ProtectedRoute requiredPermission="can_manage_students">
                  <ExpensesPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;

