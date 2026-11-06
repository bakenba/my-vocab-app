export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ' });
  }

  try {
    const apiKey = (process.env.VITE_GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(400).json({ error: "APIキーが設定されていません" });
    }

    const prompt = req.body.prompt;
    
    // あなたのオリジナルコードにあった「使えるAIを順番に探す」優れた機能を復活
    const modelsToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-pro",
      "gemini-1.0-pro"
    ];

    let lastErrorMsg = "利用可能なモデルが見つかりませんでした";

    for (const model of modelsToTry) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });

        const data = await response.json();

        // 成功した場合は、即座に結果を返してループを終了
        if (response.ok) {
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return res.status(200).json({ text: text });
          }
        } else {
          // 404などのエラーが出た場合は理由を記録し、止まらずに次のAIモデルを試す
          lastErrorMsg = data.error?.message || response.statusText;
          console.log(`[スキップ] ${model}: ${lastErrorMsg}`);
        }
      } catch (err) {
        lastErrorMsg = err.message;
      }
    }

    // 用意した全てのAIモデルが使えなかった場合のみエラーを返す
    return res.status(404).json({ error: `全てのAIモデルが利用不可でした。最終エラー: ${lastErrorMsg}` });

  } catch (error) {
    res.status(500).json({ error: `【サーバー内部エラー】 ${error.message}` });
  }
}
