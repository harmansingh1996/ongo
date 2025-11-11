import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Link, useRouter } from "expo-router";

import { useSession } from "@/components/providers";

export default function SignInScreen() {
  const router = useRouter();
  const { signIn, authLoading, session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const disabled = useMemo(() => {
    return !email.trim() || !password.trim() || authLoading;
  }, [email, password, authLoading]);

  const handleSignIn = async () => {
    try {
      setErrorMessage(null);
      await signIn({ email: email.trim(), password });
      router.replace("/home");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sign in right now. Please try again.";
      setErrorMessage(message);
    }
  };

  useEffect(() => {
    if (session) {
      router.replace("/home");
    }
  }, [session, router]);

  if (session) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: "padding", android: undefined })}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue booking rides.</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
          />
          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
          onPress={handleSignIn}
          disabled={disabled}
          activeOpacity={0.8}
        >
          {authLoading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <View style={styles.linkRow}>
          <Text style={styles.linkPrompt}>Need an account?</Text>
          <Link href="/auth/sign-up" style={styles.link}>
            Sign up
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f8fafc",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    textAlign: "center",
    color: "#475569",
  },
  fieldGroup: {
    marginTop: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5f5",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    backgroundColor: "#f8fafc",
  },
  primaryButton: {
    marginTop: 32,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: "#93c5fd",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  linkRow: {
    marginTop: 24,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  linkPrompt: {
    fontSize: 14,
    color: "#64748b",
  },
  link: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
  },
  errorText: {
    marginTop: 8,
    color: "#ef4444",
    fontSize: 13,
  },
});
