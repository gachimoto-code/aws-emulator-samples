# aws-emulator-samples

AWS公式のローカルエミュレータ **AWS Emulator**（[aws/aws-emulator](https://github.com/aws/aws-emulator)）を
使った React / Express サンプルアプリ集です。AWSアカウント不要で、開発と検証が
すべてローカルで完結します。

共通構成: `frontend/` = Vite + React + TypeScript、`backend/` = Express + TypeScript。
バックエンドが AWS SDK for JavaScript v3 でエミュレータの単一エンドポイント
(`https://127.0.0.1:9297`) を叩きます。

## サンプル一覧

| フォルダ | 内容 | 使うAWSサービス | 状態 |
|---|---|---|---|
| [notes-app](notes-app/) | ノートアプリ（CRUD + 添付ファイル） | DynamoDB / S3 | ✅ 実装・検証済み |
| [files-app](files-app/) | ファイル管理アプリ | S3 | ✅ 実装・検証済み |
| [queue-app](queue-app/) | タスクキューアプリ | SQS | ✅ 実装・検証済み |
| [deploy-check](deploy-check/) | ECS / CloudFront に「載せる」検証スクリプト | ECS / EC2 / S3 / CloudFront | ✅ 検証済み（配信・実行は不可） |

## 事前準備: AWS Emulator の起動

Debian系の場合（公式ドキュメント: Getting started on Linux）:

```bash
curl -fsSLo aws-emulator.deb https://downloads.aws.com/aws-emulator/packages/aws-emulator/LTS/latest/aws-emulator_amd64.deb
sudo apt-get install -y ./aws-emulator.deb

aws-emulator            # 起動 (HTTPS 127.0.0.1:9297)
# テレメトリを切る場合: aws-emulator -t off
```

起動すると `~/.aws/emulator/9297/` に `config` / `emulator_credentials` /
`ca.pem` が生成されます。各アプリの backend/.env はこのパスを参照します。
エミュレータの状態はインメモリのみで、再起動するとリソースは空に戻ります
（各アプリのバックエンドが起動時に必要なリソースを自動作成します）。

各アプリの詳しいセットアップは、それぞれのフォルダの README を参照してください。
