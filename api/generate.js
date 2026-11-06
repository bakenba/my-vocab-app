export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ' });
  }

  try {
    // VercelからAPIキーを取得し、念のため前後の見えない空白を除去する
    const apiKey = (process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
    
    if (!apiKey) {
      return res.status(500).json({ error: "VercelにAPIキーが設定されていません" });
    }

    // 外部ライブラリを一切使わず、標準機能(fetch)で直接Googleへ通信する
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: req.body.prompt }] }]
      })
    });

    const data = await response.json();

    // Googleからエラー（権限不足や無効なキーなど）が返ってきた場合
    if (!response.ok) {
      console.error("Google API Error:", data);
      return res.status(500).json({ error: "Google APIエラー" });
    }

    // 成功時、テキストだけを抜き出してアプリ画面へ返す
    const text = data.candidates[0].content.parts[0].text;
    res.status(200).json({ text: text });
    
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: error.message });
  }
}
