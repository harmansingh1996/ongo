import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { useSession } from "@/components/providers";

export default function HomeScreen() {
  const { user, signOut, authLoading } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>OnGoPool Native</Text>
      <Text style={styles.subtitle}>Signed in as</Text>
      <Text style={styles.email}>{user?.email}</Text>

      <TouchableOpacity
        style={styles.button}
        onPress={signOut}
        disabled={authLoading}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 16,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 16,
    color: "#64748b",
  },
  email: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1e293b",
  },
  button: {
    marginTop: 32,
    borderRadius: 14,
    backgroundColor: "#ef4444",
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
  },
});
