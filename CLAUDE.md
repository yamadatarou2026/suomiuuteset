# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

フィンランド語精読練習ツール。学習者は日本語話者の初心者。フロントは素のHTML/CSS/JS 1ファイル（ビルド不要）、バックエンドは Google Apps Script。

主な機能: ①ニュースURL/RSSから本文抽出して精読 ②単語クリックで原形化・意味・やさしい文法解説 ③単語帳(localStorage)+Anki書き出し ④画像ヘルパー（写真をやさしく解説）⑤ライティングテスト（記事から問題生成・採点）⑥ダーク/ライト テーマ切替。

## ファイル構成

- `lukija-pro.html` — フロント本体（全機能・全CSS・全JSがこの1ファイル）
- `lukija-proxy.gs` — GASウェブアプリ（GASエディタに貼る。リポジトリのコピーは参照用）
- `index.html` — GitHub Pages用リダイレクト（`./lukija-pro.html` へ転送するだけ。ルートURLでスマホから開けるように）

## デプロイと配信

- **本番URL（スマホ用）**: `https://yamadatarou2026.github.io/suomiuuteset/`（GitHub Pages、リポジトリ `yamadatarou2026/suomiuuteset`）
- **フロント変更**: `git push` するだけで Pages に自動反映（数十秒でビルド）。GAS再デプロイ不要。
- **GAS変更**: script.google.com でコードを貼り替え → **「デプロイを管理」→ 編集 → 新バージョン → デプロイ**。「新バージョン」にしないと反映されない。`/exec` URLが変わったら `lukija-pro.html` の `PROXY` 定数を更新して push。
- `gh` CLI は `C:\Program Files\GitHub CLI\gh.exe`（bashのPATHには無い。PowerShellで `$env:Path += ";C:\Program Files\GitHub CLI"` してから使う）。

## ファイルの2か所同期

`lukija-pro.html` が2か所に存在し、変更時は**両方に反映**する:
- 作業用（git管理／Pages配信元）: `C:\Users\Mining-Base\Downloads\suomiuuteset\lukija-pro.html`
- 本番用（PCでダブルクリックして開く用）: `C:\Users\Mining-Base\Downloads\lukija-pro.html`

`PROXY` と `APP_TOKEN` を両方で一致させること（過去に本番用がプレースホルダのままで "Failed to fetch" の事故あり）。スマホ運用が主なら Pages 側だけでも可。

## アーキテクチャ

### GASプロキシは1エンドポイント・複数モード

`doGet ?url=…` … 記事HTML/RSSをサーバー側で `UrlFetchApp` 取得して生で返す（CORS回避。抽出はフロントのReadability担当）。**有料APIは呼ばない**。

`doPost`（全モード共通でトークン認証＋日次上限を先頭で通過）:
- `mode:"image"` → **Gemini**（画像ヘルパー）。戻り値はテキスト解説。
- `mode:"ocr"` → **Gemini**（画像→文字起こし）。`OCR_PROMPT` で本文だけ抽出し、プレーンテキストを返す（JSONではない）。日次カウンタは image と共有。
- `mode:"writing", action:"generate"` → **Claude**。記事から6問生成、`{questions:[…]}` を返す。
- `mode:"writing", action:"grade"` → **Claude**。採点。typeCは添削、それ以外は正誤。
- それ以外（単語解析） → **Claude**（§JSON契約）。

### フロント↔バックのJSON契約（壊さないこと）

単語解析: `POST { token, word, sentence }` → 返却:
```
{ perusmuoto, wordClass, contextMeaning, baseMeaning, plain, grammar, grammarEasy, breakdown }
```
- `grammarEasy` … たとえ入りのやさしい文法解説（詳細カードの「徹底解説」緑ボックス）
- `breakdown` … 複合語をハイフン連結した分割形、単純語は `null`（原形の横に薄字表示）
- `showDetail()` がこのキーをそのまま参照。キー名を変えるならフロント・GAS両方同時に直す。

### コスト防御（重要）

公開URLのため、有料API濫用を防ぐ二段構え。**GASとフロントの両方を変更しないと機能しない**:
- `APP_TOKEN` … フロント(`lukija-pro.html`)とGAS(`lukija-proxy.gs`)で一致必須。全 `doPost` body に `token` を入れて送る。不一致は `FORBIDDEN`。ページソースに載るので秘匿は不完全だが、ボット/通りすがりを弾く。
- `DAILY_LIMIT`（GAS、既定200）… 日本時間1日あたりの有料API呼び出し上限。`PropertiesService` のカウンタ。超過で `RATE_LIMIT`。最悪コストの頭打ち。
- APIキーはコードに無くGASスクリプトプロパティ（`ANTHROPIC_KEY` / `GEMINI_KEY`）管理。リポジトリ公開でも安全。

### GASのPOST送信は `Content-Type: text/plain`

`application/json` に変えるとCORSプリフライトで失敗する。変更しないこと。

### テーマ（ダーク既定＋ライト切替）

- 配色はすべてCSS変数。`:root`=ダーク、`:root[data-theme="light"]`=旧型暖色。**直書きの色を足さない**（テーマが切れる）。新しい色は両ブロックに変数を追加する。
- 右上トグル `#themeToggle` が `data-theme` を付け外し、`localStorage` の `lukija_theme` に保存。`<head>` の早期インラインスクリプトで描画前に適用（チラつき防止）。

### フォント

Syne(700/800)=ロゴ・見出し / DM Mono=本文・UI全般 / Bitter=原形(.base)・設問文・breakdown。3書体とも `<head>` の Google Fonts link で読込。

### DOM構築ルール

動的な要素は `innerHTML` ではなく `createElement`/`textContent`（`el(tag,cls,text)` ヘルパー）で構築する。例外は `renderArticle()` の Readability整形済みHTML挿入のみ。

### その他の仕組み

- 本文抽出: **Mozilla Readability**（CDN）。`renderArticle()`→`wrapWords()` で見出し・段落構造を残し単語を `<span class="w">` で包む。
- 品詞カラー: `POS_MAP` + `posStyle(wordClass)`。`showDetail()`/`renderVocab()`/`renderStats()` が参照。
- マルチソースピッカー: `SOURCES` 配列を編集するだけで増減・切替。`kind:"rss"`=自動フェッチ、`kind:"links"`=固定リスト（`read:true`精読 / `false`外部タブ）。`rssCache` で重複取得を防ぐ。
- ライティング: 記事取込時に `writingArticleText`/`articleMeta` を更新。出題元タイトル+リンクを `#writingSource` に表示。
- 画像ヘルパー: 写真を `resizeToJpeg()`（長辺1600px・JPEG化）で圧縮し `helperImageB64` に保持。2ボタン構成 — 「解説して」(`#helperSend`, `mode:"image"`) と「文字を読む」(`#helperOcr`, `mode:"ocr"`)。OCRは結果を `renderOcrConfirm()` の編集用 textarea に出し、「このテキストで読む」で `renderArticle(text,false)`→リーディングタブへ自動切替＋記事へ自動スクロール（誤認識を直してから精読に流す）。両ボタンは `helperImageB64` の有無で disabled 連動。
  - ⚠️**OCR確認欄の textarea は「編集専用」で単語クリック不可**。訳・説明はリーディング画面（`<span class="w">`）でしか出ない。過去にユーザーが textarea の文字を直接クリックして「翻訳が出ない」と誤解した事例あり → 確認欄に案内文（👇このテキストで読む…）を表示して導線を明示済み。クリック連鎖は `renderArticle(text,false)`→`wrapWords()`→`handleWord()` で貼り付けテキストと完全に同一機構（プレビュー検証済み）。

## 構文チェック（ビルド・テストは無し）

- インラインJS: `<script>` のうち `src=` 属性が**無い**ものを抽出し構文評価。スクリプト本文に `im.src=` 等があるため、内部/外部判定はタグ属性側だけで行う。
- CSS: `<style>` 内の `{` と `}` の個数一致を確認。
- GAS: 一時的に `.js` にコピーして `node --check`（`.gs` のままだと拡張子エラー）。

## 合言葉「記憶更新」

ユーザーが「**記憶更新**」（または記憶に関する文脈での「更新」）と言ったら、このセッションの作業内容を反映して **CLAUDE.md を差分で更新**する（`/init` のまるごと再生成ではなく、手書きの調整を残したまま追記・修正）。更新後はコミット＆push する。ユーザーはコマンド名を覚えなくてよいよう、この合言葉で記憶更新を依頼する運用。

## Gitコミット

著者インライン指定で統一（個人情報保護）:
```
git -c user.email="lukija@local" -c user.name="lukija" commit -m "メッセージ"
```
