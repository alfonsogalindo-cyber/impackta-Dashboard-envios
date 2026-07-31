// worker.js — Impackta Dashboard Worker
// Maneja tres rutas:
//   GET  /             → sirve index.html (asset estático)
//   GET  /api/sheet    → proxy del Google Sheet (sin CORS)
//   GET  /api/bajas    → lee bajas desde KV
//   POST /api/bajas    → escribe bajas en KV

const SHEET_ID   = "10DG3sr989bQS7l59rgV7QbuFWZldbDIdFMpOOUvGLiU";
const SHEET_NAME = "2026";
const SHEET_GID  = "103618376";
const FESTIVOS_2026 = [
  {fecha:"2026-01-01",nombre:"Any Nou",ambito:"ES"},
  {fecha:"2026-01-06",nombre:"Reis",ambito:"ES"},
  {fecha:"2026-04-03",nombre:"Divendres Sant",ambito:"ES"},
  {fecha:"2026-04-06",nombre:"Dilluns de Pasqua",ambito:"CAT"},
  {fecha:"2026-05-01",nombre:"Festa del Treball",ambito:"ES"},
  {fecha:"2026-06-24",nombre:"Sant Joan",ambito:"CAT"},
  {fecha:"2026-08-15",nombre:"L Assumpcio",ambito:"ES"},
  {fecha:"2026-09-11",nombre:"Diada de Catalunya",ambito:"CAT"},
  {fecha:"2026-10-12",nombre:"Festa Nacional",ambito:"ES"},
  {fecha:"2026-11-01",nombre:"Tots Sants",ambito:"ES"},
  {fecha:"2026-12-06",nombre:"Dia de la Constitucio",ambito:"ES"},
  {fecha:"2026-12-08",nombre:"La Immaculada",ambito:"ES"},
  {fecha:"2026-12-25",nombre:"Nadal",ambito:"ES"},
  {fecha:"2026-12-26",nombre:"Sant Esteve",ambito:"CAT"},
];  // gid de la pestana 2026 (export incluye filas ocultas; gviz no)
const KV_KEY     = "lista";
const KV_KEY_NUEVOS = "nuevos";
const KV_KEY_GRUPOS = "grupos";

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

async function readGrupos(env) {
  if (!env.BAJAS_KV) return [];
  try {
    const raw = await env.BAJAS_KV.get(KV_KEY_GRUPOS);
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

    // --- /api/grupos GET ---
    if (path === "/api/grupos" && request.method === "GET") {
      if (!env.BAJAS_KV) return jsonRes({ grupos: [], error: "KV no configurado" });
      return jsonRes({ grupos: await readGrupos(env) });
    }

    // --- /api/grupos POST ---
    if (path === "/api/grupos" && request.method === "POST") {
      if (!env.BAJAS_KV) return jsonRes({ grupos: [], error: "KV no configurado" });
      let body;
      try { body = await request.json(); } catch { return jsonRes({ error: "json invalido" }, 400); }
      if (body.op !== "set" || !Array.isArray(body.grupos)) return jsonRes({ error: "operacion no reconocida" }, 400);
      const list = body.grupos
        .filter(g => g && typeof g.nombre === "string" && Array.isArray(g.miembros))
        .map(g => ({ nombre: g.nombre, miembros: [...new Set(g.miembros.map(String))] }));
      await env.BAJAS_KV.put(KV_KEY_GRUPOS, JSON.stringify(list));
      return jsonRes({ grupos: list });
    }

    // ── Todo lo demás → assets estáticos (index.html) ──────────────────────
    if (path === "/api/festivos" && request.method === "GET") {
      return jsonRes({ festivos: FESTIVOS_2026 });
    }
    if (path === "/api/ask" && request.method === "POST") {
      if (!env.AI) return jsonRes({ error: "IA no disponible en la cuenta (falta binding AI)" }, 500);
      let body;
      try { body = await request.json(); } catch { return jsonRes({ error: "json invalido" }, 400); }
      const pregunta = String(body.question || "").slice(0, 600);
      const contexto = String(body.context || "").slice(0, 14000);
      if (!pregunta) return jsonRes({ error: "sin pregunta" }, 400);
      const NL = String.fromCharCode(10);
      const system = "Eres el analista del panel comercial de Impackta, agencia oficial GLS. Respondes SIEMPRE en espanol, con tono profesional y claro para gerencia: ve al grano y explica lo importante, sin rollos ni tecnicismos. USA UNICAMENTE los datos del CONTEXTO. Si un dato no esta en el contexto, dilo claramente y NO lo inventes. Nunca inventes clientes ni cifras: usa los numeros tal cual aparecen. Se conciso pero completo. IMPORTANTE sobre los COMERCIALES: los nombres Judith, Noelia, Susana e Interno son los comerciales de Impackta (vendedores internos) propietarios de cada cuenta; NO son personas de contacto del cliente ni se les llama a ellos. Cuando recomiendes contactar o llamar a un cliente en riesgo, quien debe actuar es el COMERCIAL RESPONSABLE de esa cuenta (ej: Judith deberia llamar al cliente X). Nunca digas contactar a Judith o contactar a Noelia como si fueran el cliente.";
      const user = "CONTEXTO (datos reales del panel, ahora mismo):" + NL + contexto + NL + NL + "PREGUNTA: " + pregunta;
      const msgs = [ { role: "system", content: system }, { role: "user", content: user } ];
      const modelos = [
        "@cf/meta/llama-4-scout-17b-16e-instruct",
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "@cf/meta/llama-3.2-3b-instruct",
        "@cf/meta/llama-3.2-1b-instruct",
        "@cf/meta/llama-3.1-70b-instruct",
        "@cf/meta/llama-3.1-8b-instruct-fp8",
        "@cf/meta/llama-3-8b-instruct",
        "@cf/mistral/mistral-7b-instruct-v0.1"
      ];
      const diag = [];
      for (const m of modelos) {
        try {
          const ai = await env.AI.run(m, { messages: msgs, max_tokens: 600 });
          const answer = (ai && (ai.response || ai.result)) ? String(ai.response || ai.result).trim() : "";
          if (answer) { return jsonRes({ answer: answer, modelo: m }); }
          diag.push({ modelo: m, estado: "respuesta vacia" });
        } catch (e) { diag.push({ modelo: m, error: (e && e.message) ? e.message : String(e) }); }
      }
      return jsonRes({ error: "ningun modelo respondio", diag: diag }, 502);
    }

    if (path === "/api/sync-hubspot" && request.method === "POST") {
      try {
        if (!env.HUBSPOT_TOKEN) return jsonRes({ error: "HUBSPOT_TOKEN no configurado en el Worker (Settings > Variables and Secrets)" }, 500);
        let body;
        try { body = await request.json(); } catch { return jsonRes({ error: "json invalido" }, 400); }
        const clients = Array.isArray(body.clients) ? body.clients : [];
        if (!clients.length) return jsonRes({ error: "sin clientes en la peticion" }, 400);

        const hsHeaders = { Authorization: "Bearer " + env.HUBSPOT_TOKEN, "Content-Type": "application/json" };
        const now = new Date();
        const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

        const updatedIds = [];
        const notFound = [];
        const errors = [];
        const CHUNK = 90;

        for (let i = 0; i < clients.length; i += CHUNK) {
          const chunk = clients.slice(i, i + CHUNK);
          const codes = Array.from(new Set(chunk.map((c) => String(c.codigo))));
          let idByCode = {};
          try {
            const searchRes = await fetch("https://api.hubapi.com/crm/v3/objects/companies/search", {
              method: "POST",
              headers: hsHeaders,
              body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: "codigo_de_cliente", operator: "IN", values: codes }] }],
                properties: ["codigo_de_cliente", "name"],
                limit: 100,
              }),
            });
            const searchJson = await searchRes.json();
            if (!searchRes.ok) throw new Error(searchJson.message || "HubSpot search error " + searchRes.status);
            (searchJson.results || []).forEach((r) => {
              if (r.properties && r.properties.codigo_de_cliente) idByCode[String(r.properties.codigo_de_cliente)] = r.id;
            });
          } catch (e) {
            errors.push("busqueda: " + (e && e.message ? e.message : String(e)));
            continue;
          }

          const inputs = [];
          for (const c of chunk) {
            const hsId = idByCode[String(c.codigo)];
            if (!hsId) {
              notFound.push({ codigo: c.codigo, nombre: c.nombre });
              continue;
            }
            const props = Object.assign({}, c.properties, { gls_ultima_sincronizacion: String(todayMs) });
            inputs.push({ id: hsId, properties: props });
          }
          if (!inputs.length) continue;
          try {
            const updRes = await fetch("https://api.hubapi.com/crm/v3/objects/companies/batch/update", {
              method: "POST",
              headers: hsHeaders,
              body: JSON.stringify({ inputs }),
            });
            const updJson = await updRes.json();
            if (!updRes.ok) throw new Error(updJson.message || "HubSpot batch update error " + updRes.status);
            (updJson.results || []).forEach((r) => updatedIds.push(r.id));
          } catch (e) {
            errors.push("actualizacion: " + (e && e.message ? e.message : String(e)));
          }
        }

        return jsonRes({ updated: updatedIds.length, notFound: notFound, errors: errors });
      } catch (fatal) {
        return jsonRes({ fatalError: (fatal && fatal.message) ? fatal.message : String(fatal), stack: (fatal && fatal.stack) ? String(fatal.stack).slice(0, 500) : "" }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
