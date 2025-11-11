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
  ScrollView,
} from "react-native";
import { Link, useRouter } from "expo-router";

import { useSession } from "@/components/providers";

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, authLoading, session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const disabled = useMemo(() => {
    return (
      !email.trim() || !password.trim() || !displayName.trim() || authLoading
    );
  }, [email, password, displayName, authLoading]);

  const handleSignUp = async () => {
    try {
      setErrorMessage(null);
      await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
      });
      router.replace("/home");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sign up right now. Please try again.";
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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Join OnGoPool</Text>
          <Text style={styles.subtitle}>
            Create your account to discover shared rides around Ontario.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              style={styles.input}
              placeholder="Alex Johnson"
              autoCapitalize="words"
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Create a password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={password}
              onChangeText={setPassword}
            />
            <Text style={styles.helperText}>
              Use at least 8 characters, with a mix of letters and numbers.
            </Text>
            {errorMessage ? (
              <Text style={styles.errorText}>{errorMessage}</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
            onPress={handleSignUp}
            disabled={disabled}
            activeOpacity={0.8}
          >
            {authLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>Create account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linkRow}>
            <Text style={styles.linkPrompt}>Already have an account?</Text>
            <Link href="/auth/sign-in" style={styles.link}>
              Sign in
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
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
    marginTop: 12,
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
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b",
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
