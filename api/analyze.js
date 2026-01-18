export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { imageBase64, myDiet, lang } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "VercelのSettingsでGEMINI_API_KEYを設定してください。" });
  }

  // AIへの指示をより厳格に
  const prompt = `Task: Analyze food label for "${myDiet}". Language: "${lang}".
    Return ONLY a JSON object with: 
    {"status": "safe|warning|critical|unsure|info", "product_name": "string", "suitability_note": "explanation", "translated_ingredients": "string", "matches": ["item1"]}`;

  try {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("AI response is empty");

    let text = data.candidates[0].content.parts[0].text;

    // JSONの{}部分だけを抽出する正規表現（解析エラー防止）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response as JSON");

    res.status(200).json(JSON.parse(jsonMatch[0]));

  } catch (error) {
    console.error("Server Error:", error.message);
    res.status(500).json({ error: "解析に失敗しました", detail: error.message });
  }
}