import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CreditCard, ShieldCheck, Lock, Zap } from 'lucide-react';

export default function PaymentMethodsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  return (
    <div className="w-full h-dvh bg-gray-50">
      <main 
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex-none px-4 py-3 bg-white shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(returnUrl ? decodeURIComponent(returnUrl) : '/rider/profile')} 
              className="p-2 active:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Payment Information</h1>
              <p className="text-xs text-gray-600">Secure payment processing</p>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-md mx-auto space-y-6">
            {/* Hero Section */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
              <div className="flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Secure Payment Processing</h2>
              <p className="text-blue-100 text-sm">
                Your payment information is collected securely at the time of booking using industry-standard encryption.
              </p>
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">No Stored Cards Required</h3>
                  <p className="text-sm text-gray-600">
                    Enter your payment details securely when booking a ride. We don't store your card information.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Lock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Payment Authorization</h3>
                  <p className="text-sm text-gray-600">
                    Your card is authorized when you book, but you're only charged after the ride is completed.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Quick & Easy Checkout</h3>
                  <p className="text-sm text-gray-600">
                    Complete your booking in seconds with our streamlined payment process powered by Stripe.
                  </p>
                </div>
              </div>
            </div>

            {/* Security Badge */}
            <div className="bg-gray-100 rounded-xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-gray-600" />
                <p className="text-sm font-semibold text-gray-900">Secured by Stripe</p>
              </div>
              <p className="text-xs text-gray-600">
                All transactions are encrypted and processed securely through Stripe's PCI-compliant payment infrastructure.
              </p>
            </div>

            {/* How It Works */}
            <div className="bg-white rounded-xl shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-4">How Payment Works</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                    1
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm text-gray-900 font-medium">Choose Your Ride</p>
                    <p className="text-xs text-gray-600 mt-0.5">Select a ride and click "Book Ride"</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                    2
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm text-gray-900 font-medium">Enter Payment Details</p>
                    <p className="text-xs text-gray-600 mt-0.5">Securely provide your card information via Stripe</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                    3
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm text-gray-900 font-medium">Authorization Hold</p>
                    <p className="text-xs text-gray-600 mt-0.5">Your payment is authorized but not charged yet</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold">
                    4
                  </div>
                  <div className="flex-1 pt-1">
                    <p className="text-sm text-gray-900 font-medium">Ride & Charge</p>
                    <p className="text-xs text-gray-600 mt-0.5">Complete your ride and payment is automatically charged</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Button */}
            {returnUrl && (
              <button
                onClick={() => navigate(decodeURIComponent(returnUrl))}
                className="w-full py-4 bg-blue-600 text-white font-semibold rounded-xl active:bg-blue-700 shadow-lg"
              >
                Continue to Booking
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
