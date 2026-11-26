'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getPosition } from '@/lib/firebaseClient';
import { BASE_KINDS, BaseKind, RADIUS_OPTIONS_KM, DEFAULT_RADIUS_KM } from '@/lib/config';
import { useAuth } from '../AuthProvider';

function BaseCard({ kind }: { kind: BaseKind }) {
  const { user } = useAuth();
  const saved = user?.bases?.[kind];
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setAddress(saved?.address || ''), [saved?.address]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: done });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <h2>拠点：{BASE_KINDS[kind]}</h2>
      <button className="btn red" disabled={busy}
        onClick={() => run(async () => api('/api/profile', { base: kind, ...(await getPosition()) }), '位置を登録しました。番地まで入力して保存してください')}>
        ① 今いる場所を{BASE_KINDS[kind]}として登録
      </button>
      {saved && (
        <>
          <input type="text" value={address} maxLength={100} placeholder="例：福岡県福岡市中央区天神1-2-3"
            onChange={(e) => setAddress(e.target.value)} />
          <div className="row">
            <button className="btn" disabled={busy || !address.trim()}
              onClick={() => run(() => api('/api/profile', { base: kind, address }), '住所を保存しました')}>② 番地まで入力して保存</button>
            <button className="btn ghost" style={{ flex: '0 0 30%' }} disabled={busy}
              onClick={() => run(() => api('/api/profile', { base: kind, remove: true }), '削除しました')}>削除</button>
          </div>
        </>
      )}
      {msg && <p className={msg.ok ? 'ok' : 'err'} style={{ margin: 0 }}>{msg.text}</p>}
    </div>
  );
}

export default function Setup() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const [radiusKm, setRadiusKm] = useState<number>(DEFAULT_RADIUS_KM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const friendUrl = process.env.NEXT_PUBLIC_LINE_ADD_FRIEND_URL;

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setNotify(user.notify !== false);
      setRadiusKm(user.radiusKm || DEFAULT_RADIUS_KM);
    }
  }, [user]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/profile', { name, notify, radiusKm });
      setMsg({ ok: true, text: '保存しました' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: 22 }}>設定</h1>

      <div className="card stack">
        <h2>ニックネーム</h2>
        <input type="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          近くのヘルプをLINEで受け取る
        </label>
        <h2 style={{ marginTop: 6 }}>どこまでなら駆けつける？</h2>
        <div className="choices" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          {RADIUS_OPTIONS_KM.map((r) => (
            <button key={r} className={`choice ${radiusKm === r ? 'on' : ''}`} onClick={() => setRadiusKm(r)}>{r}km</button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>自宅・職場・最後にアプリを開いた場所のどれかから、この距離以内でヘルプが出ると通知が届きます。</p>
        <button className="btn" disabled={busy} onClick={save}>保存</button>
        {msg && <p className={msg.ok ? 'ok' : 'err'} style={{ margin: 0 }}>{msg.text}</p>}
      </div>

      <BaseCard kind="home" />
      <BaseCard kind="work" />
      <p className="muted" style={{ margin: 0 }}>拠点の住所は本人にしか表示されません。通知の判定には約100m単位に丸めた位置を使います。</p>

      {friendUrl && (
        <div className="card stack">
          <h2>LINE公式アカウント</h2>
          <p className="muted" style={{ margin: 0 }}>通知を受け取るには友だち追加が必要です。</p>
          <a className="btn green" href={friendUrl}>友だち追加する</a>
        </div>
      )}

      <Link href="/" className="btn ghost">ホームへ</Link>
    </div>
  );
}
