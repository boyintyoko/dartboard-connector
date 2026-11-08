# Dartboard Connector

[![CI](https://github.com/minimalcorp/dartboard-connector/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/minimalcorp/dartboard-connector/actions/workflows/ci.yaml)

## Packages

- [Dartboard Connector](./packages/dartboard-connector/README.md)

## Examples

example implementation is under `./example` directory.

## Darts Room（ローカルゲーム）

```sh
npm install
npm run build
npm run start-example
```

http://localhost:3000 をChrome / Edgeで開き、ボードの電源を入れて「Bluetooth接続」を押します。接続後は自動で通知を購読します。公式アプリに接続している場合は、先にそちらの接続を解除してください。Web Bluetooth対応環境とlocalhostまたはHTTPSが必要です。

### ランダムオンライン対戦

`yarn start-match-server` で対戦サーバー（port 4001）を起動します。同じネットワークなら、両端末でホストPCのLANアドレスからexampleを開いてランダム対戦を探せます。インターネット越しに対戦するには `online-server.js` を公開ホストへ配置し、example側の `NEXT_PUBLIC_MATCH_SERVER_URL` にSocket.IO URLを設定してください（HTTPSサイトではTLS proxy経由の `https://` URL）。サーバーが2人をマッチし、01・CRICKET・MATCHからゲームをランダム選択します。相手が見つかるにはもう1人の実ユーザーが同時に待機している必要があります。

Render用の `render.yaml` は、WebアプリとSocket.IOサーバーを1つのサービスとして公開します。GitHubへこのソースをpushし、Renderで **New → Blueprint** からリポジトリを選ぶと作成できます。公開後の `/health` は `hello` を返します。UptimeRobotのHTTP(s)監視先を `https://<RenderのURL>/health` にすれば定期応答を確認できます。無料インスタンスは再起動や利用上限の影響を受けるため、常時稼働の保証ではありません。

- 01：301 / 501 / 701 / 901 / 1101 / 1501。15ラウンド制で、MASTER OUT / DOUBLE OUT を選択できます。
- CRICKET：15〜20・BULLを使うローカル対戦。2〜4人でプレイできます。
- PRACTICE：狙うナンバーを選び、命中回数と命中率を記録する練習モード。
- MATCH：2人用のメドレー対戦。BEST OF 3は01 → CRICKET → 必要時CHOICE、BEST OF 5は01 → CRICKET → CRICKET → 01 → 必要時CHOICE。先取勝利数に達すると残りのレグを行わず終了します。
- MATCH開始時とCHOICEレグ前にCORKを行い、同じエリアの場合は画面で中心に近いダーツを選びます。CHOICEのCORK勝者は「先攻」か「ゲーム選択権」を選べます。通常レグの2レグ目以降はLOSERまたはALTERNATEを選択できます。
- ROBO MATCH：CPUと01形式で対戦し、CPUレベルを選べます。
- 01とPRACTICEは1人でもプレイできます。各ターン3投で、途中交代時の未投分は記録しません。
- ボードなしで試す場合はゲーム中に「ボードを画面入力」を有効にし、画面上のボードをタップします。
- 公式サービスのログイン・オンライン対戦・成績同期には対応していません。進行中のゲームはリロードすると消去されます。実機Bluetooth通信は別途確認してください。

検証コマンド：`npx tsc --noEmit -p example/tsconfig.json`、`npx next build example`。
Bluetooth通知の模擬テスト：`npm run test:bluetooth`。GATT通知からコネクター、ゲーム反映までを検証します（実機の無線通信は対象外）。ゲーム画面では直近の命中結果を確認できます。
