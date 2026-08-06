import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { RestaurantOrdersScreen } from '@/features/restaurant/RestaurantOrdersScreen';
import { RestaurantMenuScreen } from '@/features/restaurant/RestaurantMenuScreen';
import { RestaurantPaymentSettingsScreen } from '@/features/restaurant/RestaurantPaymentSettingsScreen';
import { AdminDashboardScreen } from '@/features/admin/AdminDashboardScreen';
import { AdminRestaurantsScreen } from '@/features/admin/AdminRestaurantsScreen';
import { AdminRestaurantDetailScreen } from '@/features/admin/AdminRestaurantDetailScreen';
import { AdminStudentsScreen } from '@/features/admin/AdminStudentsScreen';
import { AdminSharedDeliveryScreen } from '@/features/admin/AdminSharedDeliveryScreen';
import { AdminPaymentsScreen } from '@/features/admin/AdminPaymentsScreen';
import { AdminPayoutsScreen } from '@/features/admin/AdminPayoutsScreen';
import { AdminRefundsScreen } from '@/features/admin/AdminRefundsScreen';
import { AdminOrdersScreen } from '@/features/admin/AdminOrdersScreen';
import { AdminAuditScreen } from '@/features/admin/AdminAuditScreen';
import { AdminPlatformPaymentSettingsScreen } from '@/features/admin/AdminPlatformPaymentSettingsScreen';
import { AdminRatingsScreen } from '@/features/admin/AdminRatingsScreen';
import { AdminAdminsScreen } from '@/features/admin/AdminAdminsScreen';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { useAuthStore } from '@/lib/authStore';

function FallbackRedirect() {
  const role = useAuthStore((state) => state.role);
  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (role === 'restaurant') return <Navigate to="/restaurant/orders" replace />;
  return <Navigate to="/login" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginScreen />} />

      <Route
        path="/restaurant/orders"
        element={
          <ProtectedRoute role="restaurant">
            <RestaurantOrdersScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/restaurant/menu"
        element={
          <ProtectedRoute role="restaurant">
            <RestaurantMenuScreen />
          </ProtectedRoute>
        }
      />

      <Route
        path="/restaurant/payment-settings"
        element={
          <ProtectedRoute role="restaurant">
            <RestaurantPaymentSettingsScreen />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboardScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payments"
        element={
          <ProtectedRoute role="admin">
            <AdminPaymentsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payouts"
        element={
          <ProtectedRoute role="admin">
            <AdminPayoutsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/refunds"
        element={
          <ProtectedRoute role="admin">
            <AdminRefundsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/restaurants"
        element={
          <ProtectedRoute role="admin">
            <AdminRestaurantsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/restaurants/:id"
        element={
          <ProtectedRoute role="admin">
            <AdminRestaurantDetailScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/shared-delivery"
        element={
          <ProtectedRoute role="admin">
            <AdminSharedDeliveryScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/students"
        element={
          <ProtectedRoute role="admin">
            <AdminStudentsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <ProtectedRoute role="admin">
            <AdminOrdersScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit"
        element={
          <ProtectedRoute role="admin">
            <AdminAuditScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/platform-payment-settings"
        element={
          <ProtectedRoute role="admin">
            <AdminPlatformPaymentSettingsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/admins"
        element={
          <ProtectedRoute role="admin">
            <AdminAdminsScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ratings"
        element={
          <ProtectedRoute role="admin">
            <AdminRatingsScreen />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  );
}

export default App;
