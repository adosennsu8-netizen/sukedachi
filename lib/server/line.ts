import { HttpError } from './admin';

export function liffUrl(path: string) {
  return `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID}${path}`;
}

/** LIFFのIDトークンをLINEに検証してもらう */
export async function verifyLineIdToken(idToken: string): Promise<{ sub: string; name?: string }> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: process.env.LINE_LOGIN_CHANNEL_ID || '' }),
  });
  if (!res.ok) throw new HttpError(401, 'LINE認証に失敗しました');
  return res.json();
}

/** 最大500人ずつ一斉送信。失敗してもヘルプ自体は止めない */
export async function multicast(to: string[], text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || to.length === 0) return;
  for (let i = 0; i < to.length; i += 500) {
    const chunk = to.slice(i, i + 500);
    try {
      const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: chunk, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
      });
      if (!res.ok) console.error('LINE multicast failed', res.status, await res.text());
    } catch (e) {
      console.error('LINE multicast error', e);
    }
  }
}

/** 1人ずつ文面を変えて送る（距離を本人向けに表示するため）。10件ずつ並列 */
export async function pushEach(items: { to: string; text: string }[]) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  for (let i = 0; i < items.length; i += 10) {
    await Promise.all(
      items.slice(i, i + 10).map(async ({ to, text }) => {
        try {
          const res = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
          });
          if (!res.ok) console.error('LINE push failed', res.status, await res.text());
        } catch (e) {
          console.error('LINE push error', e);
        }
      }),
    );
  }
}
