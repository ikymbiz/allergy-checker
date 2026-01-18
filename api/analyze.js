export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { imageBase64, myDiet, lang } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) return res.status(500).json({ error: "API Key missing in Vercel settings." });

  // 精度を極限まで高めるための「思考プロセス型」プロンプト
  const prompt = `
    You are a highly accurate Food Label OCR and Allergy Specialist.
    Analyze the image for these dietary restrictions: "${myDiet}".
    Respond in ${lang}.

    ### STEP-BY-STEP ANALYSIS PROCESS:
    1. **OCR TRANSCRIPTION**: Carefully scan the "Ingredients" (原材料名) section. Transcribe EVERY single ingredient word-for-word. Do not skip even the smallest text.
    2. **ALLERGEN CHECK**: Compare each transcribed ingredient against the user's restrictions: "${myDiet}". 
       - Look for hidden sources (e.g., "Albumen" for eggs, "Casein" for dairy, "Dextrose" for corn, etc.)
       - Pay special attention to text in parentheses like "(一部に小麦・乳成分を含む)".
    3. **VERDICT**:
       - "critical": A restricted ingredient is definitely present.
       - "warning": Potential risk, vague terms (e.g., "spices", "natural flavors"), or "may contain" warnings.
       - "info": The image is of the product front; the ingredients list is not visible.
       - "safe": No restricted items found after a thorough scan.

    ### OUTPUT FORMAT (STRICT JSON ONLY):
    {
      "status": "safe|warning|critical|unsure|info",
      "product_name": "Full product name",
      "suitability_note": "A clear, professional explanation of WHY this verdict was reached.",
      "translated_ingredients": "The COMPLETE list of ingredients you transcribed. This must be 100% accurate to what is on the label.",
      "matches": ["The specific problematic ingredients identified"]
    }
  `;

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
        }],
        // 精度向上のための追加パラメータ（モデルの創造性を抑え、事実に集中させる）
        generationConfig: {
          temperature: 0.1,
          topP: 0.1
        }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates[0].content.parts[0].text;
    
    // Markdownタグが含まれていても確実にJSONだけを抜き出す処理
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI failed to return valid JSON format.");

    res.status(200).json(JSON.parse(jsonMatch[0]));
  } catch (error) {
    console.error("Analysis Error:", error.message);
    res.status(500).json({ error: "Analysis failed", detail: error.message });
  }
}
