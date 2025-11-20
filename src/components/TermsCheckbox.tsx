import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import { getTermsAndConditions, getCancellationPolicy } from '../services/legalService';

interface TermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  type?: 'booking' | 'posting';
  className?: string;
}

/**
 * Reusable Terms & Conditions Checkbox Component
 * Shows a summary with link to view full terms
 */
export default function TermsCheckbox({ 
  checked, 
  onChange, 
  type = 'booking',
  className = ''
}: TermsCheckboxProps) {
  const navigate = useNavigate();
  const [termsVersion, setTermsVersion] = useState<string>('');
  const [cancellationVersion, setCancellationVersion] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTermsVersions();
  }, []);

  const loadTermsVersions = async () => {
    try {
      const [terms, cancellation] = await Promise.all([
        getTermsAndConditions(),
        getCancellationPolicy()
      ]);
      
      if (terms) {
        setTermsVersion(terms.version);
      }
      if (cancellation) {
        setCancellationVersion(cancellation.version);
      }
    } catch (error) {
      console.error('Error loading terms versions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewTerms = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate('/terms');
  };

  const handleViewCancellation = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate('/cancellation-policy');
  };

  const summaryText = type === 'booking' 
    ? 'I agree to the Terms & Conditions and Cancellation Policy.'
    : 'I accept the Terms & Conditions and Cancellation Policy, and confirm all information is accurate.';

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 flex-shrink-0"
        />
        <div className="flex-1">
          <p className="text-xs text-gray-700 leading-snug">
            {summaryText}
          </p>
          
          {/* View Full Terms Links */}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={handleViewTerms}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 active:text-blue-800"
            >
              <FileText className="w-3 h-3" />
              <span>Terms</span>
              {termsVersion && (
                <span className="text-gray-500">(v{termsVersion})</span>
              )}
            </button>
            
            <button
              onClick={handleViewCancellation}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700 active:text-blue-800"
            >
              <FileText className="w-3 h-3" />
              <span>Cancellation</span>
              {cancellationVersion && (
                <span className="text-gray-500">(v{cancellationVersion})</span>
              )}
            </button>
          </div>
        </div>
      </label>
      
      {!checked && (
        <div className="mt-1.5 ml-6 text-[10px] text-orange-600 font-medium">
          ⚠️ Required to continue
        </div>
      )}
    </div>
  );
}
