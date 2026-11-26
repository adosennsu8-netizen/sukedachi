import { handle, HttpError, requireUid, FieldValue } from '@/lib/server/admin';
import { getOpenCall, responderIds } from '@/lib/server/calls';
import { multicast } from '@/lib/server/line';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 解決（ヘルプを出した本人のみ）
export const POST = handle(async (req, { params }) => {
  const uid = await requireUid(req);
  const { ref, call } = await getOpenCall(params.id);
  if (call.ownerUid !== uid) throw new HttpError(403, '解決できるのはヘルプを出した本人だけです');

  await ref.update({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp() });
  await ref.collection('messages').add({
    type: 'system',
    text: '解決しました。ご協力ありがとうございました',
    createdAt: FieldValue.serverTimestamp(),
  });
  await multicast(await responderIds(ref), '【助太刀】向かっていたヘルプは解決しました。ご協力ありがとうございました。');
  return { ok: true };
});
