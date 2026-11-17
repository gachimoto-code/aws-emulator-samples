# genu-app — GenU風チャット（AWS Emulator版）

[GenU（Generative AI Use Cases, aws-samples）](https://github.com/aws-samples/generative-ai-use-cases)
の構成を、AWS公式エミュレータ上に再現したサンプルです。
推論はエミュレータの Bedrock（ダミー応答）のままにしてあり、
「配管がどこまで本物として動くか」を見るためのものです。

## 構成（GenUとの対応）

- **フロントエンド**: React + Vite + TypeScript（`frontend/`、ポート5176）
  - 本物のGenUは S3 + CloudFront で配信。本エミュレータは CloudFront の
    ページ配信ができないため、ローカルの Vite で配信します
- **認証**: Cognito ユーザープール
  - プール作成・ユーザー登録・パスワード認証（トークン発行）まで実際に動きます
  - フロントは AWS SDK for JS でエミュレータの Cognito エンドポイントを直接叩きます
- **API**: API Gateway（HTTP API）→ Lambda プロキシ統合（Payload 2.0）
  - ルーティングが実際に働き、Lambda が実行されます
- **バックエンド**: Lambda 関数5本（TypeScript、esbuildでバンドル）
  - `POST /chats` / `GET /chats` / `GET /chats/{id}` / `DELETE /chats/{id}` /
    `POST /chats/{id}/messages`
- **会話履歴**: DynamoDB テーブル `GenUChats`（ユーザー別一覧用の GSI `byUser` 付き）
- **推論**: Bedrock Converse API
  - **エミュレータの Bedrock はダミー応答です**。形式の整った応答が返りますが、
    本文は “No language model runs in this emulator.” という定型文で、
    実際の文章生成は行われません
  - さらに制約が1つ: Lambda の中からの呼び出しは、ランタイムの内部
    ディスパッチに bedrock-runtime が登録されておらず届きません
    （ホスト側の SDK からなら同じ Converse が応答します）。
    そのため send-message は実物の Converse 呼び出しを試みて、
    失敗したらダミー文にフォールバックします

## 本物との違い（簡略化した点）

- GenU は CDK で一括デプロイしますが、こちらは `deploy.mjs` が SDK で
  順にリソースを作ります
- GenU は API Gateway に Cognito の JWT オーソライザーを付けてトークンを
  検証します。こちらは Lambda 側でトークンをデコードして `sub` を読むだけ
  （署名検証なし）です。ローカル再現専用の簡略化なので、本番では真似しないでください
- Lambda の実行環境には認証情報が自動では入らないため、deploy が
  エミュレータ自身の認証情報を関数の環境変数に注入します
  （CA 証明書も同様に注入）
- 関数の中から AWS サービスを呼ぶときは、エミュレータのエンドポイント
  （127.0.0.1:9297）を指定すると「addresses no service」で弾かれます。
  ランタイムが HTTPS を横取りしてサービス名（ホスト名）で振り分けるため、
  SDK のデフォルトエンドポイント（dynamodb.<region>.amazonaws.com 等）を
  そのまま使うのが正解でした
- GenU の他機能（RAG、画像生成、文字起こし等）は対象外です

## 動かし方

前提: エミュレータが起動していること（`aws-emulator`、https://127.0.0.1:9297 ）。

```bash
cp .env.example .env   # パスを自分の環境に合わせて修正
npm install
npm run deploy         # テーブル/プール/関数/APIを作成し frontend/.env.local を生成
cd frontend
npm install
npm run dev            # http://localhost:5176
```

デモユーザー（deploy が作成）: `demo@example.com` / `Demo1234!`

エミュレータは状態をメモリにしか保持しないため、再起動したら
`npm run deploy` を再実行してください。

## ブラウザから使うときの注意

エミュレータは自己署名CAのHTTPSで応答します。ブラウザからフロントを
開いて実際にサインイン/送信まで行うには、そのCAをブラウザに信頼させる
必要があります（`~/.aws/emulator/9297/ca.pem`）。
API 自体の疎通は curl 等で CA を指定すれば確認できます。
