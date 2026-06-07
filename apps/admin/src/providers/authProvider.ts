import { AuthProvider } from 'react-admin';
import { supabase } from '../supabaseClient';

export const authProvider: AuthProvider = {
  login: async ({ username, password }: { username: string; password: string }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: username,
      password,
    });
    if (error) throw new Error(error.message);
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  checkAuth: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Не авторизовано');
  },

  checkError: async (error: { status?: number }) => {
    if (error?.status === 401 || error?.status === 403) {
      throw new Error('Сесія закінчилась');
    }
  },

  getPermissions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.role ?? 'anon';
  },

  getIdentity: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Не авторизовано');
    return {
      id: user.id,
      fullName: user.user_metadata?.full_name ?? user.email ?? 'Admin',
      avatar: user.user_metadata?.avatar_url,
    };
  },
};
