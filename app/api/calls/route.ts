import { geohashForLocation } from 'geofire-common';
import { admin, handle, HttpError, requireUid, parseLatLng, FieldValue } from '@/lib/server/admin';
import { reverseGeocode } from '@/lib/server/geo';
import { pushEach } from '@/lib/server/line';
import { findRecipients } from '@/lib/server/points';
import { notifyText } from '@/lib/server/notify';
import { CATEGORIES, isCategory, STAGE1_NOTIFY } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_NOTIFY = Number(process.env.MAX_NOTIFY || 30);
const DAILY_LIMIT = Number(process.env.DAILY_CALL_LIMIT || 3);

// ヘルプボタン1回 = 新規チャット1つ。通知を受けた人だけがメンバーとして入れる
export const POST = handle(async (req) => {
  const uid = await requireUid(req);
  const body = await req.json();
  if (!isCategory(body.category)) throw new HttpError(400, '種別を選んでください');
  if (body.public !== true || body.stranger !== true) {
    throw new HttpError(400, '公共の場での見知らぬ相手とのトラブルのみ対象です');
  }
  const { lat, lng } = parseLatLng(body);
  const { db } = admin();

  // 停止中チェックと24時間の回数制限
  const userRef = db.collection('users').doc(uid);
  const now = Date.now();
  const user = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw new HttpError(403, 'ユーザー登録が必要です');
    const data = snap.data()!;
    if (data.suspended) throw new HttpError(403, 'いたずら報告が続いたため、発信が停止されています。緊急時は110番へ');
    const recent: number[] = (data.recentCalls || []).filter((t: number) => t > now - 86400000);
    if (recent.length >= DAILY_LIMIT) throw new HttpError(429, '24時間のヘルプ上限に達しました。110番を利用してください');
    tx.update(userRef, { recentCalls: [...recent, now], totalCalls: FieldValue.increment(1) });
    return data;
  });

  // 発信2回目までの新規ユーザーは通知人数を半分に
  const isNew = (user.totalCalls || 0) < 2;
  const maxTotal = isNew ? Math.ceil(MAX_NOTIFY / 2) : MAX_NOTIFY;
  const stage1 = isNew ? Math.ceil(STAGE1_NOTIFY / 2) : STAGE1_NOTIFY;

  const all = await findRecipients(lat, lng, uid, maxTotal);
  const first = all.slice(0, stage1);
  const reserve = all.slice(stage1); // 2分後に向かう人が少なければ追加で通知

  const { address, pref } = await reverseGeocode(lat, lng);
  const category = body.category as keyof typeof CATEGORIES;
  const callRef = db.collection('calls').doc();
  const code = String(Math.floor(1000 + Math.random() * 9000)); // 助太刀証の照合番号

  await callRef.set({
    ownerUid: uid,
    ownerName: user.name,
    members: [uid, ...first.map((r) => r.uid)],
    category,
    status: 'open',
    code,
    lat,
    lng,
    geohash: geohashForLocation([lat, lng]),
    address,
    pref: pref || '不明',
    createdAt: FieldValue.serverTimestamp(),
    lastLocationAt: FieldValue.serverTimestamp(),
    notified: first.length,
    expanded: reserve.length === 0,
  });
  if (reserve.length) await callRef.collection('private').doc('reserve').set({ list: reserve, category, address });
  await callRef.collection('messages').add({
    type: 'system',
    text: `ヘルプコール：${CATEGORIES[category]}／${address}付近`,
    createdAt: FieldValue.serverTimestamp(),
  });

  // 都道府県別統計
  const inc = FieldValue.increment(1);
  await Promise.all(
    [pref || '不明', '_全国'].map((key) =>
      db.collection('stats').doc(key).set({ total: inc, [category]: inc }, { merge: true }),
    ),
  );

  await pushEach(first.map((r) => ({ to: r.uid, text: notifyText(category, address, r, callRef.id) })));

  return { id: callRef.id, notified: first.length };
});
