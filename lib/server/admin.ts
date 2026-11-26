import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

export { FieldValue };

export function admin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUid(req: Request): Promise<string> {
  const h = req.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'ログインが必要です');
  try {
    const decoded = await admin().auth.verifyIdToken(token);
    return decoded.uid;
  } catch {
    throw new HttpError(401, 'セッションが切れました。開き直してください');
  }
}

export function handle(fn: (req: Request, ctx: any) => Promise<unknown>) {
  return async (req: Request, ctx: any) => {
    try {
      const data = await fn(req, ctx);
      return NextResponse.json(data ?? { ok: true });
    } catch (e: any) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
    }
  };
}

export function parseLatLng(body: any): { lat: number; lng: number } {
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  // 日本周辺のみ許可
  if (!(lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154)) {
    throw new HttpError(400, '位置情報が不正です');
  }
  return { lat, lng };
}
