# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

フィンランド語精読練習ツール。2ファイル構成:
- `lukija-pro.html` — フロントエンド（HTML/CSS/JS 単一ファイル、ビルド不要）
- `lukija-proxy.gs` — Google Apps Script バックエンド（GASエディタに貼る）

ブラウザで `lukija-pro.html` をダブルクリックするか、VS Code Live Server で開いて使う。

## 開発コマンド

ビルドツール・テストフレームワークなし。構文チェックは node を使って手動で行う:

- インラインJSのチェック: `<script>` タグのうち `src=` 属性を持たないものを抽出して構文評価する
- CSSチェック: `<style>` タグ内の `{` と `}` の個数が一致するか確認する
- **注意**: スクリプト本文に `im.src=` 等が含まれるため、内部/外部スクリプトの判定はタグの属性側だけで行うこと（本文で判定すると誤検出する）

## ファイルの2か所同期（重要）

同じファイルが2か所に存在する。**変更後は必ず両方に反映すること**:
- 作業用（git管理）: `C:\Users\Mining-Base\Downloads\suomiuuteset\lukija-pro.html`
- 本番用（ユーザーがダブルクリックで開く）: `C:\Users\Mining-Base\Downloads\lukija-pro.html`

`PROXY` 定数のURLも両方で一致させること（過去に本番用がプレースホルダのままで "Failed to fetch" が発生した事故あり）。

## GASのデプロイ

`lukija-proxy.gs` を変更した場合:
1. script.google.com でコードを貼り替え
2. **新しいデプロイ**（既存デプロイの編集ではなく「新バージョン」）を作成
3. `/exec` URLが変わる場合は `lukija-pro.html` の `PROXY` 定数も更新

フロントのみの変更はGAS再デプロイ不要、ブラウザ再読み込みのみ。

## アーキテクチャ

### フロント↔バックの契約（壊さないこと）

単語クリック時のPOSTと返却JSON:

```
POST body: { "word": "...", "sentence": "..." }
返却: { "perusmuoto", "wordClass", "contextMeaning", "baseMeaning", "plain", "grammar" }
```

`showDetail()` がこのキーをそのまま参照。キー名を変える場合は両方同時に直す。

画像ヘルパーは別モード:

```
POST body: { "mode": "image", "mediaType": "image/jpeg", "image": "<base64>", "question": "..." }
返却: テキスト解説（JSONではない）
```

### GASのPOST送信は `Content-Type: text/plain`

`application/json` に変更するとCORSプリフライトが発生して失敗する。変更しないこと。

### DOM構築ルール

`innerHTML` は使用禁止。`createElement` / `textContent` のみで構築すること（セキュリティフック）。既存の `el(tag, cls, text)` ヘルパー関数を活用する。

### 品詞カラーシステム

`POS_MAP` 配列 + `posStyle(wordClass)` 関数で品詞を色・絵文字にマッピング。`showDetail()` と `renderVocab()` が参照する。

### RSSキャッシュ

`rssCache` オブジェクト（id → items）でセッション中の重複フェッチを防ぐ。

### マルチソース

`SOURCES` 配列を編集するだけでソースの追加・削除・切替が可能。`kind:"rss"` は自動フェッチ、`kind:"links"` は固定リスト（`read:true` で精読ツール、`false` で外部リンク）。

## Gitコミット

著者インライン指定で統一（個人情報保護）:

```
git -c user.email="lukija@local" -c user.name="lukija" commit -m "メッセージ"
```
