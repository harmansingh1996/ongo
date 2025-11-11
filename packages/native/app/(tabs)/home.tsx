import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useSession } from "@/components/providers";

export default function HomeRedirector() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/auth/sign-in" />;
  }

  return <Redirect href="/home" />;
}
