import { Route, Routes } from 'react-router-dom';
import { LandingScreen } from '@/features/marketing/screens/LandingScreen';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { RestaurantListScreen } from '@/features/restaurants/screens/RestaurantListScreen';
import { RestaurantDetailScreen } from '@/features/restaurants/screens/RestaurantDetailScreen';
import { CartScreen } from '@/features/cart/screens/CartScreen';
import { WaitingForMatchScreen } from '@/features/shared-delivery/screens/WaitingForMatchScreen';
import { MatchFoundScreen } from '@/features/shared-delivery/screens/MatchFoundScreen';
import { PaymentWindowScreen } from '@/features/shared-delivery/screens/PaymentWindowScreen';
import { OrderTrackingScreen } from '@/features/orders/screens/OrderTrackingScreen';
import { OrderHistoryScreen } from '@/features/orders/screens/OrderHistoryScreen';
import { PaymentHistoryScreen } from '@/features/payments/screens/PaymentHistoryScreen';
import { FavoritesScreen } from '@/features/favorites/screens/FavoritesScreen';
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen';
import { ForgotPasswordScreen } from '@/features/auth/screens/ForgotPasswordScreen';
import { StaffPortalScreen } from '@/features/marketing/screens/StaffPortalScreen';
import { AboutScreen } from '@/features/marketing/screens/AboutScreen';
import { ResetPasswordScreen } from '@/features/auth/screens/ResetPasswordScreen';
import { ChangePasswordScreen } from '@/features/auth/screens/ChangePasswordScreen';
import { NotFoundScreen } from '@/shared/screens/NotFoundScreen';

function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<LandingScreen />} />
      <Route path="/staff" element={<StaffPortalScreen />} />
      <Route path="/about" element={<AboutScreen />} />
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/register" element={<RegisterScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
      <Route path="/reset-password" element={<ResetPasswordScreen />} />
      <Route path="/change-password" element={<RequireAuth><ChangePasswordScreen /></RequireAuth>} />
      <Route path="/" element={<RequireAuth><RestaurantListScreen /></RequireAuth>} />
      <Route path="/restaurant/:restaurantId" element={<RequireAuth><RestaurantDetailScreen /></RequireAuth>} />
      <Route path="/cart" element={<RequireAuth><CartScreen /></RequireAuth>} />
      <Route path="/waiting" element={<RequireAuth><WaitingForMatchScreen /></RequireAuth>} />
      <Route path="/match" element={<RequireAuth><MatchFoundScreen /></RequireAuth>} />
      <Route path="/order/:orderId/payment" element={<RequireAuth><PaymentWindowScreen /></RequireAuth>} />
      <Route path="/order/:orderId" element={<RequireAuth><OrderTrackingScreen /></RequireAuth>} />
      <Route path="/orders" element={<RequireAuth><OrderHistoryScreen /></RequireAuth>} />
      <Route path="/payments" element={<RequireAuth><PaymentHistoryScreen /></RequireAuth>} />
      <Route path="/favorites" element={<RequireAuth><FavoritesScreen /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfileScreen /></RequireAuth>} />
      {/* Catch-all — any path that doesn't match above shows the 404 screen */}
      <Route path="*" element={<NotFoundScreen />} />
    </Routes>
  );
}

export default App;
