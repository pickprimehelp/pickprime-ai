const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS }
  });
}

async function cloudflareAI(env, prompt) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error("Cloudflare AI credentials are missing.");
  }

  const models = [
    "@cf/zai-org/glm-4.7-flash",
    "@cf/moonshotai/kimi-k2.6"
  ];

  let lastError = "";
  for (const model of models) {
    const url =
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}` +
      `/ai/run/${encodeURIComponent(model)}`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You are a professional AI video storyboard generator. " +
              "Return ONLY valid JSON. Create short cinematic scenes."
          },
          {
            role: "user",
            content:
              `Create a video plan from this script:\n\n${prompt}\n\n` +
              `Return JSON exactly like: ` +
              `{"title":"...","scenes":[{"scene":1,"duration":5,"narration":"...","visual_prompt":"...","caption":"..."}]}` +
              `. Make 3-8 scenes. Duration should be 3-8 seconds each.`
          }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (r.ok) {
      const data = await r.json();
      const result = data.result ?? data;
      const text =
        result?.response ??
        result?.output_text ??
        result?.choices?.[0]?.message?.content ??
        result?.choices?.[0]?.text;

      if (typeof text === "string") {
        try { return JSON.parse(text); } catch {}
      }
      if (result?.scenes) return result;
      if (result?.response && typeof result.response === "object") return result.response;
    }

    lastError = await r.text();
  }

  throw new Error(`Cloudflare AI request failed: ${lastError.slice(0, 500)}`);
}

async function falSubmit(env, model, input) {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY secret is missing. In Cloudflare, the secret name must be exactly FAL_KEY.");
  }

  const r = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: {
      "Authorization": `Key ${env.FAL_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) {
    return { ok: false, status: r.status, error: data };
  }

  return {
    ok: true,
    request_id: data.request_id,
    status_url: data.status_url,
    response_url: data.response_url
  };
}

async function falStatus(env, statusUrl, responseUrl) {
  if (!env.FAL_KEY) {
    throw new Error("FAL_KEY secret is missing.");
  }

  const headers = { "Authorization": `Key ${env.FAL_KEY}` };
  const s = await fetch(statusUrl, { headers });
  const statusText = await s.text();
  let statusData;
  try { statusData = JSON.parse(statusText); } catch { statusData = { raw: statusText }; }

  if (!s.ok) return { ok: false, status: s.status, error: statusData };

  const state = statusData.status || statusData.state || "UNKNOWN";

  if (state === "COMPLETED" && responseUrl) {
    const rr = await fetch(responseUrl, { headers });
    const responseText = await rr.text();
    let responseData;
    try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }
    return { ok: rr.ok, status: state, response: responseData };
  }

  return { ok: true, status: state, queue: statusData };
}

function normalizeScenes(plan) {
  if (!plan || !Array.isArray(plan.scenes)) return [];
  return plan.scenes.map((s, i) => ({
    scene: s.scene ?? i + 1,
    duration: Number(s.duration) || 5,
    narration: s.narration ?? "",
    visual_prompt: s.visual_prompt ?? s.visualPrompt ?? "",
    caption: s.caption ?? ""
  }));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/") {
        return json({
          success: true,
          service: "PickPrime AI Video Maker",
          status: "online",
          endpoints: ["/", "/plan", "/fal/submit", "/fal/status"]
        });
      }

      if (request.method !== "POST") {
        return json({ success: false, error: "POST required." }, 405);
      }

      const body = await request.json();

      // Script -> AI scenes. This also keeps compatibility with the old frontend
      // that POSTs {script} to the Worker root.
      if (url.pathname === "/" || url.pathname === "/plan") {
        const script = String(body.script || "").trim();
        if (!script) return json({ success: false, error: "script is required" }, 400);

        const plan = await cloudflareAI(env, script);
        return json({
          success: true,
          title: plan.title || "PickPrime AI Video",
          scenes: normalizeScenes(plan)
        });
      }

      // Server-side fal.ai queue submission.
      // Example body:
      // { "model":"fal-ai/flux-2/turbo", "input":{"prompt":"..." } }
      if (url.pathname === "/fal/submit") {
        // Friendly API: frontend may send only {prompt}.
        // The FAL key stays server-side in env.FAL_KEY.
        const model = String(body.model || "fal-ai/flux-2/turbo").trim();
        let input = body.input;

        if (!input) {
          const prompt = String(body.prompt || "").trim();
          if (!prompt) {
            return json({ success: false, error: "prompt is required" }, 400);
          }

          input = {
            prompt,
            image_size: body.image_size || "portrait_16_9",
            num_images: 1
          };
        }

        const result = await falSubmit(env, model, input);
        return json({
          success: result.ok,
          model,
          ...result
        }, result.ok ? 200 : 502);
      }

      // Poll a fal.ai queue request.
      if (url.pathname === "/fal/status") {
        if (!body.status_url) {
          return json({ success: false, error: "status_url is required" }, 400);
        }
        const result = await falStatus(env, body.status_url, body.response_url);
        return json(result, result.ok ? 200 : 502);
      }

      return json({ success: false, error: "Unknown endpoint" }, 404);

    } catch (err) {
      return json({
        success: false,
        error: err?.message || String(err)
      }, 500);
    }
  }
};
