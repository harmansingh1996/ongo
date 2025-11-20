import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, CheckCircle } from 'lucide-react';
import { getTermsAndConditions, acceptTermsAndConditions, hasUserAcceptedDocument } from '../services/legalService';
import { getCurrentUser } from '../services/authService';
import ReactMarkdown from 'react-markdown';

export default function TermsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [terms, setTerms] = useState<any>(null);
  const [hasAccepted, setHasAccepted] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadTermsAndUser();
  }, []);

  const loadTermsAndUser = async () => {
    setLoading(true);
    try {
      // Load terms
      const termsData = await getTermsAndConditions();
      setTerms(termsData);

      // Load user and check acceptance
      const currentUser = await getCurrentUser();
      setUser(currentUser);

      if (currentUser) {
        const accepted = await hasUserAcceptedDocument(currentUser.id, 'terms');
        setHasAccepted(accepted);
      }
    } catch (error) {
      console.error('Error loading terms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!user || !terms) return;

    setAccepting(true);
    try {
      const success = await acceptTermsAndConditions(user.id);
      if (success) {
        setHasAccepted(true);
        alert('✅ Terms & Conditions accepted successfully!');
      } else {
        alert('❌ Failed to accept terms. Please try again.');
      }
    } catch (error) {
      console.error('Error accepting terms:', error);
      alert('❌ An error occurred. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Terms & Conditions...</p>
        </div>
      </div>
    );
  }

  if (!terms) {
    return (
      <div className="w-full h-dvh bg-white">
        <div
          className="w-full h-full flex flex-col"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {/* Header */}
          <header className="flex-none bg-white border-b border-gray-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
              >
                <ArrowLeft className="w-6 h-6 text-gray-700" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Terms & Conditions</h1>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">Terms & Conditions not available</p>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-dvh bg-white">
      <div
        className="w-full h-full flex flex-col"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header */}
        <header className="flex-none bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg active:scale-95 transition-all"
            >
              <ArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">{terms.title}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <Calendar className="w-3 h-3" />
                <span>Effective: {new Date(terms.effective_date).toLocaleDateString()}</span>
                <span>•</span>
                <span>Version {terms.version}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Acceptance Status Banner */}
        {user && hasAccepted && (
          <div className="flex-none bg-green-50 border-b border-green-200 px-4 py-3">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm font-medium">You have accepted these terms</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto">
            <article className="prose prose-sm max-w-none">
              <ReactMarkdown>{terms.content}</ReactMarkdown>
            </article>
          </div>
        </div>

        {/* Accept Button */}
        {user && !hasAccepted && (
          <div className="flex-none bg-white border-t border-gray-200 px-4 py-4">
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting ? 'Accepting...' : 'Accept Terms & Conditions'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
