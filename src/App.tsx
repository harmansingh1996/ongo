import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initializeMockData } from './services/mockData';
import { onAuthStateChange, getCurrentUser, AuthUser } from './services/authService';

// Pages
import WelcomePage from './pages/WelcomePage';
import AuthPage from './pages/AuthPage';

// Driver Pages
import DriverHome from './pages/driver/DriverHome';
import DriverTrips from './pages/driver/DriverTrips';
import DriverRideDetailPage from './pages/driver/RideDetailPage';
import PostRidePage from './pages/driver/PostRidePage';
import DriverChatPage from './pages/driver/ChatPage';
import DriverChatListPage from './pages/driver/ChatListPage';
import DriverProfile from './pages/driver/DriverProfile';
import DriverRatingsPage from './pages/driver/RatingsPage';
import EarningsPage from './pages/driver/EarningsPage';
import PayoutMethodPage from './pages/driver/PayoutMethodPage';
import DriverPayoutHistoryPage from './pages/driver/PayoutHistoryPage';
import LicenseVerificationPage from './pages/driver/LicenseVerificationPage';
import VehicleDetailsPage from './pages/driver/VehicleDetailsPage';
import DriverReportIssuePage from './pages/driver/ReportIssuePage';
import DriverSOSPage from './pages/driver/SOSPage';
import EditRidePage from './pages/driver/EditRidePage';
import DriverProfileDetail from './pages/driver/DriverProfileDetail';

// Rider Pages
import RiderHome from './pages/rider/RiderHome';
import RiderTrips from './pages/rider/RiderTrips';
import RiderRideDetailPage from './pages/rider/RideDetailPage';
import FindRidePage from './pages/rider/FindRidePage';
import AvailableRidesPage from './pages/rider/AvailableRidesPage';
import RidePreviewPage from './pages/rider/RidePreviewPage';
import DriverProfilePage from './pages/rider/DriverProfilePage';
import RiderChatPage from './pages/rider/ChatPage';
import RiderChatListPage from './pages/rider/ChatListPage';
import RiderProfile from './pages/rider/RiderProfile';
import PaymentMethodsPage from './pages/rider/PaymentMethodsPage';
import PaymentHistoryPage from './pages/rider/PaymentHistoryPage';
import RiderReportIssuePage from './pages/rider/ReportIssuePage';
import RatingsReviewsPage from './pages/rider/RatingsReviewsPage';
import RiderSOSPage from './pages/rider/SOSPage';
import ReferPage from './pages/rider/ReferPage';

// Legal Pages (Public)
import TermsPage from './pages/TermsPage';
import CancellationPolicyPage from './pages/CancellationPolicyPage';

// Settings Pages
import NotificationSettingsPage from './pages/NotificationSettingsPage';

// Admin Pages
import ManualPaymentCapture from './pages/admin/ManualPaymentCapture';

function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize mock data on app load
    initializeMockData();

    // Check initial auth state immediately with timeout protection
    const initializeAuth = async () => {
      try {
        // Race between auth check and timeout
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => {
            console.warn('Auth initialization timeout - continuing without auth');
            resolve(null);
          }, 5000); // 5 second timeout
        });

        const user = await Promise.race([
          getCurrentUser(),
          timeoutPromise
        ]);

        setCurrentUser(user);
      } catch (error) {
        console.error('Auth initialization error:', error);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen to auth state changes for future updates
    const subscription = onAuthStateChange((user) => {
      setCurrentUser(user);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="w-full h-dvh flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/" 
          element={
            currentUser ? (
              <Navigate to={currentUser.userType === 'driver' ? '/driver/home' : '/rider/home'} replace />
            ) : (
              <WelcomePage />
            )
          } 
        />
        <Route 
          path="/auth" 
          element={
            currentUser ? (
              <Navigate to={currentUser.userType === 'driver' ? '/driver/home' : '/rider/home'} replace />
            ) : (
              <AuthPage />
            )
          } 
        />
        
        {/* Legal Pages (Public) */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/cancellation-policy" element={<CancellationPolicyPage />} />
        
        {/* Driver Routes - Protected */}
        <Route 
          path="/driver/home" 
          element={
            currentUser?.userType === 'driver' ? <DriverHome /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/trips" 
          element={
            currentUser?.userType === 'driver' ? <DriverTrips /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/ride/:rideId" 
          element={
            currentUser?.userType === 'driver' ? <DriverRideDetailPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/post-ride" 
          element={
            currentUser?.userType === 'driver' ? <PostRidePage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/chat/:rideRequestId" 
          element={
            currentUser?.userType === 'driver' ? <DriverChatPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/chat" 
          element={
            currentUser?.userType === 'driver' ? <DriverChatListPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/profile" 
          element={
            currentUser?.userType === 'driver' ? <DriverProfile /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/ratings" 
          element={
            currentUser?.userType === 'driver' ? <DriverRatingsPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/earnings" 
          element={
            currentUser?.userType === 'driver' ? <EarningsPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/payout-method" 
          element={
            currentUser?.userType === 'driver' ? <PayoutMethodPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/payout-history" 
          element={
            currentUser?.userType === 'driver' ? <DriverPayoutHistoryPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/admin/manual-payment-capture" 
          element={<ManualPaymentCapture />}
        />
        <Route 
          path="/driver/license" 
          element={
            currentUser?.userType === 'driver' ? <LicenseVerificationPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/vehicle" 
          element={
            currentUser?.userType === 'driver' ? <VehicleDetailsPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/report-issue" 
          element={
            currentUser?.userType === 'driver' ? <DriverReportIssuePage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/sos" 
          element={
            currentUser?.userType === 'driver' ? <DriverSOSPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/edit-ride/:rideId" 
          element={
            currentUser?.userType === 'driver' ? <EditRidePage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/driver/profile/:driverId" 
          element={
            currentUser?.userType === 'driver' ? <DriverProfileDetail /> : <Navigate to="/auth" replace />
          } 
        />
        
        {/* Rider Routes - Protected */}
        <Route 
          path="/rider/home" 
          element={
            currentUser?.userType === 'rider' ? <RiderHome /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/trips" 
          element={
            currentUser?.userType === 'rider' ? <RiderTrips /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/ride-detail/:requestId" 
          element={
            currentUser?.userType === 'rider' ? <RiderRideDetailPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/find-ride" 
          element={
            currentUser?.userType === 'rider' ? <FindRidePage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/available-rides" 
          element={
            currentUser?.userType === 'rider' ? <AvailableRidesPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/ride-preview/:rideId" 
          element={
            currentUser?.userType === 'rider' ? <RidePreviewPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/driver-profile/:driverId" 
          element={
            currentUser?.userType === 'rider' ? <DriverProfileDetail /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/chat" 
          element={
            currentUser?.userType === 'rider' ? <RiderChatListPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/chat/:conversationId" 
          element={
            currentUser?.userType === 'rider' ? <RiderChatPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile" 
          element={
            currentUser?.userType === 'rider' ? <RiderProfile /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile/payment-methods" 
          element={
            currentUser?.userType === 'rider' ? <PaymentMethodsPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile/payment-history" 
          element={
            currentUser?.userType === 'rider' ? <PaymentHistoryPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile/report-issue" 
          element={
            currentUser?.userType === 'rider' ? <RiderReportIssuePage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile/ratings" 
          element={
            currentUser?.userType === 'rider' ? <RatingsReviewsPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile/sos" 
          element={
            currentUser?.userType === 'rider' ? <RiderSOSPage /> : <Navigate to="/auth" replace />
          } 
        />
        <Route 
          path="/rider/profile/refer" 
          element={
            currentUser?.userType === 'rider' ? <ReferPage /> : <Navigate to="/auth" replace />
          } 
        />
        
        {/* Settings Routes */}
        <Route path="/settings/notifications" element={<NotificationSettingsPage />} />

        {/* Catch all - redirect based on auth status */}
        <Route 
          path="*" 
          element={
            currentUser ? (
              <Navigate to={currentUser.userType === 'driver' ? '/driver/home' : '/rider/home'} replace />
            ) : (
              <Navigate to="/" replace />
            )
          } 
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
