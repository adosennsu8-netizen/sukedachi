import { admin, handle, FieldValue, requireUid } from '@/lib/server/admin';
import { getOpenCall, assertMember } from '@/lib/server/calls';
import { pushEach } from '@/lib/server/line';
import { EXPAND_AFTER_SEC, EXPAND_IF_RESPONDERS_BELOW } from '@/lib/config';
import { notifyText } from '@/lib/server/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 段階送信：発信から2分たっても向かう人が2人未満なら、控えの人にも通知する
// ヘルプ者・メンバーの画面から2分後に呼ばれる（条件を満たさなければ何もしない）
export const POST = handle(async (req, { params }) => {
  const uid = await requireUid(req);
  const { ref, call } = await getOpenCall(params.id);
  assertMember(call, uid);
  if (call.expanded) return { expanded: false };
  if (Date.now() - (call.createdAt?.toMillis?.() ?? Date.now()) < EXPAND_AFTER_SEC * 1000) return { expanded: false };

  const { db } = admin();
  const responders = await ref.collection('responders').get();
  const result = await db.runTransaction(async (tx) => {
    // 読み取りを先にまとめる（トランザクションの制約）
    const fresh = (await tx.get(ref)).data()!;
    const reserve = (await tx.get(ref.collection('private').doc('reserve'))).data();
    if (fresh.expanded) return null;
    tx.update(ref, { expanded: true });
    if (responders.size >= EXPAND_IF_RESPONDERS_BELOW || !reserve?.list?.length) return null;
    tx.update(ref, {
      members: FieldValue.arrayUnion(...reserve.list.map((r: any) => r.uid)),
      notified: FieldValue.increment(reserve.list.length),
    });
    tx.set(ref.collection('messages').doc(), {
      type: 'system',
      text: `向かう人が少ないため、通知範囲を広げました（+${reserve.list.length}人）`,
      createdAt: FieldValue.serverTimestamp(),
    });
    return reserve;
  });
  if (!result) return { expanded: false };

  await pushEach(result.list.map((r: any) => ({ to: r.uid, text: notifyText(result.category, result.address, r, params.id) })));
  return { expanded: true, added: result.list.length };
});
