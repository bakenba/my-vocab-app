export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ許可されています' });
  }

  try {
    // VercelからAPIキーを取得
    const apiKey = (process.env.VITE_GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(400).json({ error: "【原因】Vercelの環境変数にAPIキーが反映されていません。Redeployが必要です。" });
    }

    const prompt = req.body.prompt;
    
    // Googleへ直接通信（最もエラーが起きにくい方式）
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    // Googleから拒否された場合、その「本当の理由」をフロントに返す
    if (!response.ok) {
      const errorMsg = data.error?.message || response.statusText || "不明なエラー";
      return res.status(response.status).json({ error: `【Googleからの拒否理由】 ${errorMsg}` });
    }

    // 成功時
    const text = data.candidates[0].content.parts[0].text;
    res.status(200).json({ text: text });
    
  } catch (error) {
    res.status(500).json({ error: `【サーバー内部エラー】 ${error.message}` });
  }
}
