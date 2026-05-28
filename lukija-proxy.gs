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
    + '"grammar":"文法用語での正確な説明（中級者向け・簡潔に）"}';

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
