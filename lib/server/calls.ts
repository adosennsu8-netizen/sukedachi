import { admin, HttpError, FieldValue } from './admin';
import { AUTO_CLOSE_MIN } from '@/lib/config';

type Ref = FirebaseFirestore.DocumentReference;

/** ヘルプ者が最後に操作した時刻（発信・現在地送信・チャット） */
async function ownerLastActivity(ref: Ref, call: FirebaseFirestore.DocumentData): Promise<number> {
  let last = Math.max(call.createdAt?.toMillis?.() ?? 0, call.lastLocationAt?.toMillis?.() ?? 0);
  const recent = await ref.collection('messages').orderBy('createdAt', 'desc').limit(50).get();
  const mine = recent.docs.find((d) => d.data().uid === call.ownerUid);
  if (mine) last = Math.max(last, mine.data().createdAt?.toMillis?.() ?? 0);
  return last;
}

/** 進行中のコールを取得。ヘルプ者が30分無操作なら自動終了させる */
export async function getOpenCall(id: string) {
  const ref = admin().db.collection('calls').doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, 'ヘルプコールが見つかりません');
  const call = snap.data()!;
  if (call.status !== 'open') throw new HttpError(409, 'このヘルプコールは終了しています');
  if (Date.now() - (await ownerLastActivity(ref, call)) > AUTO_CLOSE_MIN * 60000) {
    await ref.update({ status: 'resolved', closedBy: 'auto', resolvedAt: FieldValue.serverTimestamp() });
    await ref.collection('messages').add({
      type: 'system',
      text: `ヘルプを出した人の操作が${AUTO_CLOSE_MIN}分なかったため、自動で終了しました`,
      createdAt: FieldValue.serverTimestamp(),
    });
    throw new HttpError(409, 'このヘルプコールは自動で終了しました');
  }
  return { ref, call };
}

export async function responderIds(ref: Ref) {
  const snap = await ref.collection('responders').get();
  return snap.docs.map((d) => d.id);
}

export function assertMember(call: FirebaseFirestore.DocumentData, uid: string) {
  if (!(call.members || []).includes(uid)) throw new HttpError(403, '通知を受けた人だけが参加できます');
}
