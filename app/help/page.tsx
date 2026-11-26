'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getPosition } from '@/lib/firebaseClient';
import { CATEGORIES, CategoryKey } from '@/lib/config';

const HOLD_MS = 2000;

/** 2秒長押しで発信（誤タップ・ふざけ半分の連打を防ぐ） */
function HoldButton({ busy, onHold }: { busy: boolean; onHold: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = (e: React.PointerEvent) => {
    if (busy) return;
    e.preventDefault();
    setHolding(true);
    timer.current = setTimeout(() => { setHolding(false); onHold(); }, HOLD_MS);
  };
  const stop = () => { clearTimeout(timer.current); setHolding(false); };
  return (
    <button className={`btn red hold ${holding ? 'on' : ''}`} style={{ padding: 20, fontSize: 18 }} disabled={busy}
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}>
      <span className="hold-fill" />
      <span style={{ position: 'relative' }}>{busy ? '送信中…' : holding ? 'そのまま押し続けて…' : '2秒長押しで助けを求める'}</span>
    </button>
  );
}

export default function Help() {
  const router = useRouter();
  const [isPublic, setIsPublic] = useState(false);
  const [stranger, setStranger] = useState(false);
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligible = isPublic && stranger;

  async function send() {
    if (!category) return;
    setBusy(true);
    setError(null);
    try {
      const pos = await getPosition();
      const res = await api<{ id: string }>('/api/calls', { category, public: true, stranger: true, ...pos });
      router.replace(`/call/${res.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1 style={{ fontSize: 22 }}>ヘルプを出す</h1>

      <div className="card">
        <h2>1. 状況の確認</h2>
        <label className="check">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          路上・駅・店など公共の場所にいる
        </label>
        <label className="check">
          <input type="checkbox" checked={stranger} onChange={(e) => setStranger(e.target.checked)} />
          相手は知らない人
        </label>
        {!eligible && (isPublic || stranger) && (
          <p className="muted" style={{ margin: 0 }}>
            家族・恋人・知人とのトラブルは対象外です。身の危険があれば110番、相談は#9110へ。
          </p>
        )}
      </div>

      {eligible && (
        <div className="card">
          <h2>2. 何が起きている？</h2>
          <div className="choices">
            {(Object.keys(CATEGORIES) as CategoryKey[]).map((k) => (
              <button key={k} className={`choice ${category === k ? 'on' : ''}`} onClick={() => setCategory(k)}>
                {CATEGORIES[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {eligible && category && (
        <>
          <HoldButton busy={busy} onHold={send} />
          <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
            虚偽・いたずらのヘルプはアカウント停止の対象です
          </p>
        </>
      )}

      {error && <p className="err">{error}</p>}
      <a href="tel:110" className="btn ghost" style={{ marginTop: 24 }}>危険が迫っているなら110番</a>
      <Link href="/" className="muted" style={{ textAlign: 'center', display: 'block' }}>戻る</Link>
    </div>
  );
}
