// worker.js — Impackta Dashboard Worker
// Maneja tres rutas:
//   GET  /             → sirve index.html (asset estático)
//   GET  /api/sheet    → proxy del Google Sheet (sin CORS)
//   GET  /api/bajas    → lee bajas desde KV
//   POST /api/bajas    → escribe bajas en KV

const SHEET_ID   = "10DG3sr989bQS7l59rgV7QbuFWZldbDIdFMpOOUvGLiU";
const SHEET_NAME = "2026";
const SHEET_GID  = "103618376";  // gid de la pestana 2026 (export incluye filas ocultas; gviz no)
const KV_KEY     = "lista";
const KV_KEY_NUEVOS = "nuevos";

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}

async function readBajas(env) {
  if (!env.BAJAS_KV) return [];
  try {
    const raw = await env.BAJAS_KV.get(KV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function readNuevos(env) {
  if (!env.BAJAS_KV) return [];
  try {
    const raw = await env.BAJAS_KV.get(KV_KEY_NUEVOS);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // ── /api/sheet ─────────────────────────────────────────────────────────
    if (path === "/api/sheet") {
      const src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
      try {
        const res = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!res.ok) return new Response("error origen: " + res.status, { status: 502 });
        const csv = (await res.text()).replace(/^﻿/, "");
        return new Response(csv, {
          headers: { "content-type": "text/csv; charset=utf-8", "cache-control": "no-store" },
        });
      } catch (e) {
        return new Response("fetch error: " + e.message, { status: 502 });
      }
    }

    // ── /api/bajas GET ──────────────────────────────────────────────────────
    if (path === "/api/bajas" && request.method === "GET") {
      if (!env.BAJAS_KV) return jsonRes({ bajas: [], error: "KV no configurado — sigue el paso 3 de la guía" });
      return jsonRes({ bajas: await readBajas(env) });
    }

    // ── /api/bajas POST ─────────────────────────────────────────────────────
    if (path === "/api/bajas" && request.method === "POST") {
      if (!env.BAJAS_KV) return jsonRes({ bajas: [], error: "KV no configurado" });
      let body;
      try { body = await request.json(); } catch { return jsonRes({ error: "json inválido" }, 400); }
      let list = await readBajas(env);
      if (body.op === "set" && Array.isArray(body.bajas)) {
        list = [...new Set(body.bajas.map(String))];
      } else if (body.op === "toggle" && body.key != null) {
        const k = String(body.key);
        list = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
      } else {
        return jsonRes({ error: "operación no reconocida" }, 400);
      }
      await env.BAJAS_KV.put(KV_KEY, JSON.stringify(list));
      return jsonRes({ bajas: list });
    }


    // ── /api/nuevos GET ─────────────────────────────────────────────────────
    if (path === "/api/nuevos" && request.method === "GET") {
      if (!env.BAJAS_KV) return jsonRes({ nuevos: [], error: "KV no configurado" });
      return jsonRes({ nuevos: await readNuevos(env) });
    }

    // ── /api/nuevos POST ────────────────────────────────────────────────────
    if (path === "/api/nuevos" && request.method === "POST") {
      if (!env.BAJAS_KV) return jsonRes({ nuevos: [], error: "KV no configurado" });
      let body;
      try { body = await request.json(); } catch { return jsonRes({ error: "json inválido" }, 400); }
      let list = await readNuevos(env);
      if (body.op === "set" && Array.isArray(body.nuevos)) {
        list = [...new Set(body.nuevos.map(String))];
      } else if (body.op === "toggle" && body.key != null) {
        const k = String(body.key);
        list = list.includes(k) ? list.filter(x => x !== k) : [...list, k];
      } else {
        return jsonRes({ error: "operación no reconocida" }, 400);
      }
      await env.BAJAS_KV.put(KV_KEY_NUEVOS, JSON.stringify(list));
      return jsonRes({ nuevos: list });
    }

    // ── Todo lo demás → assets estáticos (index.html) ──────────────────────
    return env.ASSETS.fetch(request);
  },
};
