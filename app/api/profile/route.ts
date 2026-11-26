import { admin, handle, HttpError, requireUid, parseLatLng, FieldValue } from '@/lib/server/admin';
import { reverseGeocode } from '@/lib/server/geo';
import { setPoint, deletePoint, syncPointSettings } from '@/lib/server/points';
import { BASE_KINDS, RADIUS_OPTIONS_KM, DEFAULT_RADIUS_KM } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 設定の保存
 *  { name?, notify?, radiusKm? }                       基本設定
 *  { base: 'home'|'work', lat, lng }                   GPSで拠点の位置を登録（住所は丁目まで下書き）
 *  { base: 'home'|'work', address }                    拠点の住所（番地まで）を保存
 *  { base: 'home'|'work', remove: true }               拠点を削除
 */
export const POST = handle(async (req) => {
  const uid = await requireUid(req);
  const body = await req.json();
  const { db } = admin();
  const ref = db.collection('users').doc(uid);
  const user = (await ref.get()).data() || {};

  if (body.base !== undefined) {
    const kind = body.base;
    if (!(kind in BASE_KINDS)) throw new HttpError(400, '拠点の種類が不正です');
    if (body.remove) {
      await deletePoint(uid, kind);
      await ref.update({ [`bases.${kind}`]: FieldValue.delete() });
      return { ok: true };
    }
    if (body.lat !== undefined) {
      const { lat, lng } = parseLatLng(body);
      const rLat = Math.round(lat * 1000) / 1000;
      const rLng = Math.round(lng * 1000) / 1000;
      const { address } = await reverseGeocode(rLat, rLng);
      await ref.set({ bases: { [kind]: { address } } }, { merge: true });
      await setPoint(uid, kind, rLat, rLng);
      return { address };
    }
    const addr = String(body.address ?? '').trim();
    if (addr.length < 1 || addr.length > 100) throw new HttpError(400, '住所は1〜100文字です');
    if (!user.bases?.[kind]) throw new HttpError(400, '先に「今いる場所を登録」を押してください');
    await ref.set({ bases: { [kind]: { address: addr } } }, { merge: true });
    return { ok: true };
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 1 || name.length > 20) throw new HttpError(400, 'ニックネームは1〜20文字です');
    update.name = name;
  }
  if (body.notify !== undefined) update.notify = !!body.notify;
  if (body.radiusKm !== undefined) {
    const r = Number(body.radiusKm);
    if (!(RADIUS_OPTIONS_KM as readonly number[]).includes(r)) throw new HttpError(400, '距離が不正です');
    update.radiusKm = r;
  }
  await ref.set(update, { merge: true });
  await syncPointSettings(
    uid,
    ((update.radiusKm as number) ?? user.radiusKm ?? DEFAULT_RADIUS_KM) * 1000,
    (update.notify as boolean) ?? user.notify !== false,
  );
  return { ok: true };
});
