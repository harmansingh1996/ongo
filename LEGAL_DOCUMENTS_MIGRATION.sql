-- Migration: Create legal_documents table for Terms & Conditions and Policies
-- This table stores all legal documents that users must agree to

-- Create legal_documents table
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('terms', 'privacy', 'cancellation', 'refund')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  version VARCHAR(20) NOT NULL DEFAULT '1.0',
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_legal_documents_type ON legal_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_legal_documents_active ON legal_documents(is_active);
CREATE INDEX IF NOT EXISTS idx_legal_documents_type_active ON legal_documents(document_type, is_active);

-- Add RLS (Row Level Security) policies
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;

-- Allow all users to read active legal documents
CREATE POLICY "Anyone can read active legal documents"
  ON legal_documents
  FOR SELECT
  USING (is_active = true);

-- Create user_agreement_acceptances table to track user acceptances
CREATE TABLE IF NOT EXISTS user_agreement_acceptances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL,
  accepted_version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  UNIQUE(user_id, document_id)
);

-- Create indexes for user agreement tracking
CREATE INDEX IF NOT EXISTS idx_user_agreements_user ON user_agreement_acceptances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agreements_document ON user_agreement_acceptances(document_id);
CREATE INDEX IF NOT EXISTS idx_user_agreements_type ON user_agreement_acceptances(document_type);

-- Enable RLS for user agreements
ALTER TABLE user_agreement_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can only read their own acceptances
CREATE POLICY "Users can read own acceptances"
  ON user_agreement_acceptances
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own acceptances
CREATE POLICY "Users can accept documents"
  ON user_agreement_acceptances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Insert initial Terms & Conditions
INSERT INTO legal_documents (document_type, title, content, version, effective_date, is_active) VALUES
('terms', 'Terms and Conditions', '# OnGoPool Terms and Conditions

## 1. Eligibility
You must be at least 18 years old to register and use this App.

Drivers must hold a valid driver''s licence and maintain insurance as required by law.

Riders must comply with all applicable laws and safety requirements.

## 2. Services Provided
OnGoPool is a platform that connects drivers offering rides with riders seeking transportation.

OnGoPool does not provide transportation services; drivers are independent providers.

We facilitate payments, communications, and safety features between users.

## 3. User Responsibilities

### Drivers must:
- Ensure their vehicles are roadworthy, insured, and compliant with Canadian law
- Maintain valid driver''s license and vehicle registration
- Conduct themselves professionally and safely
- Not discriminate against riders based on protected characteristics

### Riders must:
- Behave respectfully, pay applicable fees, and comply with ride arrangements
- Provide accurate pickup and destination information
- Be punctual for scheduled rides
- Treat drivers and other passengers with respect

## 4. Payments and Fees
Payments are processed through the App''s secure payment system.

Fees may include ride charges, service fees, and applicable taxes.

Drivers receive payment after the ride is completed, minus service fees.

All prices are displayed in Canadian dollars (CAD).

## 5. Cancellation and Refund Policy
See our separate Cancellation Policy for detailed information.

## 6. Safety and Security
- User verification processes including driver license checks
- In-app emergency contact features and real-time trip tracking
- User rating and review system for community safety
- Report safety concerns through in-app reporting tools

## 12. Governing Law and Consumer Rights

### 🇨🇦 Canadian Consumer Protection Rights
**IMPORTANT**: Your rights as a consumer are protected under Canadian law. These Terms do not limit your rights under:

- **Ontario Users**: Consumer Protection Act, 2002 provides additional cancellation rights
- **Quebec Users**: Consumer Protection Act provides enhanced protections
- **All Provinces**: Competition Act (Canada) protections and provincial consumer protection legislation

## 14. Contact Information

**OnGoPool Support**
- Email: support@ongopool.ca
- Phone: 1-800-ONGOPOOL (1-800-664-6766)
- Website: www.ongopool.ca
- Emergency Safety: safety@ongopool.ca', '1.0', CURRENT_DATE, true);

-- Insert Cancellation Policy
INSERT INTO legal_documents (document_type, title, content, version, effective_date, is_active) VALUES
('cancellation', 'Cancellation and Refund Policy', '# OnGoPool Cancellation and Refund Policy

## Cancellation Timeline and Refunds

### Cancellation more than 12 hours before departure
- ✅ **Full refund** of the ride fare
- ❌ Service fees (if any) are **non-refundable**

### Cancellation between 6 and 12 hours before departure
- ✅ **50% refund** of the ride fare
- ❌ Service fees (if any) are **non-refundable**

### Cancellation less than 6 hours before departure or no-show
- ❌ **No refund** will be issued

## How to Cancel a Ride

### For Riders:
1. Open the OnGoPool app
2. Go to "My Trips"
3. Select the ride you want to cancel
4. Tap "Cancel Ride"
5. Confirm cancellation

### For Drivers:
1. Open the OnGoPool app
2. Go to "My Rides"
3. Select the ride you want to cancel
4. Tap "Cancel Ride"
5. Provide a reason (if required)
6. Confirm cancellation

## Refund Processing

Refunds are processed back to the original payment method within:
- **Credit/Debit Cards**: 5-10 business days
- **PayPal**: 3-5 business days
- **Other payment methods**: Up to 14 business days

## Driver Cancellation Consequences

Frequent cancellations by drivers may result in:
- ⚠️ Warning notifications
- 📉 Lower driver rating
- 🚫 Temporary or permanent account suspension

## Emergency Cancellations

In case of emergencies (medical, vehicle breakdown, severe weather):
- Contact OnGoPool Support immediately
- Cancellation fees may be waived at our discretion
- Documentation may be required

## Disputes

If you disagree with a cancellation charge:
1. Contact support@ongopool.ca within 48 hours
2. Provide booking details and explanation
3. Our team will review and respond within 3 business days

## 🇨🇦 Canadian Consumer Rights

Your rights under Canadian consumer protection laws are not limited by this policy. Contact your provincial consumer protection office for more information.

## Contact Information

**OnGoPool Support**
- Email: support@ongopool.ca
- Phone: 1-800-ONGOPOOL (1-800-664-6766)
- Website: www.ongopool.ca', '1.0', CURRENT_DATE, true);

-- Add comments for documentation
COMMENT ON TABLE legal_documents IS 'Stores all legal documents including terms, policies, and agreements';
COMMENT ON TABLE user_agreement_acceptances IS 'Tracks which users have accepted which legal documents';

-- Verify the migration
SELECT 
  document_type, 
  title, 
  version, 
  effective_date, 
  is_active,
  LENGTH(content) as content_length
FROM legal_documents
ORDER BY document_type;
