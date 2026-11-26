'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { fb } from '@/lib/firebaseClient';
import { APP_NAME, CATCHPHRASE, CATEGORIES, CategoryKey } from '@/lib/config';

type Row = { pref: string; total: number } & Partial<Record<CategoryKey, number>>;
const KEYS = Object.keys(CATEGORIES) as CategoryKey[];

export default function Stats() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [all, setAll] = useState<Row | null>(null);

  useEffect(() => {
    getDocs(collection(fb().db, 'stats')).then((s) => {
      const list = s.docs.map((d) => ({ pref: d.id, ...(d.data() as any) })) as Row[];
      setAll(list.find((r) => r.pref === '_全国') || null);
      setRows(list.filter((r) => r.pref !== '_全国').sort((a, b) => b.total - a.total));
    });
  }, []);

  return (
    <div className="stack">
      <header className="brand">
        <h1>{APP_NAME}</h1>
        <p>{CATCHPHRASE}</p>
      </header>
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>全国のヘルプコール累計</h2>
        <div className="count" style={{ fontSize: 40 }}>{all?.total ?? 0}</div>
      </div>
      <div className="card">
        <h2>都道府県別</h2>
        {!rows ? (
          <p className="muted">読み込み中…</p>
        ) : rows.length === 0 ? (
          <p className="muted">まだデータがありません</p>
        ) : (
          <table className="stats">
            <thead>
              <tr><th>都道府県</th><th>計</th>{KEYS.map((k) => <th key={k}>{CATEGORIES[k].split('・')[0]}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.pref}>
                  <td>{r.pref}</td><td><strong>{r.total}</strong></td>
                  {KEYS.map((k) => <td key={k}>{r[k] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Link href="/" className="muted" style={{ textAlign: 'center', display: 'block' }}>ホームへ</Link>
    </div>
  );
}
