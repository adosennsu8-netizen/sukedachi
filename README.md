# 助太刀（MVP）

公共の場で見知らぬ相手から迷惑行為を受けた人が「助けて」を押すと、近くにいるユーザーへLINEで通知が届き、現場に駆けつけるWebアプリ。

## 通知相手の決め方
- Webアプリ＋LINEでは他人のリアルタイム位置は取れないため、1人につき最大3地点で判定する：**自宅**・**職場**（任意登録）、**最後にアプリを開いた場所**（`LAST_SEEN_HOURS`時間だけ有効）
- 距離は受け取る人が自分で選ぶ（1 / 3 / 10 / 30km、初期値3km）。どれか1地点でも選んだ距離以内なら通知する
- 近い順に最大`MAX_NOTIFY`人まで。通知文には「あなたの自宅から約1.2km」のように本人からの距離を入れ、行けるかどうかを本人が判断できるようにする

- 技術構成：Next.js 14（App Router） / Firebase（Auth・Firestore） / LINE（LIFF・Messaging API） / Vercel
- 住所の取得：国土地理院の逆ジオコーダー（無料・APIキー不要）。地図は埋め込まず、外部の地図アプリへのリンクだけを置く

## 画面と処理の流れ

| 画面 | 内容 |
|---|---|
| `/` | 大きな「助けて」ボタン、進行中のヘルプ一覧、登録した拠点の住所、一番下に110番。拠点が未登録でもすぐヘルプを出せる |
| `/setup` | ニックネーム、通知のON/OFF、駆けつける距離、自宅・職場の登録（GPSで位置を取り、住所は番地まで本人が入力。判定用の座標は約100m単位に丸める）、LINE友だち追加 |
| `/help` | ①公共の場所か・相手は知らない人かを確認 → ②種別を選ぶ → ③送信。家族・恋人・知人とのトラブルは対象外にして110番／#9110へ案内 |
| `/call/[id]` | 種別、住所、駆けつけ人数、チャット。ヘルプを出した本人にはチャット欄の「現在地を送信」と「解決」、通知を受けた人には「助けに行く」と駆けつける人のルールを表示。メンバー以外が開くと入れない |
| `/stats` | 都道府県別・種別ごとのヘルプ件数（公開ページ、ログイン不要） |

チャットの仕組み：ヘルプボタンを1回押すごとに新しいチャットが1つ作られ、ヘルプを出した本人と通知を受けた人だけが入れる（Firestoreルールで制限）。通知を受ける人はアプリを開いておく必要はなく、LINEのリンクから直接チャットに入る。

いたずら対策：
- 発信は「2秒長押し」。24時間に3回まで（`DAILY_CALL_LIMIT`）
- 段階送信：まず近い10人に通知し、2分たっても向かう人が2人未満なら`MAX_NOTIFY`（初期30人）まで広げる。※広げる処理は開いているチャット画面から2分後に呼ばれる。誰も開いていない場合に確実に動かすには、Vercel Pro の毎分Cronで `/api/calls/[id]/expand` 相当を回す
- ヘルプ者の操作（チャット・現在地送信）が30分ないと自動終了
- 通知を受けた人は「いたずら報告」ができ、報告されたヘルプが2件たまった発信者は発信停止
- 発信2回目までの新規ユーザーは通知人数を半分にする
- 発信画面に「虚偽のヘルプはアカウント停止」と表示

到着と助太刀証：
- 駆けつけ状態は「向かっている／到着」の2段階で、人数を分けて表示
- 到着ボタンを押すと全画面の「助太刀証」になり、相手にちらっと見せて本物だと示す。ヘルプごとの4桁の照合番号がヘルプ者の画面と一致すれば本物。秒単位で動く時計と流れる帯で、スクショではないことが分かる

記録の保存：時刻・場所・座標・チャット全文を1つのテキストとしてコピーできる（警察への相談・被害届用）

## セットアップ

### 1. Firebase
1. プロジェクトを作成し、Firestore（本番モード）を有効にする
2. Authenticationを有効にする（ログインはカスタムトークンで行うので、プロバイダの設定は不要）
3. 「プロジェクトの設定」→「サービスアカウント」→ 新しい秘密鍵を生成し、`FIREBASE_*` に設定する
4. ウェブアプリを登録し、`NEXT_PUBLIC_FIREBASE_*` に設定する
5. `firestore.rules` の内容をコンソールのルール画面に貼り付けて公開する

### 2. LINE（LINE Developers）
**同じプロバイダー**の中に次の2つのチャネルを作る（プロバイダーが違うと userId が一致せず、通知が届かない）。

1. **Messaging APIチャネル**：長期のチャネルアクセストークンを発行して `LINE_CHANNEL_ACCESS_TOKEN` に設定。友だち追加URLを `NEXT_PUBLIC_LINE_ADD_FRIEND_URL` に設定
2. **LINEログインチャネル**：チャネルIDを `LINE_LOGIN_CHANNEL_ID` に設定
   - 友だち追加オプションを「On (Aggressive)」にして、上のMessaging APIチャネルと紐付ける（ログイン時に友だち追加を促せる）
   - LIFFアプリを追加：サイズ Full、エンドポイントURL `https://あなたのドメイン/`、Scope は `openid` と `profile`。発行されたIDを `NEXT_PUBLIC_LIFF_ID` に設定

### 2.5 リッチメニュー（必須）
公式アカウントのトーク画面下に「助けて」ボタンを常設し、リンク先をLIFF URL（`https://liff.line.me/LIFF_ID`）にする。LINEアプリの中から開けばログイン操作は不要（LINEのログイン状態をそのまま使う）。久しぶりに開いても、パスワード入力で止まることがない。ホーム画面アイコンやSafariから開く入口は作らない。

### 3. Vercel
1. GitHubにpushしてインポートする
2. `.env.example` の全項目を Environment Variables に登録する（`FIREBASE_PRIVATE_KEY` は `\n` を含んだまま1行で貼る）
3. デプロイ後、LIFFのエンドポイントURLを本番ドメインに合わせる

### ローカル開発
```
npm install
cp .env.example .env.local   # 値を入れる
npm run dev
```
LIFFはHTTPSが必要なので、動作確認はVercelのプレビュー環境で行うのが確実。

## コストの注意
LINEのpush／multicastは通数で課金される（無料枠は小さい）。通知数 ＝ 1回のヘルプで送る人数 ＋ 現在地更新や解決時に駆けつけ者へ送る数。`MAX_NOTIFY` で上限を管理する。一律に広い範囲へ送ると、コストに加えて通知疲れによるブロックが増えるため、距離は受け取る側が選ぶ設計にしている。

## Firestoreのデータ構造
- `users/{lineUserId}`：name, notify, radiusKm, totalCalls, reportedCalls, suspended, bases.home/work.address, recentCalls[]
- `points/{uid}_{home|work|last}`：uid, kind, lat, lng, geohash, radiusM, notify, updatedAt（通知判定用・サーバーのみ）
- `calls/{id}`：ownerUid, ownerName, members[]（本人＋通知した人）, code（照合番号）, expanded, reportCount, lastLocationAt, category, status, lat, lng, geohash, address, pref, notified, createdAt
  - `messages/{id}`：type(text|system|location), uid, name, text, lat, lng, createdAt
  - `responders/{uid}`：name, status(going|arrived), at, arrivedAt
  - `private/reserve`：段階送信の控えリスト（サーバーのみ）
  - `reports/{uid}`：いたずら報告（サーバーのみ）
- `stats/{都道府県}`（全国は `_全国`）：total と種別ごとの件数

## 次にやるとよいこと
- 段階送信を確実にするための毎分Cron（Vercel Pro）
- 発信停止ユーザーの確認・解除をする管理画面
- 利用規約・プライバシーポリシー（位置情報の扱い、駆けつけ時の免責）
