# lukija 引き継ぎ書（Claude Code 用）

> このファイルを読んだら、まず `lukija-pro.html` と `lukija-proxy.gs` の現状を把握してから作業を始めてください。**現状は「動く完成状態」**です。壊れていません。

---

## 1. これは何か（プロジェクトの目的）

フィンランド語の**リーディング（精読）練習**ツール。学習者は日本語話者の初心者。

ユーザー体験:
1. フィンランド語ニュースの**URLを貼る**（主に Yle selkouutiset = やさしいフィンランド語ニュース。個別記事は `https://yle.fi/a/…`）
2. 記事本文が**自動抽出**されて表示される（見出し・段落は保持）
3. **わからない単語をクリック**すると、その場で以下が出る:
   - 変化形 → **原形（perusmuoto）**（例: `taloissamme` → `talo`）
   - 品詞 / この文での意味 / 原形の意味
   - **「なぜこの形？」= 専門用語を使わないやさしい説明**（初心者向け・これが主役）
   - `▾ 文法用語でくわしく` = 折りたたみの中に中級者向けの正確な文法説明
4. クリックした語は**単語帳**に貯まる（localStorage 永続化）。**Anki用 TSV 書き出し**可。

> フィンランド語特化のキモ = **膠着語なので語形変化が激しく、辞書の引き形（原形）に戻す lemmatization が必須**。ここを LLM にやらせているのがこのツールの核心。

---

## 2. 構成（2ファイル）

### `lukija-pro.html` … フロント（画面本体）
- 素のHTML/CSS/JS 1ファイル。ビルド不要。ダブルクリックで起動 or GitHub Pages に置く。
- フォント: Fraunces + Archivo（Google Fonts）。
- 本文抽出: **Mozilla Readability**（CDN: `@mozilla/readability@0.5.0`）。
- 設置場所（ユーザー環境）: `C:\Users\Mining-Base\Downloads\lukija-pro.html`

### `lukija-proxy.gs` … バックエンド（Google Apps Script ウェブアプリ）
役割は2つ:
- **doGet `?url=…`** … ニュースURLをサーバー側で `UrlFetchApp` 取得し、**生HTMLをそのまま返す**（ブラウザのCORS回避のため）。抽出はフロントの Readability が担当。
- **doPost `{word, sentence}`** … Anthropic API に中継し、解析JSONを返す。APIキーは**スクリプトプロパティ `ANTHROPIC_KEY`** に格納（フロントには出さない）。

### つなぎ
- フロント先頭の定数 `const PROXY = "…/exec"` に GAS ウェブアプリの `/exec` URL を設定済み。
- **POSTは `Content-Type: text/plain` で送信**している（GASのプリフライト＝CORSエラー回避。重要・変更しないこと）。

---

## 3. フロント↔バックの契約（壊さないこと）

単語クリック時、フロントは proxy に POST する:
```json
{ "word": "<クリックした語そのまま>", "sentence": "<その語を含む段落テキスト>" }
```
proxy（= Claude）は **JSONのみ**を返す（前置き・コードフェンス禁止）:
```json
{
  "perusmuoto": "辞書形",
  "wordClass": "品詞",
  "contextMeaning": "この文での意味",
  "baseMeaning": "原形の意味",
  "plain": "なぜこの形かを専門用語なしで1〜2文",
  "grammar": "文法用語での正確な説明（中級者向け）"
}
```
フロントの `showDetail()` がこのキーをそのまま表示。**キー名を変えるなら両方同時に直す。**

---

## 4. 現状（どこまで出来ているか）

- ✅ URL取り込み（proxy → Readability）動作確認済み（Yle selkouutiset でテスト済み）
- ✅ 単語クリック → 原形・意味・やさしい説明・折りたたみ文法、すべて動く
- ✅ 単語帳（localStorage）+ Anki書き出し（TSV ダウンロード）
- ✅ **直近の改良:** 抽出が「のっぺりした一塊テキスト」になっていた問題を修正。
  `parsed.textContent`（構造喪失）→ `parsed.content`（整形済みHTML）に変更し、
  `wrapWords()` で見出し(h1/h2/h3)・段落(p)・リストを残したまま単語だけ `<span class="w">` で包むようにした。

---

## 5. 既知の罠（ハマりどころ）

- **GAS POST の CORS**: `text/plain` 送信で回避済み。`application/json` に戻すとプリフライトで落ちる。
- **`file://` 直開き**: 環境によっては取り込み時にCORSで弾かれる。その場合は VS Code の **Live Server** で開く。
- **`/selkouutiset` トップURL**: 「今週の記事」を返すだけ。個別記事は `/a/…` を使う。
- **localStorage は端末ローカル**: 別端末と同期しない。
- **GAS初回は認可が必要**（UrlFetchApp + Script Properties のため）。
- **proxy のモデル**: 現在 `claude-sonnet-4-20250514`。コスト下げたいなら Haiku 系に差し替え可（原形化の精度を見て判断）。

---

## 6. 次にやりたいこと（TODO / 優先度つき）

1. **（中）文脈をより正確に**: 今は段落テキストを `sentence` として渡している。語を含む「文」単位に絞ると解析精度が上がる可能性。
2. **（中）復習モード**: 単語帳からクイズ（穴埋め/原形当て）。間隔反復（SRS）の簡易版。
3. **（大）単語帳のクラウド同期**: localStorage → **Supabase** に載せ替え（ユーザーは別アプリ memo-app で Supabase 利用経験あり）。端末間同期＋履歴。
4. **（小）コスト最適化**: Haiku 切替、同一語のキャッシュ（同じ原形は再問い合わせしない）。
5. **（小）読了履歴 / お気に入り記事**。
6. **（中・ユーザー要望）画像ヘルパー機能** … わからない問題の写真をアップ→やさしく解説。→ **詳細仕様は §9**。

---

## 7. ユーザー前提（コミュニケーション）

- 日本語でやり取り。**文法用語は初心者にわかる言葉に噛み砕く**方針（plain フィールドの思想）。
- 技術背景: GAS / Python / 各種AI API 経験あり。Windows / PowerShell 環境。GitHub Pages + GAS デプロイ経験あり。VS Code 使用。
- たとえ話・具体例を交えた説明を好む。あやふやな情報は断定せず確認する。

---

## 8. すぐ動かす手順（おさらい）

1. `lukija-pro.html` を保存してブラウザで開く（or Live Server）。
2. `https://yle.fi/a/…` の記事URLを貼って「取り込む」。
3. 単語をクリック → 解析が出る。
4. proxy を直したら GAS は**再デプロイ**（新しいバージョン）。フロントだけの修正は再デプロイ不要、ブラウザ再読み込みのみ。

---

## 9. 追加仕様: 画像ヘルパー機能（実装ガイド）

### 目的
学習者が「問題を間違えた / 自分では理解できない」とき、その**問題やプリントの写真をアップ**すると、やさしい日本語で解説する“家庭教師”モード。リーディング機能と同じ proxy を再利用する。

### UX
- リーディングとは別の「ヘルパー」タブ or パネル。
- 画像を選択（`<input type="file" accept="image/*" capture="environment">` でスマホ撮影も可）。任意で質問テキスト欄（「ここがなぜ間違いかわからない」等）。
- 「解説して」→ ローディング → 解説を表示（Markdown整形でよい）。
- 任意で履歴を localStorage に残す。

### フロント側の処理
1. ファイルを `FileReader.readAsDataURL` で読む。
2. **canvas で長辺1600px程度に縮小し、`toDataURL("image/jpeg", 0.85)` で再エンコード**（サイズ削減＋HEIC/PNG→JPEG統一）。
3. dataURL から prefix を除いた base64 と `media_type`（"image/jpeg"）を取り出す。
4. proxy に POST（既存と同じく `Content-Type: text/plain` でプリフライト回避）:
```json
{ "mode": "image", "mediaType": "image/jpeg", "image": "<base64・prefixなし>", "question": "<任意の質問テキスト>" }
```

### proxy 側（`lukija-proxy.gs` の doPost を分岐）— ★コスト分担: 画像は Gemini
**方針: `mode:"word"`（頻繁）= Claude のまま / `mode:"image"`（たまに）= Gemini（無料枠が広く画像が得意）。**
- スクリプトプロパティに **`GEMINI_KEY`** を追加（Google AI Studio = aistudio.google.com で取得。Vertex AI とは別物なので注意）。
- `body.mode === "image"` のとき、Gemini の generateContent に投げる:
```javascript
// model: 無料枠の 'gemini-2.5-flash'（精度寄り）または 'gemini-2.5-flash-lite'（高RPM・最安）
var gkey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + gkey;
var res = UrlFetchApp.fetch(url, {
  method: 'post',
  contentType: 'application/json',
  muteHttpExceptions: true,
  payload: JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: body.mediaType, data: body.image } }, // base64・prefixなし
        { text: IMAGE_PROMPT + (body.question ? ('\n\n生徒の質問: ' + body.question) : '') }
      ]
    }]
  })
});
var g = JSON.parse(res.getContentText());
var text = g.candidates[0].content.parts.map(function(p){ return p.text || ''; }).join('');
return _text(text); // 解説テキストをそのまま返す（JSONではない）
```
- 既存の単語解析（`mode` 無し or `mode === "word"`）は **Claude のまま据え置き**（**§3のJSON契約は壊さない**）。
- 画像モードの戻り値は **テキスト解説**。フロントはそのまま表示。
- 429（レート超過）は無料枠で起こり得る → フロントで「少し待って再試行」を出すか指数バックオフ。

### IMAGE_PROMPT（例・調整可）
```
あなたはフィンランド語の先生です。生徒は日本語話者の初心者です。
添付画像はフィンランド語の問題・練習・教材です。専門用語を避け、やさしい日本語で説明してください。
できれば次の順で: ①何を問うているか ②答え ③なぜそうなるか（理由）④覚え方のヒント。
画像が問題でない場合は、写っているフィンランド語を読み解いて説明してください。
```

### 罠
- **画像は必ず縮小してから送る**（スマホ原寸はGAS経由で重い/失敗の原因。canvasで長辺1600px＋JPEG化）。
- **mime_type を実データに一致**させる（canvasでJPEG化すれば常に image/jpeg で固定でき安全）。
- **無料枠はデータがGoogleの学習に使われ得る**。個人的なプリント等を扱うなら、課金枠（billing有効化）にすれば学習対象外。最安は gemini-2.5-flash-lite。
- 無料枠レート制限（2026年時点・変動あり）: 2.5 Flash ≒ 10 RPM/250 RPD、Flash-Lite ≒ 15 RPM/1,000 RPD。**実装前に公式で最新値を確認**。
- Gemini 2.0 Flash は廃止済み。新規は 2.5 系を使う。
- これで「画像=Gemini無料、単語=Claude」のハイブリッド。キーは `ANTHROPIC_KEY` と `GEMINI_KEY` の2本をスクリプトプロパティに置く。
