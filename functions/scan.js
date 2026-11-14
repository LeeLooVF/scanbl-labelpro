// functions/scan.js
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Clé GEMINI_API_KEY non configurée sur Cloudflare" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { imageBase64, mimeType } = await request.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Aucune image reçue" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Nettoyage du préfixe data:image/...;base64, si présent
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const today = new Date().toISOString().split("T")[0];

    const prompt = `Tu es un assistant logistique grande distribution. Analyse cette photo de bon de livraison (BL).
Extrais chaque ligne de produit livré et renvoie UNIQUEMENT un objet JSON strict respectant ce format :
{
  "blNumber": "Numéro du BL détecté (ex: BL-84920)",
  "receivedDate": "Date de réception au format YYYY-MM-DD (par défaut ${today})",
  "items": [
    {
      "name": "Désignation claire et concise du produit + format",
      "dlc": "Date DLC ou DLUO au format YYYY-MM-DD (si absente sur le BL, estime une date ou mets ${today})",
      "lot": "Numéro de lot (ex: LOT-XXXX)",
      "barcode": "Code EAN ou code article (chiffres uniquement)",
      "qty": 1
    }
  ]
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType || "image/jpeg",
                data: cleanBase64
              }
            }
          ]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error?.message || "Erreur API Gemini");
    }

    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(rawText);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
