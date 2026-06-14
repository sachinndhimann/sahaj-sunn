// Cloudflare Pages Function  →  POST /api/inquire
// Secure Claude proxy + per-IP rate limiting via Cloudflare KV.
//
// ONE-TIME SETUP in Cloudflare Pages → your project:
//   1. Settings → Environment variables → ANTHROPIC_API_KEY (mark as Secret)
//   2. Settings → Functions → KV namespace bindings:
//        Variable name: RATE_LIMIT   Namespace: create "sahaj-rate", paste ID
//      (Skip step 2 to run without rate limiting — the function still works.)

const PER_HOUR = 8;
const PER_DAY  = 200;

// Simplified, honest prompt — three outputs only, no clinical claims
const SYS = `You are a reflection companion drawing on Advaita Vedanta and the songs of Kabir.
A person shares a difficult situation. Your role is to offer one gentle reframe, one self-inquiry question, and map the situation to a Kabir verse theme.

Return ONLY valid JSON, no markdown, no extra text:
{
  "restate": "The situation in one neutral sentence (do not add interpretation, just restate plainly)",
  "reframe": "One way to see this moment differently. Draw from Vedanta or cognitive reappraisal. Be gentle, not preachy. 2 sentences. Start with 'One way to see this...' or 'What may be happening here...' or similar. Never claim certainty about what is happening in the person's brain or psyche.",
  "question": "One self-inquiry question to sit with. Inspired by Ramana Maharshi's inquiry method. Examples: 'Who is the one feeling this?' or 'What exactly is being defended here?' or 'Can you find where this feeling lives, right now?' Make it specific to their situation, not generic.",
  "kabir_key": "The ego pattern this most resembles. Choose ONE: pride | recognition | loss | identity | fear | control | surrender | default",
  "note": "One closing line in Kabir's spirit. Brief. Not motivational. Not preachy. Something that points at the truth without naming it."
}

Important constraints:
- Never claim to know what is happening neurologically or clinically.
- Never assign IFS parts, polyvagal states, or psychological diagnoses.
- Never produce percentage scores or quantified claims.
- Use language like 'may be', 'one possibility', 'you might notice' — not 'this is', 'your brain is doing'.
- If the situation involves genuine crisis, self-harm, or acute distress, set reframe to: "This sounds like a moment that deserves more than a reflection tool. Please speak with someone you trust or a professional." and question to: "What would it mean to reach out to someone right now?"`;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {status, headers: CORS});

async function checkRate(env, ip) {
  if (!env.RATE_LIMIT) return {ok: true};
  const now  = new Date();
  const hKey = `h:${ip}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
  const dKey = `d:${ip}:${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
  const [hRaw, dRaw] = await Promise.all([env.RATE_LIMIT.get(hKey), env.RATE_LIMIT.get(dKey)]);
  const h = parseInt(hRaw || "0", 10);
  const d = parseInt(dRaw || "0", 10);
  if (h >= PER_HOUR) return {ok:false, mins: 60 - now.getUTCMinutes(), scope:"hour"};
  if (d >= PER_DAY)  return {ok:false, mins: 60 * (24 - now.getUTCHours()), scope:"day"};
  await Promise.all([
    env.RATE_LIMIT.put(hKey, String(h + 1), {expirationTtl: 3600}),
    env.RATE_LIMIT.put(dKey, String(d + 1), {expirationTtl: 86400}),
  ]);
  return {ok: true};
}

export async function onRequestPost({request, env}) {
  try {
    if (!env.ANTHROPIC_API_KEY)
      return json({error:"Not configured. Add ANTHROPIC_API_KEY in Pages settings."}, 500);

    const ip   = request.headers.get("CF-Connecting-IP") || "unknown";
    const rate = await checkRate(env, ip);
    if (!rate.ok)
      return json({
        error: `You have reached the ${rate.scope === "day" ? "daily" : "hourly"} limit for this free tool. Come back in about ${rate.mins} minute(s).`,
        rateLimited: true,
      }, 429);

    const {situation} = await request.json();
    if (!situation || situation.trim().length < 20)
      return json({error:"Please describe the situation a little more."}, 400);
    if (situation.length > 2000)
      return json({error:"Please keep it under 2000 characters."}, 400);

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-6",
        max_tokens: 800,
        system:     SYS,
        messages:   [{role:"user", content:`Situation: "${situation.trim()}"`}],
      }),
    });

    if (!r.ok) return json({error:"Something went quiet upstream. Please try again."}, 502);

    const data = await r.json();
    const text = (data.content || [])
      .filter(b => b.type === "text").map(b => b.text).join("");

    let parsed;
    try { parsed = JSON.parse(text.replace(/```json\n?|```/g,"").trim()); }
    catch(e) { return json({error:"Could not parse the reflection. Please try again."}, 502); }

    return json(parsed, 200);
  } catch(e) {
    return json({error:"Unexpected error.", detail: String(e)}, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {headers: {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }});
}
