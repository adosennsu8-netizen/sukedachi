import { admin, handle, HttpError, FieldValue } from '@/lib/server/admin';
import { verifyLineIdToken } from '@/lib/server/line';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// LIFFのIDトークン → Firebaseカスタムトークン
export const POST = handle(async (req) => {
  const { idToken } = await req.json();
  if (!idToken) throw new HttpError(400, 'idTokenがありません');
  const profile = await verifyLineIdToken(idToken);
  const uid = profile.sub;
  const { auth, db } = admin();

  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      name: (profile.name || '名無し').slice(0, 20),
      notify: true,
      recentCalls: [],
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  const customToken = await auth.createCustomToken(uid);
  return { customToken };
});
