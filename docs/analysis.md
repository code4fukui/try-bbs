# try-bbs 分析メモ

## 概要

`try-bbs` は、Deno で動作する招待制の簡易BBSです。用途は「企業のお困り事解決アイデアコンテスト」向けで、メール登録後に発行される専用URLからログインし、困り事の投稿、コメント、添付ファイルの送受信を行います。

クライアントは静的HTMLとブラウザ上のES Modulesで構成され、サーバーは `PubkeyUser` の `makeFetch` を通じてAPIを公開します。投稿データはCBORファイルとJSONLタイムラインでローカル永続化されます。

## 実行方法

`README.md` と `run.sh` の内容から、Deno Deploy形式またはローカルDenoでの起動を想定しています。

```sh
deno serve --allow-import --allow-write --allow-read --allow-net --port 8080 --host "[::]" server.js
```

`run.sh` では簡便に全権限で起動します。

```sh
./run.sh 7001
```

起動時には少なくとも次の環境変数が必要です。

| 変数 | 用途 |
| --- | --- |
| `GMAIL_ID_PASS` | `Gmailer` 用の認証情報。`id/pass` 形式で分割される |
| `ALLOWED_MAILADDRESS` | `IDChecker` の許可アドレスリスト。現状チェック処理はコメントアウトされている |

`.env` は `.gitignore` 対象です。

## 主要ファイル

| ファイル | 役割 |
| --- | --- |
| `server.js` | API本体。登録、ログイン、投稿、取得、アップロード、ダウンロードを処理 |
| `Posts.js` | 投稿の永続化、最新投稿リスト、CBOR保存、JSONLタイムライン管理 |
| `static/Post.js` | ブラウザ側の投稿署名作成と署名検証ヘルパー |
| `static/index.html` | 投稿一覧とコメント投稿画面 |
| `static/post.html` | 困り事の新規投稿画面 |
| `static/regist.html` | メールアドレス登録画面 |
| `static/style.css` | 画面スタイル |
| `mail_test.js` | メール送信の単体確認用スクリプト |
| `run.sh` | ローカル起動補助 |

## 画面構成

### `static/regist.html`

ニックネームとメールアドレスを入力し、`regist` APIを呼びます。クライアント側でメール形式の簡易検証を行います。登録成功時はメール確認を促すアラートを表示します。

### `static/index.html`

投稿一覧とコメント欄を表示します。URLに `mail` と `uuid` が付いている場合は `login` APIを呼び、成功後に返されたユーザー名を `localStorage` に保存し、クエリ文字列をブラウザのアドレスバーから消します。

投稿取得は `getLatest` APIで行います。取得した投稿のうち `parent` がないものを親投稿として表示し、`parent` が一致する投稿をコメントとして表示します。

### `static/post.html`

困り事の新規投稿画面です。本文のほか、次の項目を追加入力として本文に連結します。

- 企業名
- 代表者名
- 住所
- HP
- 事業内容

添付ファイルは `InputFilePubkeyUser` を通じてアップロードされ、投稿データの `files` に保持されます。

## API

APIは `server.js` の `api(path, param, pubkey)` に集約されています。先頭で `pubkey` が必須とされているため、登録前の `regist` も含め、クライアント側が公開鍵を持っている前提です。

| path | param | 処理 |
| --- | --- | --- |
| `regist` | `{ name, mail }` | メール形式を検証し、UUIDとTIDと日時を付与して `data/sabae/user/{mail}.json` に保存。ログインURLをメール送信 |
| `login` | `{ mail, uuid }` | 登録済みユーザーのUUIDを確認し、`data/sabae/pubkey/{pubkey}.json` にユーザー情報を保存。ユーザー名とメールアドレスを返す |
| `add` | 投稿オブジェクト | 公開鍵が登録済みか確認し、投稿内の公開鍵、投稿者名、署名を検証して保存 |
| `get` | 投稿ID想定 | 登録済み公開鍵か確認し、単一投稿を返す想定 |
| `getLatest` | 最終取得ID | 登録済み公開鍵か確認し、指定IDより新しい最新投稿を返す |
| `user` | なし | 登録済み公開鍵に紐づくユーザー名とメールアドレスを返す |
| `upload` | `{ fn, bin }` | TIDを生成し、拡張子付きパスにバイナリ保存 |
| `download` | `{ tid, fn }` | TIDとファイル名から保存済みバイナリを読み出す |

## データモデル

投稿は概ね次の形式です。

```js
{
  data: {
    id: "TAI64N文字列",
    parent: "親投稿IDまたはnull",
    pubkey: "投稿者公開鍵",
    name: "投稿者名",
    body: "本文",
    tags: ["test"],
    files: [
      { fn: "ファイル名", tid: "TID" }
    ]
  },
  sign: "dataをCBORエンコードした署名"
}
```

`id` は投稿時刻から作るTAI64N文字列で、辞書順比較により時系列判定されています。

## 永続化

投稿は `Posts.js` により `data/` 配下に保存されます。

```text
data/
  timeline.jsonl
  YYYYMMDD/
    {TAI64N}.cbor
  sabae/
    user/
      {mail}.json
    pubkey/
      {pubkey}.json
files/
  ...
```

`timeline.jsonl` は `{ id }` の追記ログです。起動時にこのログを読み直し、最新50件をメモリに復元します。投稿本体は日付ディレクトリ配下のCBORファイルとして保存されます。

添付ファイルは `files/` 配下に保存されます。`files/` はGit管理外です。

## 投稿取得の仕組み

`Posts.create()` は `timeline.jsonl` を先頭から読み、各IDを `unshift` して最新順に並べます。メモリ上の `latest` は最大50件です。

`getLatest(lastdt)` は `latest` の中から `post.data.id > lastdt` の投稿だけを返します。クライアント側では受け取った投稿をローカル配列に追加し、親投稿とコメントの関係をブラウザ上で再構成します。

## 認証・アクセス制御

基本的な流れは次の通りです。

1. ブラウザが `PubkeyUser` で鍵ペアを保持する。
2. 登録画面でメールアドレスを登録する。
3. サーバーがUUID付きURLをメール送信する。
4. URLアクセス時に `login` し、公開鍵とユーザー情報をサーバーに紐づける。
5. 以降、登録済み公開鍵のみ投稿・取得できる。

`PubkeyUser` はAPIリクエスト単位の署名を検証しています。`makeFetch()` はリクエスト本文の `data.sign` を `PubkeyUser.verify()` に渡し、検証できた公開鍵だけを `api(path, param, pubkey)` に渡します。この署名は「このAPI呼び出しが秘密鍵保持者から送られたこと」と「署名日時が有効期限内であること」を確認するためのものです。

一方で、投稿オブジェクト自体にも `post.sign` があります。これは `static/Post.js` の `Post.create()` が `post.data` に対して作る署名です。現在の `server.js` では `add` APIで保存前に次を確認しています。

- 投稿オブジェクトに `data` と `sign` があること
- APIリクエスト署名から得た `pubkey` と `post.data.pubkey` が一致すること
- 登録情報の名前と `post.data.name` が一致すること
- `Post.verify(post)` が成功すること

投稿者名はクライアントが `login` または `user` APIで取得し、投稿データに入れてから署名します。サーバーは保存前に登録名との一致を確認しますが、署名済みの `post.data` は書き換えません。そのため、保存後の投稿オブジェクトも `Post.verify()` で再検証できます。

## 気になる点・改善候補

### バグまたは不具合の可能性が高い点

- `server.js` の `get` 分岐で `posts.get(id)` を呼んでいますが、`id` が定義されていません。`param` または `param.id` を使う必要があります。
- `login` で `fs.loadJSON()` が `null` を返した場合に `o.uuid` 参照で例外になる可能性があります。
- `server.js` 起動時に `GMAIL_ID_PASS` や `ALLOWED_MAILADDRESS` が未設定だと `.split()` で例外になります。
- `static/style.css` の `.container` に `padding: 0 1remf;` という不正な単位があります。
- `static/regist.html` の登録完了後、ボタン文言が `"登録"` に戻りますが、初期表示は `"登録する"` です。

### セキュリティ・整合性

- `add` APIでは投稿オブジェクト内の `post.sign`、`post.data.pubkey`、`post.data.name` を保存前に検証しています。
- `download` は登録済みユーザーであればTIDとファイル名を知っているファイルを取得できます。投稿への添付権限や参照権限との紐づけはありません。
- メールアドレス制限の `IDChecker` チェックがコメントアウトされており、現状は任意の有効なメールアドレスで登録可能です。
- メールログインURLのUUIDはURLクエリに載ります。アクセス後にクライアント側で消している点はよいですが、アクセスログやメール転送では漏えいし得ます。

### 機能・運用

- 最新リストは50件のみです。親投稿が50件より古く、コメントだけが最新50件に入る場合、そのコメントの親投稿は一覧に表示されません。
- `post.html` と `index.html` には重複コードが多く、投稿作成、時刻表示、コメント描画などは共通モジュール化できます。
- `README.md` のリポジトリ名は `private-bbs` ですが、現在のディレクトリは `try-bbs` です。GitHubリンクも `private-bbs` を指しています。
- `mail_test.js` と `server.js` にメール本文とURL生成ロジックが重複しています。
- `regist.html` には「福井高専の学生メールアドレスが必要」と表示されていますが、サーバー側チェックは無効化されています。表示と実挙動に差があります。

## 優先度の高い次アクション

1. `get` APIの未定義変数を修正する。
2. `login` と環境変数読み込みに失敗時の明示的なエラー処理を追加する。
3. 登録可能メールアドレスの仕様を決め、画面表示とサーバー制御を一致させる。
4. 添付ファイルのダウンロード権限を投稿参照権限と紐づける。
5. 最新50件だけに依存しない親投稿・コメント取得方法を設計する。
