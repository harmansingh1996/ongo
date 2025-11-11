# OnGoPool Native Companion

This directory houses the Expo-based mobile client for OnGoPool. The app consumes the same Supabase backend and Stripe / PayPal payment services as the existing web application.

## Getting Started

```bash
cd packages/native
npm install
npm run start
```

The project expects the following Expo public environment variables (add them to `packages/native/.env` or through EAS secrets):

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
```

## Structure

- `app/` – Expo Router-based navigation
- `src/config/` – runtime environment helpers
- `src/lib/` – Supabase client and shared utilities
- `src/components/providers/` – session context used across the app

Additional feature areas (rides, chat, profile) are scaffolded in `app/` for future build-out.

## Next steps

1. Connect rides listing and ride detail screens to Supabase queries and existing REST endpoints.
2. Implement payment flows using `@stripe/stripe-react-native` (card sheet) and a PayPal authorization WebView tied to current backend endpoints.
3. Build chat UI and realtime subscriptions leveraging Supabase channels and message read markers.
4. Wire notification registration (`expo-notifications`) to the existing notification service to deliver push alerts.
5. Share TypeScript models with the web app (move common interfaces into a `packages/shared` workspace or regenerate from Supabase types).
