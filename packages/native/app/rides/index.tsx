import { View, Text, StyleSheet } from "react-native";

export default function RidesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upcoming rides</Text>
      <Text style={styles.text}>Hook into Supabase rides endpoint here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  text: {
    fontSize: 16,
    color: "#475569",
  },
});
