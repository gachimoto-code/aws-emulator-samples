# ファイル管理アプリ (AWS Emulator × React / Express)

S3 だけを使うファイル管理アプリです。バケット内のファイルを一覧・アップロード・
ダウンロード・削除できます。バックエンドが S3 を操作し、ブラウザはバックエンド
経由でアクセスします（エミュレータの自己署名証明書にブラウザが触れない構成）。

## 構成

- `frontend/` — Vite + React + TypeScript (port 5174)
- `backend/` — Express + TypeScript (port 4001)、AWS SDK for JavaScript v3
  (`@aws-sdk/client-s3`)
- S3 バケット `files-app-storage` はバックエンド起動時に自動作成されます
  （エミュレータはインメモリなので、起動のたびに空の状態から作り直されます）

## セットアップ

先に AWS Emulator を起動しておきます（リポジトリ直下の README 参照）。

```bash
# backend
cd backend
cp .env.example .env   # ~/.aws/emulator/9297/ のパスを自分の環境に合わせて編集
npm install
npm run dev            # http://localhost:4001

# frontend
cd frontend
cp .env.example .env   # 必要なら VITE_API_BASE を変更
npm install
npm run dev            # http://localhost:5174
```

## API

- `GET /api/files` — 一覧（キー・サイズ・更新日時、件数と合計バイト数つき）
- `POST /api/files` — アップロード（multipart: `file`、任意で `prefix` =
  フォルダ風プレフィックス）。同名キーがあれば上書きせず 409 を返します
- `GET /api/files/download?key=...` — ダウンロード
- `DELETE /api/files?key=...` — 削除

## 本物のAWSに切り替える場合

`backend/.env` から `AWS_ENDPOINT_URL` とエミュレータ用ファイル設定を外し、
通常の認証情報チェーンで認証すれば、そのまま実AWSの S3 に対して動きます
（パススタイル指定も自動で無効になります）。

## 検証結果 (2026-11-17, AWS Emulator v1.0.483)

- バックエンド起動時にバケット `files-app-storage` が自動作成されることを確認
- アップロード（プレフィックス `docs` つき）→ 一覧に表示 → ダウンロード内容一致
  → 削除、の一連の動作を確認
- 同名キーの再アップロードが 409 で拒否されることを確認
- フロントエンドの `npm run build`（型チェック込み）が通ることを確認
