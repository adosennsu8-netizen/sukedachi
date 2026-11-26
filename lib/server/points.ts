import { geohashForLocation, geohashQueryBounds, distanceBetween } from 'geofire-common';
import { admin, FieldValue } from './admin';
import { BASE_KINDS, RADIUS_OPTIONS_KM } from '@/lib/config';

/**
 * 通知判定用の地点。1ユーザーにつき最大3つ
 *  points/{uid}_home : 自宅
 *  points/{uid}_work : 職場
 *  points/{uid}_last : 最後にアプリを開いた場所（LAST_SEEN_HOURS 時間だけ有効）
 * 各地点に受け取る人の通知距離(radiusM)と通知ON/OFFを複製して持たせ、1回のクエリで判定する
 */
export type PointKind = 'home' | 'work' | 'last';
const LABEL: Record<PointKind, string> = { ...BASE_KINDS, last: '最後にいた場所' };
const MAX_RADIUS_M = Math.max(...RADIUS_OPTIONS_KM) * 1000;
const LAST_SEEN_MS = Number(process.env.LAST_SEEN_HOURS || 6) * 3600 * 1000;

export async function setPoint(uid: string, kind: PointKind, lat: number, lng: number) {
  const { db } = admin();
  const user = (await db.collection('users').doc(uid).get()).data() || {};
  await db.collection('points').doc(`${uid}_${kind}`).set({
    uid,
    kind,
    lat,
    lng,
    geohash: geohashForLocation([lat, lng]),
    radiusM: (user.radiusKm || 3) * 1000,
    notify: user.notify !== false,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function deletePoint(uid: string, kind: PointKind) {
  await admin().db.collection('points').doc(`${uid}_${kind}`).delete();
}

/** 通知距離・ON/OFFを変えたら全地点に反映 */
export async function syncPointSettings(uid: string, radiusM: number, notify: boolean) {
  const { db } = admin();
  const snap = await db.collection('points').where('uid', '==', uid).get();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.update(d.ref, { radiusM, notify }));
  await batch.commit();
}

export type Recipient = { uid: string; distanceM: number; label: string };

/** ヘルプ地点から、各ユーザーが選んだ距離以内にいる人を近い順に返す */
export async function findRecipients(lat: number, lng: number, excludeUid: string, max: number): Promise<Recipient[]> {
  const { db } = admin();
  const bounds = geohashQueryBounds([lat, lng], MAX_RADIUS_M);
  const snaps = await Promise.all(
    bounds.map(([s, e]) => db.collection('points').orderBy('geohash').startAt(s).endAt(e).get()),
  );
  const now = Date.now();
  const best = new Map<string, Recipient>();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      const p = doc.data();
      if (p.uid === excludeUid || p.notify === false) continue;
      if (p.kind === 'last' && now - (p.updatedAt?.toMillis?.() ?? 0) > LAST_SEEN_MS) continue;
      const d = distanceBetween([p.lat, p.lng], [lat, lng]) * 1000;
      if (d > p.radiusM) continue;
      const prev = best.get(p.uid);
      if (!prev || d < prev.distanceM) best.set(p.uid, { uid: p.uid, distanceM: d, label: LABEL[p.kind as PointKind] });
    }
  }
  return [...best.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, max);
}

export function formatDistance(m: number) {
  return m < 1000 ? `約${Math.max(100, Math.round(m / 100) * 100)}m` : `約${(m / 1000).toFixed(1)}km`;
}
