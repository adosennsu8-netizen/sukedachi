'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { fb } from '@/lib/firebaseClient';
import { APP_NAME, CATCHPHRASE, CATEGORIES, CategoryKey, BASE_KINDS, BaseKind, DEFAULT_RADIUS_KM } from '@/lib/config';
import { useAuth } from './AuthProvider';

type MyCall = { id: string; category: CategoryKey; address: string; createdAt?: { seconds: number } };

export default function Home() {
  const { uid, user } = useAuth();
  const [calls, setCalls] = useState<MyCall[]>([]);

  // 自分が出した進行中のヘルプ（押した回数だけチャットがある）
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(fb().db, 'calls'), where('ownerUid', '==', uid), where('status', '==', 'open'));
    return onSnapshot(q, (s) =>
      setCalls(
        s.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MyCall, 'id'>) }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)),
      ),
    );
  }, [uid]);

  return (
    <>
      <header className="brand">
        <h1>{APP_NAME}</h1>
        <p>{CATCHPHRASE}</p>
      </header>

      <Link href="/help" className="help-btn">
        <span>助けて<small>近くの仲間に知らせる</small></span>
      </Link>

      {calls.length > 0 && (
        <div className="card">
          <h2>進行中のヘルプ</h2>
          <div className="stack">
            {calls.map((c) => (
              <Link key={c.id} href={`/call/${c.id}`} className="btn red">
                {CATEGORIES[c.category]}｜{c.address}付近
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h2>通知を受け取る場所</h2>
        {(Object.keys(BASE_KINDS) as BaseKind[]).map((k) =>
          user?.bases?.[k] ? (
            <p key={k} style={{ margin: '0 0 4px' }}><strong>{BASE_KINDS[k]}</strong>：{user.bases[k]!.address}</p>
          ) : null,
        )}
        {!user?.bases?.home && !user?.bases?.work && (
          <Link href="/setup" className="btn">自宅・職場を登録すると、近くのヘルプが届きます</Link>
        )}
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {user?.notify === false
            ? '通知：オフ'
            : `自宅・職場・最後に開いた場所から${user?.radiusKm || DEFAULT_RADIUS_KM}km以内のヘルプをLINEで受け取る`}
        </p>
      </div>

      <nav className="nav">
        <Link href="/setup">設定</Link>
        <Link href="/stats">都道府県別ヘルプ数</Link>
      </nav>

      <a href="tel:110" className="btn ghost" style={{ marginTop: 28 }}>110番に電話する</a>
    </>
  );
}
