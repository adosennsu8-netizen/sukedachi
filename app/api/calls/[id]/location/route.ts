import { geohashForLocation } from 'geofire-common';
import { handle, HttpError, requireUid, parseLatLng, FieldValue } from '@/lib/server/admin';
import { getOpenCall, responderIds } from '@/lib/server/calls';
import { reverseGeocode } from '@/lib/server/geo';
import { multicast, liffUrl } from '@/lib/server/line';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 現在地送信（ヘルプを出した本人のみ）
export const POST = handle(async (req, { params }) => {
  const uid = await requireUid(req);
  const { lat, lng } = parseLatLng(await req.json());
  const { ref, call } = await getOpenCall(params.id);
  if (call.ownerUid !== uid) throw new HttpError(403, '現在地を送れるのはヘルプを出した本人だけです');

  const { address } = await reverseGeocode(lat, lng);
  await ref.update({ lat, lng, geohash: geohashForLocation([lat, lng]), address, lastLocationAt: FieldValue.serverTimestamp() });
  await ref.collection('messages').add({
    type: 'location',
    text: `現在地：${address}付近`,
    lat,
    lng,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 移動中の駆けつけ者にも届ける
  await multicast(
    await responderIds(ref),
    `【助太刀】現在地が更新されました\n${address}付近\n${liffUrl(`/call/${params.id}`)}`,
  );
  return { address };
});
