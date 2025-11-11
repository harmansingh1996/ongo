import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  authLoading: boolean;
  refresh: () => Promise<void>;
  signIn: (credentials: { email: string; password: string }) => Promise<void>;
  signUp: (
    credentials: { email: string; password: string; displayName: string }
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

type ProfilePayload = {
  id: string;
  email?: string | null;
  display_name?: string | null;
  photo_url?: string | null;
  license_verification_status?: string;
  is_driver?: boolean;
};

async function ensureProfile(user: User, overrides?: Partial<ProfilePayload>) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    const payload: ProfilePayload = {
      id: user.id,
      email: user.email,
      display_name:
        overrides?.display_name ||
        user.user_metadata?.display_name ||
        user.email?.split("@")[0] ||
        "OnGoPool rider",
      photo_url: user.user_metadata?.avatar_url ?? null,
      license_verification_status: "unverified",
      is_driver: false,
      ...overrides,
    };

    const { error: insertError } = await supabase
      .from("users")
      .insert(payload, { returning: "minimal" });

    if (insertError) {
      throw insertError;
    }
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (isMounted) {
          setSession(session ?? null);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setLoading(false);
          Alert.alert("Authentication", "Unable to restore session.");
        }
      }
    };

    fetchSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession ?? null);
      }
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setSession(session ?? null);
    setLoading(false);
  };

  const signIn = async ({ email, password }: { email: string; password: string }) => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.session?.user) {
        await ensureProfile(data.session.user);
        setSession(data.session);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const signUp = async ({
    email,
    password,
    displayName,
  }: {
    email: string;
    password: string;
    displayName: string;
  }) => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session?.user) {
        await ensureProfile(data.session.user, {
          display_name: displayName,
        });
        setSession(data.session);
      } else if (data.user) {
        await ensureProfile(data.user, {
          display_name: displayName,
        });
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      setSession(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      authLoading,
      refresh,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, authLoading]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
}
