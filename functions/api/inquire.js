// Cloudflare Pages Function  →  POST /api/inquire
// Secure proxy to Claude + per-IP rate limiting.
//
// SETUP (one time, in Cloudflare dashboard → your Pages project):
//  1. Settings → Environment variables → add  ANTHROPIC_API_KEY  (Encrypt it).
//  2. Settings → Functions → KV namespace bindings → add binding:
//        Variable name:  RATE_LIMIT
//        KV namespace:   create one called "sahaj-rate" and select it
//     (If you skip the KV binding the API still works; it just won't rate-limit.)
//
// Limits below: 8 requests per IP per hour, 200 per day. Tune as you like.

const PER_HOUR = 8;
const PER_DAY = 200;

const SYS = `You are the analysis engine of a self-inquiry operating system rooted in Advaita Vedanta, neuroscience, Buddhism, Stoicism, IFS, and the songs of Kabir. A user gives one real situation. Analyze it through nine layers, concrete to THEIR situation, warm and non-preachy. Return ONLY valid JSON, no markdown:
{
 "restate":"the trigger in one neutral sentence",
 "egoPattern":"2-4 word name",
 "egoHurt":"which part felt threatened, 1 sentence",
 "neuro":"what the brain is doing, 2 sentences, end on: this is a survival mechanism, not truth",
 "vedantaWho":"answer to who is disturbed, name the role, 1 sentence",
 "vedantaTruth":"the role is disturbed, awareness is not, 1 sentence",
 "beliefs":["rule 1","rule 2","rule 3"],
 "conditioningSources":["2-4 sources"],
 "lenses":{"Advaita":"1 line","Stoicism":"1 line","Buddhism":"1 line","IFS":"1 line"},
 "reactionPct":number 0-100,
 "egoAction":"1 short line","conditionedAction":"1 short line","consciousAction":"1-2 short lines",
 "reflection":"one question to sit with tonight",
 "closing":"one line in Kabir's spirit"
}`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS });

// Returns { ok, retryAfterMin } and increments counters. No-ops if KV not bound.
async function checkRate(env, ip) {
  if (!env.RATE_LIMIT) return { ok: true };
  const now = new Date();
  const hourKey = `h:${ip}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
  const dayKey  = `d:${ip}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;

  const [hRaw, dRaw] = await Promise.all([env.RATE_LIMIT.get(hourKey), env.RATE_LIMIT.get(dayKey)]);
  const h = parseInt(hRaw || "0", 10);
  const d = parseInt(dRaw || "0", 10);

  if (h >= PER_HOUR) return { ok: false, retryAfterMin: 60 - now.getUTCMinutes(), scope: "hour" };
  if (d >= PER_DAY)  return { ok: false, retryAfterMin: 60 * (24 - now.getUTCHours()), scope: "day" };

  await Promise.all([
    env.RATE_LIMIT.put(hourKey, String(h + 1), { expirationTtl: 3600 }),
    env.RATE_LIMIT.put(dayKey,  String(d + 1), { expirationTtl: 86400 }),
  ]);
  return { ok: true };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: "Server not configured. Add ANTHROPIC_API_KEY in Pages settings." }, 500);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rate = await checkRate(env, ip);
    if (!rate.ok) {
      return json({
        error: `You've reached the ${rate.scope === "day" ? "daily" : "hourly"} limit for this free tool. Please come back in about ${rate.retryAfterMin} minute(s).`,
        rateLimited: true,
      }, 429);
    }

    const { situation } = await request.json();
    if (!situation || situation.trim().length < 15) {
      return json({ error: "Please describe the situation a little more." }, 400);
    }
    if (situation.length > 4000) {
      return json({ error: "That's a lot to hold at once. Try a shorter description of the moment." }, 400);
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1400,
        system: SYS,
        messages: [{ role: "user", content: `Situation: "${situation.trim()}"` }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return json({ error: "Upstream error from the model.", detail }, 502);
    }

    const data = await r.json();
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json\n?|```/g, "").trim()); }
    catch (e) { return json({ error: "Could not parse the analysis. Please try again." }, 502); }

    return json(parsed, 200);
  } catch (e) {
    return json({ error: "Unexpected error.", detail: String(e) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
