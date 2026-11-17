# タスクキューアプリ (AWS Emulator × React / Express)

SQS をタスクキューとして使うサンプルです。タスクをキューに追加し、待機中の一覧を
見て、終わったものから「完了」（= メッセージ削除）していきます。

## 構成

- `frontend/` — Vite + React + TypeScript (port 5175)
- `backend/` — Express + TypeScript (port 4002)、AWS SDK for JavaScript v3
  (`@aws-sdk/client-sqs`)
- SQS キュー `tasks-queue` はバックエンド起動時に自動作成されます
  （エミュレータはインメモリなので、起動のたびに作り直されます）

## セットアップ

先に AWS Emulator を起動しておきます（リポジトリ直下の README 参照）。

```bash
# backend
cd backend
cp .env.example .env   # ~/.aws/emulator/9297/ のパスを自分の環境に合わせて編集
npm install
npm run dev            # http://localhost:4002

# frontend
cd frontend
cp .env.example .env   # 必要なら VITE_API_BASE を変更
npm install
npm run dev            # http://localhost:5175
```

## API

- `POST /api/tasks` — タスク追加 `{ title, note }`（本文は JSON で送信）
- `GET /api/tasks` — キューの概数（待ち／処理中／遅延）と待機中メッセージ
  最大10件の覗き見。覗き見は VisibilityTimeout=0 で受信するためメッセージは
  消費されませんが、その ReceiptHandle で完了（削除）はできます
- `POST /api/tasks/complete` — `{ receiptHandle }` で1件完了（メッセージ削除）
- `POST /api/tasks/purge` — キューを空にする

SQS の件数は概数（Approximate）で、一覧の覗き見も結果整合性のみのため、
実運用のワーカー実装とは受信の扱いが異なります。キューの基本動作
（送信・受信・削除・パージ）を一通り試すためのサンプルです。

## 本物のAWSに切り替える場合

`backend/.env` から `AWS_ENDPOINT_URL` とエミュレータ用ファイル設定を外し、
通常の認証情報チェーンで認証すれば、そのまま実AWSの SQS に対して動きます。

## 検証結果 (2026-11-17, AWS Emulator v1.0.483)

- バックエンド起動時にキュー `tasks-queue` が自動作成されることを確認
- タスクを2件追加 → 件数表示が待ち2件になり、一覧に両方表示されることを確認
- 1件を完了 → 待ち1件になることを確認
- 全件削除（パージ）→ 待ち0件になることを確認
- フロントエンドの `npm run build`（型チェック込み）が通ることを確認
