import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseServiceClient: SupabaseClient | null = null;

/**
 * Get Supabase client with service role key (admin access)
 * Used for server-side operations that bypass RLS
 */
export function getSupabaseServiceClient(): SupabaseClient {
  if (supabaseServiceClient) {
    return supabaseServiceClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  supabaseServiceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseServiceClient;
}

/**
 * Get Supabase client with user context (respects RLS)
 * Used for user-authenticated operations
 */
export function getSupabaseClientWithAuth(authToken: string): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authToken,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Verify user authentication and return user ID
 */
export async function verifyUserAuth(authToken: string): Promise<string> {
  const client = getSupabaseClientWithAuth(authToken);
  
  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized: Invalid or missing authentication token');
  }

  return user.id;
}
