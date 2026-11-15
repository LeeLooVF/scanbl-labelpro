// functions/state.js
const DEFAULT_STATE = {
  verifyItems: [],
  historyItems: [],
  sortieIds: [],
  kitchenProducts: [],
  kitchenCart: {},
  scannedBLHistory: [],
  orderHistory: [],
  shortDateDays: 7,
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
    const parsed = raw ? JSON.parse(raw) : {};
    const state = {
      verifyItems: Array.isArray(parsed.verifyItems) ? parsed.verifyItems : [],
      historyItems: Array.isArray(parsed.historyItems) ? parsed.historyItems : [],
      sortieIds: Array.isArray(parsed.sortieIds) ? parsed.sortieIds : [],
      kitchenProducts: Array.isArray(parsed.kitchenProducts) ? parsed.kitchenProducts : [],
      kitchenCart: (parsed.kitchenCart && typeof parsed.kitchenCart === "object") ? parsed.kitchenCart : {},
      scannedBLHistory: Array.isArray(parsed.scannedBLHistory) ? parsed.scannedBLHistory : [],
      orderHistory: Array.isArray(parsed.orderHistory) ? parsed.orderHistory : [],
      shortDateDays: Number(parsed.shortDateDays) > 0 ? Number(parsed.shortDateDays) : 7,
      updatedAt: parsed.updatedAt || new Date().toISOString()
    };

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
    const rawOld = await env.SCANBL_KV.get("TEAM_STATE");
    const oldState = rawOld ? JSON.parse(rawOld) : DEFAULT_STATE;

    const newState = {
      verifyItems: Array.isArray(body.verifyItems) ? body.verifyItems : (oldState.verifyItems || []),
      historyItems: Array.isArray(body.historyItems) ? body.historyItems : (oldState.historyItems || []),
      sortieIds: Array.isArray(body.sortieIds) ? body.sortieIds : (oldState.sortieIds || []),
      kitchenProducts: Array.isArray(body.kitchenProducts) ? body.kitchenProducts : (oldState.kitchenProducts || []),
      kitchenCart: (body.kitchenCart && typeof body.kitchenCart === "object") ? body.kitchenCart : (oldState.kitchenCart || {}),
      scannedBLHistory: Array.isArray(body.scannedBLHistory) ? body.scannedBLHistory : (oldState.scannedBLHistory || []),
      orderHistory: Array.isArray(body.orderHistory) ? body.orderHistory : (oldState.orderHistory || []),
      shortDateDays: Number(body.shortDateDays) > 0 ? Number(body.shortDateDays) : (Number(oldState.shortDateDays) || 7),
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
