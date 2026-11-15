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

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const today = new Date().toISOString().split("T")[0];

    const prompt = `Tu es un assistant logistique professionnel. Analyse cette photo de bon de livraison (BL).
Extrais chaque ligne de produit livré et renvoie UNIQUEMENT un objet JSON strict respectant ce format :
{
  "blNumber": "Numéro du BL détecté (ex: BL-84920)",
  "receivedDate": "Date de réception au format YYYY-MM-DD (par défaut ${today})",
  "items": [
    {
      "name": "Désignation claire et concise du produit",
      "unit": "Conditionnement détecté (ex: Colis 5kg, Carton x12, Bac 2.5kg, Unité, Fardeau x6)",
      "category": "Catégorie (Viandes & Poissons, Fruits & Légumes, Crèmerie & Frais, Épicerie & Sec, Boissons, ou Hygiène & Emballage)",
      "dlc": "Date DLC ou DLUO au format YYYY-MM-DD (si absente sur le BL, mets ${today})",
      "lot": "Numéro de lot (ex: LOT-XXXX)",
      "barcode": "Code EAN ou code article (chiffres uniquement)",
      "qty": 1
    }
  ]
}`;

    // Ordre de priorité des modèles avec gemini-3.0-flash en premier
    const modelsToTry = [
      "gemini-3.0-flash",
      "gemini-3.0-flash-preview",
      "gemini-2.5-flash-preview-09-2025",
      "gemini-2.0-flash"
    ];

    let lastError = "Erreur API Gemini";
    let resultData = null;

    for (const modelName of modelsToTry) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;

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

      if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
        const rawText = result.candidates[0].content.parts[0].text;
        resultData = JSON.parse(rawText);
        resultData.modelUsed = modelName;
        break;
      } else {
        lastError = result.error?.message || `Modèle ${modelName} indisponible`;
      }
    }

    if (!resultData) {
      throw new Error(lastError);
    }

    return new Response(JSON.stringify(resultData), {
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
