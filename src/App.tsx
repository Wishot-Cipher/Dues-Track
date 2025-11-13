import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { ToastProvider } from '@/components/ui/ToastProvider';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import OfflineIndicator from '@/components/OfflineIndicator';
import InstallPWA from '@/components/InstallPWA';

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

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <OfflineIndicator />
          <InstallPWA />
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
                <ProtectedRoute requireAdmin>
                  <CreatePaymentTypePage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Review Payments */}
            <Route
              path="/admin/review"
              element={
                <ProtectedRoute requireAdmin>
                  <AdminReviewPage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Scan QR Code */}
            <Route
              path="/admin/scan-qr"
              element={
                <ProtectedRoute requireAdmin>
                  <ScanQRCodePage />
                </ProtectedRoute>
              }
            />

            {/* Protected - Admin: Manage Students */}
            <Route
              path="/admin/manage-students"
              element={
                <ProtectedRoute requireAdmin>
                  <ManageStudentsPage />
                </ProtectedRoute>
              }
            />

            {/* Default Redirect */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;

