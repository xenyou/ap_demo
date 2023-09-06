# ap_demo
Minimum Mastodon

ユーザアカウントすら作らないActivityPubのサンプル実装。

### usage
app.jsを開いてdomain変数を書き換えてください。ngrokとか使うと楽だと思います。

起動
```
npm install
node app.js
```

ngrokとかで外部に公開。以下は一例。
```
ngrok http --domain=fairly-legal-tapir.ngrok-free.app 3000
```

mastodon.socialあたりにアカウントを作って検索してフォローする。
アカウント名はなんでも良いです。

投稿。fromはフォローしたアカウント名に書き換えてください。
```
curl -X POST -H "content-type: application/json" -d '{"msg":"こんにちは","from":"account1"}' localhost:3000/exe/post
```
