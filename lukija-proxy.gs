/**
 * lukija 本番用プロキシ (Google Apps Script / Web App)
 * 役割: ① ニュースURLをサーバー側で取得しHTMLを返す（CORS回避）
 *       ② Anthropic API を中継（APIキーをフロントに出さない）
 *
 * 使い方:
 *  1. script.google.com で新規プロジェクト → このコードを貼る
 *  2. プロジェクトの設定 → スクリプト プロパティに ANTHROPIC_KEY を登録
 *  3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *     実行ユーザー: 自分 / アクセス: 全員
 *  4. 発行された /exec URL をフロントの PROXY 定数に設定
 *
 * ※ Madoka が Finnish チューターで作った GAS プロキシと同じ構造です。
 *   そこに「記事fetch」のルートを足しただけ。
 */

// ── コスト防御：合言葉トークン ＆ 1日あたりの呼び出し上限 ──────
// APP_TOKEN はフロント（lukija-pro.html の APP_TOKEN）と一致させること。
// ページソースに載るため完璧な秘匿ではないが、ボット/通りすがりを弾く。
// 万一トークンが漏れても DAILY_LIMIT で最悪コストが頭打ちになる。
var APP_TOKEN = 'lk_VBTFNM9nFGXM7AtVCKSeJ_uq';
var DAILY_LIMIT = 200;  // 1日（日本時間）あたりの有料API呼び出し上限。超えると翌日まで停止。

function _overDailyLimit() {
  var props = PropertiesService.getScriptProperties();
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var key = 'calls_' + today;
  var n = parseInt(props.getProperty(key) || '0', 10) + 1;
  props.setProperty(key, String(n));
  return n > DAILY_LIMIT;
}

var IMAGE_PROMPT = 'あなたはフィンランド語の先生です。生徒は日本語話者の初心者です。\n'
  + '添付画像はフィンランド語の問題・練習・教材です。専門用語を避け、やさしい日本語で説明してください。\n'
  + 'できれば次の順で: ①何を問うているか ②答え ③なぜそうなるか（理由）④覚え方のヒント。\n'
  + '画像が問題でない場合は、写っているフィンランド語を読み解いて説明してください。';

// ── ① 記事HTML取得: GET ?mode=fetch&url=... ───────────────────
function doGet(e) {
  const url = e.parameter.url;
  if (!url) return _text('missing url');
  try {
    const res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (lukija reader)' },
    });
    return _text(res.getContentText()); // 生HTMLを返す（抽出はフロントのReadabilityで）
  } catch (err) {
    return _text('ERROR: ' + err);
  }
}

// ── ② POST 中継: mode:"image" → Gemini / それ以外 → Claude ────
function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');

  // ── コスト防御：トークン認証 ＆ 日次上限（全ての有料モード共通） ──
  if (body.token !== APP_TOKEN) return _text('FORBIDDEN');
  if (_overDailyLimit()) return _text('RATE_LIMIT');

  // ── 画像ヘルパーモード → Gemini ──────────────────────────────
  if (body.mode === 'image') {
    const gkey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
    const gurl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + gkey;
    const gres = UrlFetchApp.fetch(gurl, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: body.mediaType, data: body.image } },
            { text: IMAGE_PROMPT + (body.question ? ('\n\n生徒の質問: ' + body.question) : '') }
          ]
        }]
      })
    });
    if (gres.getResponseCode() === 429) {
      return _text('RATE_LIMIT');
    }
    const g = JSON.parse(gres.getContentText());
    const text = g.candidates[0].content.parts.map(function(p){ return p.text || ''; }).join('');
    return _text(text);
  }

  // ── ライティングテスト：問題生成 → Claude ─────────────────────
  if (body.mode === 'writing' && body.action === 'generate') {
    var wkey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
    var writingPrompt =
      'あなたはフィンランド語教師です。以下の記事を元に、日本語話者の初心者向けライティング問題を生成してください。\n'
      + '以下の3種類を各2問、計6問生成してください:\n'
      + 'A: 穴埋め問題（記事から文を抜粋し、格変化・語尾を___で空欄にする）\n'
      + 'B: 和文フィンランド語訳（記事の内容に関連した日本語短文）\n'
      + 'C: 自由作文テーマ（記事テーマに関する質問。2〜3文で答える想定）\n'
      + 'JSONのみで返してください（前置き・コードフェンス禁止）:\n'
      + '{"questions":[{"type":"A","question":"...","answer":"...","hint":"格の名前などヒント"},{"type":"B","question":"日本語の文","answer":"フィンランド語の模範解答","hint":""},{"type":"C","question":"テーマの質問","answer":"","hint":""},...]}\n\n'
      + '記事:\n' + body.article;

    var wres = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'x-api-key': wkey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: writingPrompt }],
      }),
    });
    var wdata = JSON.parse(wres.getContentText());
    var wtxt = (wdata.content || [])
      .filter(function(b){ return b.type === 'text'; })
      .map(function(b){ return b.text; })
      .join('')
      .replace(/```json|```/g, '')
      .trim();
    return _json(wtxt);
  }

  // ── ライティングテスト：採点 → Claude ───────────────────────
  if (body.mode === 'writing' && body.action === 'grade') {
    var gkey2 = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
    var gradePrompt;
    if (body.type === 'C') {
      gradePrompt =
        'フィンランド語教師として自由作文を添削してください。\n'
        + 'テーマ: "' + body.question + '"\n'
        + '生徒の回答: "' + body.userAnswer + '"\n'
        + 'JSONのみで返してください（前置き・コードフェンス禁止）:\n'
        + '{"score":"A/B/C/D","feedback":"全体コメント（日本語）","corrections":[{"original":"元の表現","corrected":"修正後","reason":"理由（日本語）"}]}';
    } else {
      gradePrompt =
        'フィンランド語教師として採点してください。\n'
        + '問題: "' + body.question + '"\n'
        + '正解: "' + body.answer + '"\n'
        + '生徒の回答: "' + body.userAnswer + '"\n'
        + 'JSONのみで返してください（前置き・コードフェンス禁止）:\n'
        + '{"correct":true,"feedback":"コメント（日本語）","correction":"修正案（不正解の場合のみ）"}';
    }

    var gres2 = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: { 'x-api-key': gkey2, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: gradePrompt }],
      }),
    });
    var gdata2 = JSON.parse(gres2.getContentText());
    var gtxt2 = (gdata2.content || [])
      .filter(function(b){ return b.type === 'text'; })
      .map(function(b){ return b.text; })
      .join('')
      .replace(/```json|```/g, '')
      .trim();
    return _json(gtxt2);
  }

  // ═══════════════════════════════════════════════════════════════
  // 【Gemini移行テスト手順】
  // 現在は Claude Sonnet 4 を使用。以下の手順で Gemini 2.5 Flash（有料）と
  // 品質を比較してから切り替えを判断すること。
  //
  // 1. Google AI Studio (aistudio.google.com) で GEMINI_KEY を取得
  //    → スクリプトプロパティに GEMINI_KEY を追加
  //
  // 2. 以下の URL と payload を差し替えてテストデプロイ:
  //    URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + gkey
  //    payload の構造は画像ヘルパーモードの Gemini 呼び出しを参照
  //
  // 3. 同じ単語・文で Claude と Gemini の出力を比較する:
  //    - perusmuoto（原形化）の正確さ
  //    - grammarEasy の日本語の自然さ
  //    - breakdown の複合語分割の精度
  //
  // 4. 品質に満足したら model 指定を Gemini に切り替えて本番デプロイ
  //
  // コスト比較（変更後フル機能・1クリックあたり）:
  //    Claude Sonnet 4        : 約 0.93円
  //    Claude Haiku 3.5       : 約 0.25円
  //    Gemini 2.5 Flash 有料  : 約 0.14円
  // ═══════════════════════════════════════════════════════════════

  // ── 単語解析モード → Claude（§3 JSON契約を維持） ──────────────
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_KEY');
  const prompt =
    'あなたはフィンランド語の先生です。生徒は文法用語をほとんど知らない初心者です。'
    + '次の語を分析し、JSONのみで返答してください（前置き・コードフェンス禁止）。\n'
    + '対象の語: "' + body.word + '"\n'
    + '出てきた文: "' + body.sentence + '"\n'
    + '形式（すべて日本語。plain は専門用語を避け日常語で短く、必要なら短いたとえ）: '
    + '{"perusmuoto":"辞書形","wordClass":"品詞","contextMeaning":"この文での意味",'
    + '"baseMeaning":"原形の意味",'
    + '"plain":"なぜこの形かを専門用語を使わず初心者向けに1〜2文で",'
    + '"grammar":"文法用語での正確な説明（中級者向け・簡潔に）",'
    + '"grammarEasy":"文法用語の意味をたとえを使って中学生でもわかるように2〜3文で（例: 分格形は「リンゴを少し食べた」のように一部や不完全な動作を表す形です）",'
    + '"breakdown":"複合語なら構成要素をハイフンでつないだ形（例: liikenne-onnettomuus）。複合語でない場合は null"}';

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = JSON.parse(res.getContentText());
  const txt = (data.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('')
    .replace(/```json|```/g, '')
    .trim();
  return _json(txt); // 既にJSON文字列なのでそのまま返す
}

function _text(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT);
}
function _json(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
