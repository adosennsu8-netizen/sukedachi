import { handle, requireUid, parseLatLng } from '@/lib/server/admin';
import { setPoint } from '@/lib/server/points';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// アプリを開いた場所を「最後にいた場所」として記録（約100m単位に丸める）
export const POST = handle(async (req) => {
  const uid = await requireUid(req);
  const { lat, lng } = parseLatLng(await req.json());
  await setPoint(uid, 'last', Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000);
  return { ok: true };
});
