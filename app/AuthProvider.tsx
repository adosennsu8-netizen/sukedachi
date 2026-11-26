'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { api, fb, getPosition } from '@/lib/firebaseClient';

export type UserDoc = {
  name: string;
  notify?: boolean;
  radiusKm?: number;
  suspended?: boolean;
  bases?: Partial<Record<'home' | 'work', { address: string }>>;
};

type Ctx = { uid: string | null; user: UserDoc | null; error: string | null; ready: boolean };
const AuthCtx = createContext<Ctx>({ uid: null, user: null, error: null, ready: false });
export const useAuth = () => useContext(AuthCtx);

const PUBLIC_PATHS = ['/stats'];

export default function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.some((p) => pathname?.startsWith(p));
  const [uid, setUid] = useState<string | null>(null);
  const [user, setUser] = useState<UserDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isPublic) return;
    let cancelled = false;
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || '' });
        const { auth } = fb();
        await auth.authStateReady();
        if (!auth.currentUser) {
          if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
          }
          const idToken = liff.getIDToken();
          const res = await fetch('/api/auth/line', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          });
          if (res.status === 401) {
            // IDトークン期限切れ → 再ログイン
            liff.logout();
            liff.login({ redirectUri: window.location.href });
            return;
          }
          const json = await res.json();
          if (!res.ok) throw new Error(json.error);
          await signInWithCustomToken(auth, json.customToken);
        }
        if (!cancelled) setUid(auth.currentUser!.uid);
        // 開いた場所を「最後にいた場所」として記録（失敗しても無視）
        getPosition().then((p) => api('/api/ping', p)).catch(() => {});
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'ログインに失敗しました');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPublic]);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(fb().db, 'users', uid), (s) => {
      setUser((s.data() as UserDoc) ?? null);
      setReady(true);
    });
  }, [uid]);

  if (isPublic) return <>{children}</>;
  if (error) return <div className="center"><p className="err">{error}</p></div>;
  if (!ready) return <div className="center"><p className="muted">読み込み中…</p></div>;
  return <AuthCtx.Provider value={{ uid, user, error, ready }}>{children}</AuthCtx.Provider>;
}
