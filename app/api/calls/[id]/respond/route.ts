import { admin, handle, HttpError, requireUid, FieldValue } from '@/lib/server/admin';
import { getOpenCall, assertMember } from '@/lib/server/calls';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 駆けつけ状態の変更
//  { action: 'go' }      助けに行く
//  { action: 'cancel' }  取りやめる
//  { action: 'arrive' }  到着した → 助太刀証を表示
export const POST = handle(async (req, { params }) => {
  const uid = await requireUid(req);
  const { action } = await req.json();
  if (!['go', 'cancel', 'arrive'].includes(action)) throw new HttpError(400, '操作が不正です');
  const { ref, call } = await getOpenCall(params.id);
  if (call.ownerUid === uid) throw new HttpError(400, '自分のヘルプには参加できません');
  assertMember(call, uid);

  const { db } = admin();
  const name = (await db.collection('users').doc(uid).get()).data()?.name || '名無し';
  const rRef = ref.collection('responders').doc(uid);
  const msg = (text: string) => ({ type: 'system', text, createdAt: FieldValue.serverTimestamp() });

  await db.runTransaction(async (tx) => {
    const r = await tx.get(rRef);
    const status = r.data()?.status;
    if (action === 'go' && !r.exists) {
      tx.set(rRef, { name, status: 'going', at: FieldValue.serverTimestamp() });
      tx.set(ref.collection('messages').doc(), msg(`${name}さんが向かっています`));
    } else if (action === 'cancel' && r.exists && status !== 'arrived') {
      tx.delete(rRef);
      tx.set(ref.collection('messages').doc(), msg(`${name}さんが向かうのを取りやめました`));
    } else if (action === 'arrive' && status !== 'arrived') {
      tx.set(rRef, { name, status: 'arrived', arrivedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.set(ref.collection('messages').doc(), msg(`${name}さんが到着しました（照合番号を確認してください）`));
    }
  });
  return { ok: true };
});
