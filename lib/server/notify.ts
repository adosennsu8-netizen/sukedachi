import { CATEGORIES } from '@/lib/config';
import { liffUrl } from './line';
import { formatDistance, Recipient } from './points';

export function notifyText(category: keyof typeof CATEGORIES, address: string, r: Recipient, callId: string) {
  return `【助太刀】近くでヘルプコール\n種別：${CATEGORIES[category]}\n場所：${address}付近\nあなたの${r.label}から${formatDistance(r.distanceM)}\n\n▼チャットを開く\n${liffUrl(`/call/${callId}`)}`;
}
