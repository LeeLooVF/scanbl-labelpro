// functions/scan.js
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Clé GEMINI_API_KEY manquante dans Cloudflare" }), {
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

    // 1. Récupération automatique des modèles réellement actifs pour cette clé API
    let candidateModels = [];
    try {
      const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      const listJson = await listRes.json();
      if (Array.isArray(listJson.models)) {
        const supported = listJson.models
          .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
          .map(m => m.name.replace(/^models\//, ""))
          .filter(name => !name.includes("tts") && !name.includes("image") && !name.includes("embedding") && !name.includes("2.0") && !name.includes("1.5"));

        // Priorité aux modèles gemini-3 et flash
        const flash3 = supported.filter(n => n.includes("3") && n.includes("flash"));
        const pro3 = supported.filter(n => n.includes("3") && n.includes("pro"));
        const otherFlash = supported.filter(n => n.includes("flash") && !flash3.includes(n));
        candidateModels = [...flash3, ...pro3, ...otherFlash, ...supported];
      }
    } catch (e) {
      // Ignorer si ListModels échoue, on utilisera la liste de secours
    }

    // Ajout des identifiants standards en secours (sans jamais appeler 2.0-flash)
    const fallbackModels = [
      "gemini-3-flash-preview",
      "gemini-3.0-flash",
      "gemini-3-flash",
      "gemini-flash-latest",
      "gemini-3-pro-preview"
    ];
    for (const fb of fallbackModels) {
      if (!candidateModels.includes(fb)) candidateModels.push(fb);
    }

    const prompt = `Tu es un assistant logistique professionnel. Analyse cette photo de bon de livraison (BL).
Extrais chaque ligne de produit livré et renvoie UNIQUEMENT un objet JSON pur (sans balises markdown) respectant strictement cette structure :
{
  "blNumber": "Numéro du BL détecté (ex: BL-84920)",
  "receivedDate": "${today}",
  "items": [
    {
      "name": "Désignation claire et concise du produit",
      "unit": "Conditionnement (ex: Kg, Filet 5kg, Carton x6, Motte, Grammes, Colis)",
      "category": "Catégorie parmi: Viandes & Poissons, Fruits & Légumes, Crèmerie & Frais, Épicerie & Sec, Boissons, Hygiène & Emballage",
      "dlc": "Date DLC ou DLUO convertie au format YYYY-MM-DD (ex: 22/11/2026 devient 2026-11-22, si absente mets ${today})",
      "lot": "Numéro de lot (ex: V26-884)",
      "barcode": "Code réf ou EAN",
      "qty": 1
    }
  ]
}`;

    const errors = [];
    let parsedResult = null;

    for (const modelName of candidateModels.slice(0, 6)) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;

      const response = await fetch(url, {
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
            temperature: 0.1
          }
        })
      });

      const result = await response.json();

      if (response.ok && result.candidates?.[0]?.content?.parts?.[0]?.text) {
        let rawText = result.candidates[0].content.parts[0].text.trim();
        // Nettoyage si le modèle entoure le JSON de ```json ... ```
        rawText = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
        parsedResult = JSON.parse(rawText);
        parsedResult.modelUsed = modelName;
        break;
      } else {
        errors.push(`[${modelName}]: ${result.error?.message || response.status}`);
      }
    }

    if (!parsedResult) {
      throw new Error("Détail API : " + errors.join(" | "));
    }

    return new Response(JSON.stringify(parsedResult), {
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
