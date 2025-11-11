import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StripeProvider } from "@stripe/stripe-react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { SessionProvider } from "@/components/providers";
import { loadStripePublishableKey } from "@/config/stripe";

const queryClient = new QueryClient();
const STRIPE_SETUP_GUIDE_URL = "https://docs.stripe.com/payments/accept-a-payment?platform=react-native";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StripeLoader>
            <SessionProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="auth"
                  options={{
                    headerShown: false,
                    presentation: "modal",
                  }}
                />
              </Stack>
            </SessionProvider>
          </StripeLoader>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

type StripeLoaderState =
  | { status: "loading"; key: null; error: null }
  | { status: "ready"; key: string; error: null }
  | { status: "error"; key: null; error: string };

function StripeLoader({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StripeLoaderState>({
    status: "loading",
    key: null,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    loadStripePublishableKey()
      .then((value) => {
        if (!isMounted) return;

        if (value && value.trim().length > 0) {
          setState({ status: "ready", key: value, error: null });
        } else {
          setState({
            status: "error",
            key: null,
            error:
              "Stripe publishable key is not configured. Add `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to your Expo environment and reload the app.",
          });
        }
      })
      .catch((error) => {
        console.error("Failed to load Stripe publishable key", error);
        if (!isMounted) return;
        setState({
          status: "error",
          key: null,
          error:
            "We couldn't load Stripe. Verify your internet connection and that the publishable key is defined in your Expo config.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <View style={styles.statusContainer}>
        <ActivityIndicator size="large" color="#0f172a" />
        <Text style={styles.statusTitle}>Preparing payment services…</Text>
        <Text style={styles.statusSubtitle}>
          Hold on while we finish setting up Stripe.
        </Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.statusContainer}>
        <Text style={styles.statusTitle}>Stripe configuration required</Text>
        <Text style={styles.statusSubtitle}>{state.error}</Text>
        <Pressable
          style={styles.linkButton}
          onPress={() => Linking.openURL(STRIPE_SETUP_GUIDE_URL)}
        >
          <Text style={styles.linkButtonText}>Open Stripe setup guide</Text>
        </Pressable>
      </View>
    );
  }

  return <StripeProvider publishableKey={state.key}>{children}</StripeProvider>;
}

const styles = StyleSheet.create({
  statusContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#f8fafc",
    gap: 12,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    color: "#0f172a",
  },
  statusSubtitle: {
    fontSize: 14,
    textAlign: "center",
    color: "#334155",
  },
  linkButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9999,
    backgroundColor: "#0f172a",
  },
  linkButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
});
