# deploy-check — ECS / CloudFront はどこまで動くか

「バックエンドを ECS に、フロントエンドを CloudFront + S3 に載せる」を
AWS Emulator で試す検証スクリプト集です。アプリではなく、デプロイ系の
API がどこまで通って、どこで止まるかを確認するためのものです。

## セットアップと実行

先に AWS Emulator を起動しておきます（リポジトリ直下の README 参照）。

```bash
cp .env.example .env   # ~/.aws/emulator/9297/ のパスを自分の環境に合わせて編集
npm install
npm run check:ecs          # ECS の検証
npm run check:cloudfront   # CloudFront + S3 の検証
npm run check:lambda       # Lambda の検証
```

エミュレータはインメモリなので、再起動すれば作ったリソースは消え、
何度でも同じ手順を再実行できます。

## 検証結果 (2026-11-17, AWS Emulator v1.0.483)

### ECS (`ecs-check.js`)

- クラスター作成 → ACTIVE、タスク定義の登録 → ACTIVE
- VPC / サブネットはエミュレータ内の EC2 API で作成でき、RunTask は
  サブネットの実在チェックまで本物同様に行う（存在しないサブネットは
  `InvalidSubnetID.NotFound` で弾かれる）
- RunTask は受理され、タスクは PROVISIONING になる
- **ただしタスクは約10秒で STOPPED になる。** イメージを pull して
  プロセスを起動するコンテナ実行基盤がないため、Express がポートで
  待ち受けることはない

→ デプロイ手順・IaC・SDK コードのテストには使えるが、バックエンドの
実体はローカルプロセスとして起動する形になる。

### CloudFront + S3 (`cloudfront-check.js`)

- S3 へのファイル配置は実働する（保存・取得とも本物）。静的ホスティング
  設定（IndexDocument）の保存・取得も API 通り動く
- 公開ポリシーは Block Public Access に本物同様に弾かれ、設定を緩めて
  から付ける必要がある
- CloudFront ディストリビューションは作成でき、ローカル用ドメイン
  （`127.0.0.1:<ポート>`）が割り当てられて応答する。なお
  DistributionConfig の `Comment` が必須（無いと MalformedXML）
- **ただし、そのドメイン経由の取得は公開読み取りポリシーを付けても
  403 AccessDenied で、ページ配信までは動かない**

→ フロントエンドは「ファイル配置は本物、CDN 配信は形だけ」。
ECS の「タスクが起動しない」と合わせて、どちらも現時点では
"載せるだけの検証" が中心になる。

### Lambda (`lambda-check.js`) — 例外的に「本当に動く」

- 関数の作成（zip アップロード）ができ、状態は Pending → Active に遷移する
- **Invoke するとハンドラが実際に実行され、戻り値が返ってくる**
  （python3.12 / nodejs20.x の両方で、イベントの echo を含む応答を確認）
- ECS と違い、こちらはコントロールプレーンだけでなく実行まで実働する

→ バックエンドを Lambda 関数として書く構成なら、このエミュレータ上でも
ローカルで実行検証ができる。
