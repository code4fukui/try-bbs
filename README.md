# private-bbs

## how to run

```sh
deno serve --allow-import --allow-write --allow-read --allow-net --port 8080 --host "[::]" server.js
```

管理者は `data/sabae/pubkey/{pubkey}.json` のユーザーデータに `admin: true` を追加して指定します。

## 登録者一覧のCSVエクスポート

登録者情報をCSVに出力できます。引数を省略すると標準出力へ出力されます。

```sh
# ファイルに保存（Excelで開きやすいUTF-8 BOM付き）
deno run --allow-read --allow-write export_users.js users.csv

# 標準出力へ出力
deno run --allow-read export_users.js > users.csv
```

CSVには「名前」「メールアドレス」「登録日時」を出力します。ログインに使うUUIDや内部IDは、漏えい防止のため出力しません。

## memo

- インスタントURLで入る
    - 一度入ったら、その端末でしか見えない (localStorageに秘密鍵)
    - URLに名前を入れておく
    - 初回にはルールが表示されて、同意するボタンを表示
- 管理者は、名前を入れて、インスタントURLを発行できる
- 見る、コメントする
    - コメントが見られる
    - 最新コメントがあったものが優先表示
- 投稿
    - UUID、親投稿UUID（or なし）、本文、日時、名前、公開鍵、電子署名
    - 日時別の記録（ファイル記録）
    - 最新スレッド100のリスト（ローカルで構成）

- 投稿時の項目
    - 企業名
    - 困りごと写真、図
    - 住所
    - TEL
    - URL

- ファイル添付
    - input-file
    - 個別にアップロード
    - URLを添付として追加
    - 添付ファイルクリックで表示、画像縮小をサーバーで
