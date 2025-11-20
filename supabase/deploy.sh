#!/bin/bash

# Stripe Edge Function Deployment Script
# This script helps you deploy the Stripe payment Edge Function to Supabase

set -e

echo "🚀 Stripe Edge Function Deployment"
echo "==================================="
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found!"
    echo ""
    echo "Install it first:"
    echo "  macOS: brew install supabase/tap/supabase"
    echo "  Windows: scoop install supabase"
    echo "  Or download from: https://github.com/supabase/cli/releases"
    exit 1
fi

echo "✅ Supabase CLI found"
echo ""

# Check if user is logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase"
    echo ""
    echo "Please login first:"
    echo "  supabase login"
    exit 1
fi

echo "✅ Logged in to Supabase"
echo ""

# Check if project is linked
if [ ! -f ".supabase/config.toml" ]; then
    echo "⚠️  Project not linked"
    echo ""
    echo "Link your project:"
    read -p "Enter your Supabase project ref: " PROJECT_REF
    supabase link --project-ref "$PROJECT_REF"
    echo ""
fi

echo "✅ Project linked"
echo ""

# Check environment variables
echo "🔐 Checking environment variables..."
echo ""

if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found"
    echo ""
    echo "Please create .env.local with:"
    echo "  STRIPE_SECRET_KEY=sk_test_your_key"
    echo "  STRIPE_WEBHOOK_SECRET=whsec_your_secret"
    echo ""
    read -p "Do you want to set secrets manually now? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Stripe Secret Key: " STRIPE_KEY
        supabase secrets set STRIPE_SECRET_KEY="$STRIPE_KEY"
        
        read -p "Enter your Stripe Webhook Secret (optional, press enter to skip): " WEBHOOK_SECRET
        if [ ! -z "$WEBHOOK_SECRET" ]; then
            supabase secrets set STRIPE_WEBHOOK_SECRET="$WEBHOOK_SECRET"
        fi
        
        echo "✅ Secrets set"
    else
        echo "❌ Please set secrets before deploying"
        echo "  supabase secrets set STRIPE_SECRET_KEY=sk_test_xxx"
        exit 1
    fi
else
    echo "✅ .env.local found"
    echo ""
    echo "Setting secrets from .env.local..."
    supabase secrets set --env-file .env.local
    echo "✅ Secrets set"
fi

echo ""
echo "🚀 Deploying Edge Function..."
echo ""

# Deploy the function
supabase functions deploy stripe-payment

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Get your function URL from Supabase Dashboard"
echo "2. Update src/services/paymentService.ts to use the Edge Function"
echo "3. Test with Stripe test cards"
echo ""
echo "Function URL format:"
echo "  https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-payment"
echo ""
echo "See STRIPE_EDGE_FUNCTION_GUIDE.md for integration instructions"
