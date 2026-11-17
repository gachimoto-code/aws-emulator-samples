# ノートアプリ (AWS Emulator × React / Express)

AWS公式のローカルエミュレータ **AWS Emulator**（aws/aws-emulator）に対して、
DynamoDB と S3 を使うノートアプリです。AWSアカウントは不要で、開発と検証は
すべてローカルで完結します。

## 構成

```
frontend/  Vite + React + TypeScript        … ノートのUI (http://localhost:5173)
backend/   Express + TypeScript              … REST API (http://localhost:4000)
             ├─ DynamoDB テーブル "Notes"    … ノート本体 (id / title / body / 添付メタ / 日時)
             └─ S3 バケット "notes-attachments" … 添付ファイルの実体
```

- バックエンドは AWS SDK for JavaScript v3 でエミュレータの単一エンドポイント
  (`https://127.0.0.1:9297`) を叩きます。認証情報はエミュレータが起動時に
  発行するものを使い、TLSはエミュレータのCA証明書 (`ca.pem`) を信頼します。
- S3はパススタイル addressing を使います（単一エンドポイントでは
  `<bucket>.127.0.0.1` が解決できないため）。

## セットアップ

### 1. AWS Emulator

Debian系の場合（公式ドキュメント: Getting started on Linux）:

```bash
curl -fsSLo aws-emulator.deb https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator_amd64.deb
sudo apt-get install -y ./aws-emulator.deb

aws-emulator            # 起動 (HTTPS 127.0.0.1:9297)
# テレメトリを切る場合: aws-emulator -t off
```

起動すると `~/.aws/emulator/9297/` に `config` / `emulator_credentials` /
`ca.pem` が生成されます（停止すると消えます。再起動すれば同じパスに再生成
されます）。エミュレータの状態はインメモリのみで、再起動するとリソースは
空に戻ります。

### 2. バックエンド

```bash
cd backend
cp .env.example .env    # .env 内の /home/<you>/... を自分のパスに直す
npm install
npm run dev             # http://localhost:4000
```

起動時に DynamoDB テーブルと S3 バケットがなければ自動で作成します
（エミュレータがインメモリで毎回リセットされるため）。

### 3. フロントエンド

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

`VITE_API_BASE_URL` のデフォルトは `http://localhost:4000` です
（変える場合は frontend/.env.example を参照）。

## 本物のAWSに切り替える場合

backend/.env から `AWS_ENDPOINT_URL` とエミュレータ用ファイル指定
(`AWS_CONFIG_FILE` / `AWS_SHARED_CREDENTIALS_FILE` / `AWS_EMULATOR_CA_PATH`)
を外し、通常の認証情報チェーンで実アカウントの認証情報を渡すだけです。
コード側の変更は不要です（S3のパススタイル指定もエンドポイント未設定時は
自動で無効になります）。

## 検証結果 (2026-11-17、この開発環境で実施)

- エミュレータ: v1.0.483（Debianパッケージ、GPG署名を公式フィンガープリントで検証済み）
- バックエンド起動時にテーブル `Notes` とバケット `notes-attachments` を自動作成
- APIスモークテスト全通過:
  - ノート作成 → 一覧 → 更新（タイトル変更・本文保持）→ 削除 (HTTP 204)
  - 添付アップロード (S3 PutObject) → ダウンロードで内容が一致 → 添付削除
- フロントエンド: `npm run build`（tsc + vite build）成功
