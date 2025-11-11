import { useEffect } from "react";
import { Redirect, router } from "expo-router";
import { View, ActivityIndicator } from "react-native";

import { useSession } from "@/components/providers";

export default function Index() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/auth/sign-in");
    }
  }, [loading, session]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return null;
  }

  return <Redirect href="/home" />;
}
