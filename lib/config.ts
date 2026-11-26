export const APP_NAME = '助太刀';
export const CATCHPHRASE = '1億総自警団';

export const CATEGORIES = {
  violence: '暴力・威嚇',
  verbal: '暴言・絡まれ',
  stalking: 'つきまとい',
  nuisance: '悪質な迷惑行為',
} as const;

export type CategoryKey = keyof typeof CATEGORIES;

export function isCategory(v: unknown): v is CategoryKey {
  return typeof v === 'string' && v in CATEGORIES;
}

export const RESPONDER_RULES = [
  'ヘルプを出した人の意見を最優先にする',
  '手は出さない。そばに立ち、人数で抑止する',
  '危険を感じたら距離を取り、110番する',
  '相手を挑発しない・晒さない',
];

/** 通知を受け取る距離（受け取る人が自分で選ぶ） */
export const RADIUS_OPTIONS_KM = [1, 3, 10, 30] as const;
export const DEFAULT_RADIUS_KM = 3;

export const BASE_KINDS = { home: '自宅', work: '職場' } as const;
export type BaseKind = keyof typeof BASE_KINDS;

/** いたずら対策・段階送信 */
export const STAGE1_NOTIFY = 10; // 最初に通知する人数
export const EXPAND_AFTER_SEC = 120; // この秒数たっても向かう人が少なければ範囲を広げる
export const EXPAND_IF_RESPONDERS_BELOW = 2;
export const AUTO_CLOSE_MIN = 30; // ヘルプ者の操作がこの分数ないと自動終了
export const SUSPEND_AFTER_REPORTS = 2; // いたずら報告されたヘルプ数がこれに達したら発信停止
