import { create } from 'zustand';
import { User, AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,

  signIn: async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('Supabase auth error:', error);
        throw error;
      }

      if (data.user) {
        // Check if user profile already exists, create if not
        const { data: existingProfile } = await supabase
          .from('users')
          .select('id')
          .eq('id', data.user.id)
          .maybeSingle();

        if (!existingProfile) {
          // Create user profile if it doesn't exist
          const { error: profileError } = await supabase
            .from('users')
            .insert(
              [
                {
                  id: data.user.id,
                  email: data.user.email,
                  display_name: data.user.user_metadata.display_name || data.user.email?.split('@')[0] || 'User',
                  photo_url: data.user.user_metadata.avatar_url,
                  license_verification_status: 'unverified', // Default license status
                  is_driver: false, // Default driver status
                },
              ],
              { returning: 'minimal' }
            );

          if (profileError) {
            console.error('Error creating user profile:', profileError);
          } else {
            console.log('User profile created successfully for:', data.user.id);
          }
        }

        set({ user: data.user });
      }
    } catch (error) {
      console.error('Error during sign in:', error);

      if (
        error instanceof AuthRetryableFetchError ||
        (error instanceof Error &&
          (error.message.includes('fetch failed') || error.message.includes('network')))
      ) {
        throw new Error('Load failed - Unable to connect to authentication service. Please check your internet connection.');
      }

      if (error instanceof AuthApiError) {
        throw error;
      }

      throw error instanceof Error ? error : new Error('Unexpected authentication error');
    }
  },

  signUp: async (email: string, password: string, displayName: string) => {
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
        console.error('Supabase signup error:', error);
        throw error;
      }

      if (data.user) {
        // Create user profile in our custom users table
        const { error: profileError } = await supabase
          .from('users')
          .insert([
            {
              id: data.user.id,
              email: data.user.email,
              display_name: displayName,
              photo_url: data.user.user_metadata.avatar_url,
              license_verification_status: 'unverified', // Default license status
              is_driver: false, // Default driver status
            },
          ]);

        if (profileError) {
          console.error('Error creating user profile:', profileError);
        }

        set({ user: data.user });
      }
    } catch (error) {
      console.error('Error during sign up:', error);

      if (
        error instanceof AuthRetryableFetchError ||
        (error instanceof Error &&
          (error.message.includes('fetch failed') || error.message.includes('network')))
      ) {
        throw new Error('Load failed - Unable to connect to authentication service. Please check your internet connection.');
      }

      if (error instanceof AuthApiError) {
        throw error;
      }

      throw error instanceof Error ? error : new Error('Unexpected authentication error');
    }
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    set({ user: null });
  },

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // Check if user profile exists, create if not
        const { data: existingProfile } = await supabase
          .from('users')
          .select('id')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!existingProfile) {
          // Create user profile if it doesn't exist
          const { error: profileError } = await supabase
            .from('users')
            .insert(
              [
                {
                  id: session.user.id,
                  email: session.user.email,
                  display_name: session.user.user_metadata.display_name || session.user.email?.split('@')[0] || 'User',
                  photo_url: session.user.user_metadata.avatar_url,
                  license_verification_status: 'unverified', // Default license status
                  is_driver: false, // Default driver status
                },
              ],
              { returning: 'minimal' }
            );

          if (profileError) {
            console.error('Error creating user profile:', profileError);
          } else {
            console.log('User profile created successfully for:', session.user.id);
          }
        }
      }
      
      set({ user: session?.user || null, loading: false });

      supabase.auth.onAuthStateChange(async (event, session) => {
        let user = session?.user || null;
        
        if (user) {
          // Check if user profile exists, create if not
          const { data: existingProfile } = await supabase
            .from('users')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();

          if (!existingProfile) {
            // Create user profile if it doesn't exist
            const { error: profileError } = await supabase
              .from('users')
              .insert(
                [
                  {
                    id: user.id,
                    email: user.email,
                    display_name: user.user_metadata.display_name || user.email?.split('@')[0] || 'User',
                    photo_url: user.user_metadata.avatar_url,
                    license_verification_status: 'unverified', // Default license status
                    is_driver: false, // Default driver status
                  },
                ],
                { returning: 'minimal' }
              );

            if (profileError) {
              console.error('Error creating user profile:', profileError);
            } else {
              console.log('User profile created successfully for:', user.id);
            }
          }
        }
        
        set({ user, loading: false });
      });
    } catch (error) {
      set({ loading: false });
    }
  },
}));