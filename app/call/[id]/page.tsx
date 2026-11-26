'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { addDoc, collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, Timestamp } from 'firebase/firestore';
import { api, fb, getPosition, mapLink } from '@/lib/firebaseClient';
import { APP_NAME, CATEGORIES, CategoryKey, EXPAND_AFTER_SEC, RESPONDER_RULES } from '@/lib/config';
import { useAuth } from '../../AuthProvider';

type Call = {
  ownerUid: string;
  ownerName: string;
  members: string[];
  category: CategoryKey;
  status: 'open' | 'resolved';
  code: string;
  address: string;
  lat: number;
  lng: number;
  notified: number;
  expanded?: boolean;
  createdAt?: Timestamp;
};
type Msg = { id: string; type: 'text' | 'system' | 'location'; uid?: string; name?: string; text: string; lat?: number; lng?: number; createdAt?: Timestamp };
type Responder = { name: string; status: 'going' | 'arrived' };

const hhmm = (t?: Timestamp) => (t ? t.toDate().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '--:--');

/** 到着した人が相手に見せる「助太刀証」。動く時計と流れる帯でスクショとの区別がつく */
function Badge({ name, code, onClose }: { name: string; code: string; onClose: () => void }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="badge-screen" onClick={onClose} role="dialog" aria-label="助太刀証">
      <div className="badge-card">
        <div className="badge-band" />
        <p className="badge-kind">{APP_NAME}証</p>
        <p className="badge-name">{name}</p>
        <p className="badge-label">照合番号</p>
        <p className="badge-code">{code}</p>
        <p className="badge-clock">{now.toLocaleTimeString('ja-JP')}</p>
        <p className="badge-note">ヘルプを出した方の画面の番号と同じなら本物です</p>
      </div>
      <p className="badge-close">タップで閉じる</p>
    </div>
  );
}

export default function CallPage({ params }: { params: { id: string } }) {
  const { uid, user } = useAuth();
  const [call, setCall] = useState<Call | null | undefined>(undefined);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [responders, setResponders] = useState<Record<string, Responder>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'resolve' | 'report' | null>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [record, setRecord] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { db } = fb();
    const ref = doc(db, 'calls', params.id);
    const denied = () => setCall(null); // 通知を受けていない人は権限エラーになる
    const u1 = onSnapshot(ref, (s) => setCall(s.exists() ? (s.data() as Call) : null), denied);
    const u2 = onSnapshot(query(collection(ref, 'messages'), orderBy('createdAt', 'asc'), limit(300)), (s) =>
      setMessages(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Msg, 'id'>) }))), denied,
    );
    const u3 = onSnapshot(collection(ref, 'responders'), (s) =>
      setResponders(Object.fromEntries(s.docs.map((d) => [d.id, d.data() as Responder]))), denied,
    );
    return () => { u1(); u2(); u3(); };
  }, [params.id]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight });
  }, [messages.length]);

  // 段階送信：発信から2分後に、向かう人が少なければ通知範囲を広げるようサーバーに依頼
  useEffect(() => {
    if (!call || call.status !== 'open' || call.expanded || !call.createdAt) return;
    const wait = call.createdAt.toMillis() + EXPAND_AFTER_SEC * 1000 - Date.now();
    const t = setTimeout(() => api(`/api/calls/${params.id}/expand`).catch(() => {}), Math.max(0, wait) + 1000);
    return () => clearTimeout(t);
  }, [call?.status, call?.expanded, call?.createdAt, params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (call === undefined) return <div className="center"><p className="muted">読み込み中…</p></div>;
  if (call === null) return <div className="center"><p className="err">このチャットには、通知を受けた人だけが入れます</p></div>;

  const isOwner = call.ownerUid === uid;
  const mine = uid ? responders[uid] : undefined;
  const open = call.status === 'open';
  const list = Object.values(responders);
  const goingN = list.filter((r) => r.status === 'going').length;
  const arrivedN = list.filter((r) => r.status === 'arrived').length;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  const respond = (action: 'go' | 'cancel' | 'arrive') =>
    run(async () => {
      await api(`/api/calls/${params.id}/respond`, { action });
      if (action === 'arrive') setShowBadge(true);
    });
  const sendLocation = () => run(async () => api(`/api/calls/${params.id}/location`, await getPosition()));
  const resolve = () => run(async () => { await api(`/api/calls/${params.id}/resolve`); setConfirm(null); });
  const report = () => run(async () => { await api(`/api/calls/${params.id}/report`); setConfirm(null); setInfo('いたずら報告を受け付けました'); });
  const sendText = () =>
    run(async () => {
      const t = text.trim();
      if (!t) return;
      await addDoc(collection(fb().db, 'calls', params.id, 'messages'), {
        type: 'text', uid, name: user?.name || '名無し', text: t.slice(0, 500), createdAt: serverTimestamp(),
      });
      setText('');
    });

  // 記録の保存：時刻・場所・チャットを1つのテキストに
  async function copyRecord() {
    const c = call!;
    const date = c.createdAt?.toDate().toLocaleString('ja-JP') ?? '';
    const lines = [
      `【${APP_NAME} ヘルプ記録】`,
      `発信日時：${date}`,
      `種別：${CATEGORIES[c.category]}`,
      `場所：${c.address}付近（${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}）`,
      `状態：${open ? '対応中' : '終了'}`,
      `通知した人数：${c.notified}人／向かった人：${goingN + arrivedN}人／到着：${arrivedN}人`,
      '―――――',
      ...messages.map((m) =>
        m.type === 'text' ? `${hhmm(m.createdAt)} ${m.name}${m.uid === c.ownerUid ? '（ヘルプ者）' : ''}：${m.text}`
        : m.type === 'location' ? `${hhmm(m.createdAt)} 📍${m.text}（${m.lat?.toFixed(5)}, ${m.lng?.toFixed(5)}）`
        : `${hhmm(m.createdAt)} ― ${m.text}`,
      ),
    ];
    const txt = lines.join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      setInfo('記録をコピーしました。メモや警察への相談に貼り付けて使えます');
      setRecord(null);
    } catch {
      setRecord(txt); // コピーできない端末では全文を表示して手動で選択
    }
  }

  return (
    <div className="stack">
      {showBadge && mine?.status === 'arrived' && (
        <Badge name={user?.name || '名無し'} code={call.code} onClose={() => setShowBadge(false)} />
      )}

      <div className="card">
        <div className="status">
          <strong>{CATEGORIES[call.category]}</strong>
          <span className={`badge ${open ? '' : 'done'}`}>{open ? '救援要請中' : '終了'}</span>
        </div>
        <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{call.address}付近</p>
        <a href={mapLink(call.lat, call.lng)} target="_blank" rel="noreferrer" className="muted">地図アプリで開く ↗</a>
        <div className="tally">
          <div><span className="count">{goingN}</span><small>向かっている</small></div>
          <div><span className="count arrived">{arrivedN}</span><small>到着</small></div>
        </div>
        {isOwner && (
          <>
            <div className="codebox">照合番号 <strong>{call.code}</strong></div>
            <p className="muted" style={{ margin: 0 }}>到着した人が見せる助太刀証の番号と同じか確認してください。通知した人数：{call.notified}人</p>
          </>
        )}
      </div>

      {open && isOwner &&
        (confirm === 'resolve' ? (
          <div className="row">
            <button className="btn green" disabled={busy} onClick={resolve}>解決した</button>
            <button className="btn ghost" onClick={() => setConfirm(null)}>まだ</button>
          </div>
        ) : (
          <button className="btn green" onClick={() => setConfirm('resolve')}>✓ 問題が解決したら押す（解決ボタン）</button>
        ))}

      {open && !isOwner && (
        <>
          {!mine && (
            <div className="card">
              <h2>駆けつける人のルール</h2>
              <ol className="rules">{RESPONDER_RULES.map((r) => <li key={r}>{r}</li>)}</ol>
            </div>
          )}
          {!mine && <button className="btn red" disabled={busy} onClick={() => respond('go')}>助けに行く</button>}
          {mine?.status === 'going' && (
            <>
              <button className="btn red" style={{ padding: 18, fontSize: 18 }} disabled={busy} onClick={() => respond('arrive')}>到着した</button>
              <button className="link" disabled={busy} onClick={() => respond('cancel')}>向かうのを取りやめる</button>
            </>
          )}
          {mine?.status === 'arrived' && (
            <button className="btn red" style={{ padding: 18, fontSize: 18 }} onClick={() => setShowBadge(true)}>助太刀証を表示</button>
          )}
        </>
      )}

      <div className="card">
        <h2>チャット</h2>
        <div className="chat" ref={chatRef}>
          {messages.map((m) =>
            m.type === 'system' ? (
              <div key={m.id} className="msg sys">{m.text}</div>
            ) : m.type === 'location' ? (
              <a key={m.id} className="msg loc" href={mapLink(m.lat!, m.lng!)} target="_blank" rel="noreferrer">📍 {m.text}</a>
            ) : (
              <div key={m.id} className={`msg ${m.uid === uid ? 'me' : ''}`}>
                <span className="who">{m.uid === call.ownerUid ? `${m.name}（ヘルプ者）` : m.name}</span>
                {m.text}
              </div>
            ),
          )}
        </div>
        {open && (
          <div className="composer">
            <input type="text" value={text} maxLength={500} placeholder={isOwner ? '状況や相手の特徴など' : 'メッセージ'}
              onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && sendText()} />
            <button className="btn" disabled={busy || !text.trim()} onClick={sendText}>送信</button>
          </div>
        )}
        {open && isOwner && (
          <button className="btn red" style={{ marginTop: 10 }} disabled={busy} onClick={sendLocation}>
            📍 現在地を送信（移動したとき）
          </button>
        )}
      </div>

      <button className="btn" onClick={copyRecord}>記録をコピー（時刻・場所・チャット）</button>
      {record && <textarea readOnly value={record} rows={8} onFocus={(e) => e.currentTarget.select()} />}

      {!isOwner &&
        (confirm === 'report' ? (
          <div className="row">
            <button className="btn" disabled={busy} onClick={report}>いたずらとして報告する</button>
            <button className="btn ghost" onClick={() => setConfirm(null)}>やめる</button>
          </div>
        ) : (
          <button className="link" onClick={() => setConfirm('report')}>いたずらだと思ったら報告</button>
        ))}

      {info && <p className="ok">{info}</p>}
      {error && <p className="err">{error}</p>}
      <a href="tel:110" className="btn ghost" style={{ marginTop: 24 }}>110番に電話する</a>
      <Link href="/" className="muted" style={{ textAlign: 'center', display: 'block' }}>ホームへ</Link>
    </div>
  );
}
