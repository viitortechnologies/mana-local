import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout } from '@/src/lib/requestWithTimeout';
import type { Profile } from '@/src/lib/types';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isProfileComplete: boolean;
  isWithin21Days: boolean;
  canPost: boolean;
  showProfileBanner: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const PROFILE_MANDATORY = ['name', 'gender', 'email', 'job_type', 'area', 'avatar_url', 'date_of_birth'] as const;

function isProfileComplete(p: Profile | null): boolean {
  if (!p) return false;
  // Primary, forward-looking flag: once profile_completed_at is set (shield on profile),
  // we always treat the profile as complete, regardless of email verification method.
  if (p.profile_completed_at) return true;

  // Backwards compatibility for older users created before profile_completed_at existed.
  for (const key of PROFILE_MANDATORY) {
    const v = p[key as keyof Profile];
    if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return false;
  }
  return !!p.email_verified_at;
}

function isWithin21Days(createdAt: string | null): boolean {
  if (!createdAt) return true;
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  return now - created < 21 * 24 * 60 * 60 * 1000;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async (uid: string, userEmailConfirmed?: string | null, retry = false) => {
    try {
      const { data, error } = await requestWithTimeout(supabase.from('profiles').select('*').eq('id', uid).single());
      if (error) {
        if (__DEV__) console.warn('[AuthContext] Profile fetch failed:', error.message, error.code);
        if (!retry) {
          await new Promise((r) => setTimeout(r, 500));
          return fetchProfile(uid, userEmailConfirmed, true);
        }
        setProfile(null);
        return null;
      }
      const p = data as Profile | null;
      if (p && userEmailConfirmed && !p.email_verified_at) {
        try {
          await requestWithTimeout(supabase.from('profiles').update({ email_verified_at: userEmailConfirmed, updated_at: new Date().toISOString() }).eq('id', uid));
          const res = await requestWithTimeout(supabase.from('profiles').select('*').eq('id', uid).single()) as { data: Profile | null; error: unknown };
          if (!res.error && res.data) {
            setProfile(res.data);
            return res.data;
          }
        } catch {
          // Timeout or failure; keep p
        }
        setProfile(p);
        return p;
      }
      setProfile(p);
      return p;
    } catch (e: unknown) {
      const isTimeout = (e as { message?: string })?.message === 'REQUEST_TIMEOUT';
      if (__DEV__) console.warn('[AuthContext] Profile fetch failed:', isTimeout ? 'timeout' : (e as Error)?.message);
      if (!retry && !isTimeout) {
        await new Promise((r) => setTimeout(r, 500));
        return fetchProfile(uid, userEmailConfirmed, true);
      }
      setProfile(null);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        await fetchProfile(session.user.id, (session.user as { email_confirmed_at?: string }).email_confirmed_at);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user?.id) fetchProfile(s.user.id, (s.user as { email_confirmed_at?: string }).email_confirmed_at).then(() => setIsLoading(false));
      else setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const isProfileCompleteFlag = isProfileComplete(profile);
  const within21 = isWithin21Days(profile?.created_at ?? null);
  // Any authenticated user with profile complete or within 21 days can post (no admin can_post gate)
  const canPost = !!user && (isProfileCompleteFlag || within21);
  // Hide banner when profile is completed (profile_completed_at set — same as shield on profile screen)
  const showProfileBanner =
    !profile?.profile_completed_at && !isProfileCompleteFlag && !within21;

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      isLoading,
      isProfileComplete: isProfileCompleteFlag,
      isWithin21Days: within21,
      canPost,
      showProfileBanner,
      refreshProfile,
      signOut,
    }),
    [
      session,
      user,
      profile,
      isLoading,
      isProfileCompleteFlag,
      within21,
      canPost,
      showProfileBanner,
      refreshProfile,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
