import { admin, handle, HttpError, requireUid, FieldValue } from '@/lib/server/admin';
import { assertMember } from '@/lib/server/calls';
import { SUSPEND_AFTER_REPORTS } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// いたずら報告（通知を受けた人のみ・1ヘルプにつき1人1回）。解決後でも可
// いたずら報告されたヘルプが2件たまった発信者は発信停止
export const POST = handle(async (req, { params }) => {
  const uid = await requireUid(req);
  const { db } = admin();
  const ref = db.collection('calls').doc(params.id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'ヘルプコールが見つかりません');
  const call = snap.data()!;
  if (call.ownerUid === uid) throw new HttpError(400, '自分のヘルプは報告できません');
  assertMember(call, uid);

  const ownerRef = db.collection('users').doc(call.ownerUid);
  await db.runTransaction(async (tx) => {
    const rRef = ref.collection('reports').doc(uid);
    if ((await tx.get(rRef)).exists) throw new HttpError(409, 'すでに報告済みです');
    const c = (await tx.get(ref)).data()!;
    const owner = (await tx.get(ownerRef)).data() || {};
    tx.set(rRef, { at: FieldValue.serverTimestamp() });
    tx.update(ref, { reportCount: FieldValue.increment(1) });
    // 1つのヘルプにつき発信者のカウントは1回だけ増やす
    if (!c.reportCount) {
      const reported = (owner.reportedCalls || 0) + 1;
      tx.update(ownerRef, { reportedCalls: reported, ...(reported >= SUSPEND_AFTER_REPORTS ? { suspended: true } : {}) });
    }
  });
  return { ok: true };
});
