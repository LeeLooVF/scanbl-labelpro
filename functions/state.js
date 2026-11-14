// functions/state.js
const DEFAULT_STATE = {
  verifyItems: [],
  historyItems: [],
  sortieIds: [],
  updatedAt: new Date().toISOString()
};

export async function onRequestGet(context) {
  const { env } = context;
  try {
    if (!env.SCANBL_KV) {
      return new Response(JSON.stringify({ error: "Binding SCANBL_KV manquant dans Cloudflare" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const raw = await env.SCANBL_KV.get("TEAM_STATE");
    const state = raw ? JSON.parse(raw) : DEFAULT_STATE;

    return new Response(JSON.stringify(state), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    if (!env.SCANBL_KV) {
      return new Response(JSON.stringify({ error: "Binding SCANBL_KV manquant" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    const newState = {
      verifyItems: Array.isArray(body.verifyItems) ? body.verifyItems : [],
      historyItems: Array.isArray(body.historyItems) ? body.historyItems : [],
      sortieIds: Array.isArray(body.sortieIds) ? body.sortieIds : [],
      updatedAt: new Date().toISOString(),
      updatedBy: body.terminalId || "TERMINAL"
    };

    await env.SCANBL_KV.put("TEAM_STATE", JSON.stringify(newState));

    return new Response(JSON.stringify({ ok: true, state: newState }), {
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
