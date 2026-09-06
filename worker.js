const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

const DEFAULT_MODEL = "fal-ai/kling-video/v2.6/pro/text-to-video";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS
    }
  });
}

async function falRequest(env, url, options = {}) {
  if (!env.FAL_KEY) {
    throw new Error(
      "FAL_KEY is missing. Cloudflare Secret name must be exactly FAL_KEY."
    );
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": `Key ${env.FAL_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.error ||
      data?.message ||
      data?.raw ||
      `Fal API error (${response.status})`;

    throw new Error(
      typeof message === "string"
        ? message
        : JSON.stringify(message)
    );
  }

  return data;
}

async function falSubmit(env, model, input) {
  const url = `https://queue.fal.run/${model}`;

  const data = await falRequest(env, url, {
    method: "POST",
    body: JSON.stringify({
      input
    })
  });

  return {
    request_id: data.request_id || data.requestId,
    status_url: data.status_url,
    response_url: data.response_url
  };
}

async function falStatus(env, model, requestId) {
  if (!requestId) {
    throw new Error("request_id is required.");
  }

  const url =
    `https://queue.fal.run/${model}/requests/${requestId}/status`;

  return await falRequest(env, url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  });
}

async function falResult(env, model, requestId) {
  if (!requestId) {
    throw new Error("request_id is required.");
  }

  const url =
    `https://queue.fal.run/${model}/requests/${requestId}`;

  return await falRequest(env, url, {
    method: "GET"
  });
}

function findVideoUrl(data) {
  if (!data) return null;

  if (typeof data === "string") {
    if (
      data.startsWith("http://") ||
      data.startsWith("https://")
    ) {
      return data;
    }
    return null;
  }

  if (data.video?.url) return data.video.url;
  if (data.output?.video?.url) return data.output.video.url;
  if (data.data?.video?.url) return data.data.video.url;
  if (data.result?.video?.url) return data.result.video.url;

  return null;
}

async function cloudflareAI(env, prompt) {
  if (
    !env.CLOUDFLARE_ACCOUNT_ID ||
    !env.CLOUDFLARE_API_TOKEN
  ) {
    throw new Error(
      "Cloudflare AI credentials are missing."
    );
  }

  const model = "@cf/zai-org/glm-4.7-flash";

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/` +
    `${encodeURIComponent(model)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization":
        `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content:
            "You are a professional AI video storyboard generator. " +
            "Return ONLY valid JSON."
        },
        {
          role: "user",
          content:
            `Create a cinematic video plan from this script:\n\n` +
            `${prompt}\n\n` +
            `Return exactly this JSON format:` +
            `{"title":"...","scenes":[` +
            `{"scene":1,"duration":5,"narration":"...",` +
            `"visual_prompt":"...","caption":"..."}` +
            `]}` +
            `Create 3-8 scenes.`
        }
      ],
      response_format: {
        type: "json_object"
      }
    })
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Cloudflare AI returned invalid JSON: ${text.slice(0, 500)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.errors?.[0]?.message ||
      data?.message ||
      "Cloudflare AI request failed."
    );
  }

  const result = data.result ?? data;

  let output =
    result?.response ??
    result?.output_text ??
    result?.choices?.[0]?.message?.content ??
    result?.choices?.[0]?.text;

  if (typeof output === "object") {
    return output;
  }

  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      throw new Error(
        `AI returned invalid storyboard JSON: ${output.slice(0, 500)}`
      );
    }
  }

  if (result?.scenes) {
    return result;
  }

  throw new Error(
    "Cloudflare AI did not return a valid storyboard."
  );
}

function normalizeScenes(plan) {
  if (!plan || !Array.isArray(plan.scenes)) {
    return [];
  }

  return plan.scenes.map((scene, index) => ({
    scene: scene.scene ?? index + 1,
    duration: Number(scene.duration) || 5,
    narration: scene.narration ?? "",
    visual_prompt:
      scene.visual_prompt ??
      scene.visualPrompt ??
      "",
    caption: scene.caption ?? ""
  }));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS
      });
    }

    const url = new URL(request.url);

    try {
      // -------------------------
      // HEALTH CHECK
      // -------------------------
      if (
        request.method === "GET" &&
        url.pathname === "/"
      ) {
        return json({
          success: true,
          service: "PickPrime AI Video Maker",
          status: "online",
          video_model: DEFAULT_MODEL,
          endpoints: [
            "/",
            "/plan",
            "/fal/submit",
            "/fal/status",
            "/fal/result"
          ]
        });
      }

      if (request.method !== "POST") {
        return json(
          {
            success: false,
            error: "POST required."
          },
          405
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            success: false,
            error: "Invalid JSON request."
          },
          400
        );
      }

      // -------------------------
      // SCRIPT -> STORYBOARD
      // -------------------------
      if (
        url.pathname === "/" ||
        url.pathname === "/plan"
      ) {
        const script = String(
          body.script || ""
        ).trim();

        if (!script) {
          return json(
            {
              success: false,
              error: "script is required."
            },
            400
          );
        }

        const plan =
          await cloudflareAI(env, script);

        return json({
          success: true,
          title:
            plan.title ||
            "PickPrime AI Video",
          scenes:
            normalizeScenes(plan)
        });
      }

      // -------------------------
      // TEXT -> VIDEO SUBMIT
      // -------------------------
      if (url.pathname === "/fal/submit") {
        const model =
          String(
            body.model ||
            DEFAULT_MODEL
          ).trim();

        const prompt =
          String(body.prompt || "").trim();

        if (!prompt) {
          return json(
            {
              success: false,
              error: "prompt is required."
            },
            400
          );
        }

        const input = {
          prompt,

          // Vertical Shorts/Reels
          aspect_ratio:
            body.aspect_ratio ||
            "9:16",

          // Kling supports native audio.
          // Set false by default to control cost.
          generate_audio:
            body.generate_audio === true
        };

        const result =
          await falSubmit(
            env,
            model,
            input
          );

        return json({
          success: true,
          model,
          request_id:
            result.request_id,
          status_url:
            result.status_url,
          response_url:
            result.response_url,
          message:
            "Video generation started."
        });
      }

      // -------------------------
      // QUEUE STATUS
      // -------------------------
      if (url.pathname === "/fal/status") {
        const model =
          String(
            body.model ||
            DEFAULT_MODEL
          ).trim();

        const requestId =
          String(
            body.request_id ||
            body.requestId ||
            ""
          ).trim();

        if (!requestId) {
          return json(
            {
              success: false,
              error: "request_id is required."
            },
            400
          );
        }

        const status =
          await falStatus(
            env,
            model,
            requestId
          );

        return json({
          success: true,
          model,
          request_id: requestId,
          status:
            status.status ||
            status.state ||
            "UNKNOWN",
          details: status
        });
      }

      // -------------------------
      // GET FINAL VIDEO
      // -------------------------
      if (url.pathname === "/fal/result") {
        const model =
          String(
            body.model ||
            DEFAULT_MODEL
          ).trim();

        const requestId =
          String(
            body.request_id ||
            body.requestId ||
            ""
          ).trim();

        if (!requestId) {
          return json(
            {
              success: false,
              error: "request_id is required."
            },
            400
          );
        }

        const result =
          await falResult(
            env,
            model,
            requestId
          );

        const videoUrl =
          findVideoUrl(result);

        return json({
          success: true,
          model,
          request_id: requestId,
          video_url: videoUrl,
          result
        });
      }

      return json(
        {
          success: false,
          error: "Unknown endpoint."
        },
        404
      );

    } catch (error) {
      console.error(
        "Worker error:",
        error
      );

      return json(
        {
          success: false,
          error:
            error?.message ||
            String(error)
        },
        500
      );
    }
  }
};
