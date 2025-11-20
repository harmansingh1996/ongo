import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar } from 'lucide-react';
import { getCancellationPolicy } from '../services/legalService';
import ReactMarkdown from 'react-markdown';

export default function CancellationPolicyPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<any>(null);

  useEffect(() => {
    loadPolicy();
  }, []);

  const loadPolicy = async () => {
    setLoading(true);
    try {
      const policyData = await getCancellationPolicy();
      setPolicy(policyData);
    } catch (error) {
      console.error('Error loading cancellation policy:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-dvh bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading Cancellation Policy...</p>
        </div>
      </div>
    );
  }

  if (!policy) {
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
              <h1 className="text-xl font-bold text-gray-900">Cancellation Policy</h1>
            </div>
          </header>

          <div className="flex-1 flex items-center justify-center px-4">
            <div className="text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">Cancellation Policy not available</p>
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
              <h1 className="text-xl font-bold text-gray-900">{policy.title}</h1>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                <Calendar className="w-3 h-3" />
                <span>Effective: {new Date(policy.effective_date).toLocaleDateString()}</span>
                <span>•</span>
                <span>Version {policy.version}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Quick Reference Card */}
        <div className="flex-none bg-blue-50 border-b border-blue-200 px-4 py-4">
          <h2 className="text-sm font-semibold text-blue-900 mb-3">Quick Reference</h2>
          <div className="space-y-2 text-xs text-blue-800">
            <div className="flex justify-between items-center bg-white p-2 rounded">
              <span>12+ hours before</span>
              <span className="font-semibold text-green-600">100% Refund</span>
            </div>
            <div className="flex justify-between items-center bg-white p-2 rounded">
              <span>6-12 hours before</span>
              <span className="font-semibold text-yellow-600">50% Refund</span>
            </div>
            <div className="flex justify-between items-center bg-white p-2 rounded">
              <span>&lt;6 hours / No-show</span>
              <span className="font-semibold text-red-600">No Refund</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="max-w-3xl mx-auto">
            <article className="prose prose-sm max-w-none">
              <ReactMarkdown>{policy.content}</ReactMarkdown>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
