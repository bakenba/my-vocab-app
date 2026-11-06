import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  // 正しいお願いのしかた（POST）以外は弾く
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POSTメソッドのみ許可されています' });
  }

  try {
    // Vercelに設定したAPIキーを読み込む
    const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("APIキーが設定されていません");
    }

    // Google AIの準備
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // アプリ画面から送られてきたプロンプトを受け取る
    const prompt = req.body.prompt;
    
    // AIに依頼して結果をもらう
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // 結果をアプリ画面に返す
    res.status(200).json({ text: text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: error.message });
  }
}
