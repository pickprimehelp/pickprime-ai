const MODEL = "minimax/h3-max/text-to-video";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    try {
      // Health check
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          service: "PickPrime AI Video Maker",
          model: MODEL,
          fal_key_configured: Boolean(env.FAL_KEY)
        });
      }

      // Homepage
      if (url.pathname === "/" && request.method === "GET") {
        return new Response(
          "✨ PickPrime AI Video Maker is online.",
          {
            headers: {
              "Content-Type": "text/plain; charset=UTF-8",
              ...corsHeaders()
            }
          }
        );
      }

      // =========================
      // GENERATE VIDEO
      // =========================
      if (
        url.pathname === "/api/generate" &&
        request.method === "POST"
      ) {
        if (!env.FAL_KEY) {
          return json(
            {
              success: false,
              error: "FAL_KEY is missing in Cloudflare Worker Secrets."
            },
            500
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

        const prompt = String(body.prompt || "").trim();

        if (!prompt) {
          return json(
            {
              success: false,
              error: "Please enter a video prompt."
            },
            400
          );
        }

        // Duration
        const duration =
          Number(body.duration) === 10 ? 10 : 5;

        // Aspect ratio
        const allowedRatios = [
          "16:9",
          "9:16",
          "1:1",
          "4:3",
          "3:4",
          "21:9"
        ];

        const aspect_ratio =
          allowedRatios.includes(body.aspect_ratio)
            ? body.aspect_ratio
            : "16:9";

        // H3 Max input
        const payload = {
          prompt: prompt,
          duration: duration,
          resolution: "480P",
          prompt_expansion_mode: "balanced",
          aspect_ratio: aspect_ratio,
          enable_safety_checker: true
        };

        const falResponse = await fetch(
          `https://queue.fal.run/${MODEL}`,
          {
            method: "POST",

            headers: {
              "Authorization": `Key ${env.FAL_KEY}`,
              "Content-Type": "application/json"
            },

            body: JSON.stringify(payload)
          }
        );

        const falText = await falResponse.text();

        // IMPORTANT:
        // Return complete fal.ai error
        if (!falResponse.ok) {
          return json(
            {
              success: false,
              error: "fal.ai request failed",
              fal_status: falResponse.status,
              fal_response: tryParse(falText)
            },
            falResponse.status
          );
        }

        const data = tryParse(falText);

        return json({
          success: true,
          request_id: data?.request_id || null,
          status_url: data?.status_url || null,
          response_url: data?.response_url || null
        });
      }

      // =========================
      // CHECK STATUS
      // =========================
      if (
        url.pathname === "/api/status" &&
        request.method === "GET"
      ) {
        const id = url.searchParams.get("id");

        if (!id) {
          return json(
            {
              success: false,
              error: "Missing request id."
            },
            400
          );
        }

        if (!env.FAL_KEY) {
          return json(
            {
              success: false,
              error: "FAL_KEY is missing."
            },
            500
          );
        }

        const statusResponse = await fetch(
          `https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(id)}/status`,
          {
            method: "GET",
            headers: {
              "Authorization": `Key ${env.FAL_KEY}`
            }
          }
        );

        const statusText = await statusResponse.text();

        return new Response(statusText, {
          status: statusResponse.status,
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            ...corsHeaders()
          }
        });
      }

      // =========================
      // GET RESULT
      // =========================
      if (
        url.pathname === "/api/result" &&
        request.method === "GET"
      ) {
        const id = url.searchParams.get("id");

        if (!id) {
          return json(
            {
              success: false,
              error: "Missing request id."
            },
            400
          );
        }

        if (!env.FAL_KEY) {
          return json(
            {
              success: false,
              error: "FAL_KEY is missing."
            },
            500
          );
        }

        const resultResponse = await fetch(
          `https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(id)}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Key ${env.FAL_KEY}`
            }
          }
        );

        const resultText = await resultResponse.text();

        if (!resultResponse.ok) {
          return json(
            {
              success: false,
              error: "fal.ai result request failed",
              fal_status: resultResponse.status,
              fal_response: tryParse(resultText)
            },
            resultResponse.status
          );
        }

        const resultData = tryParse(resultText);

        return json({
          success: true,
          data: resultData
        });
      }

      // =========================
      // 404
      // =========================
      return json(
        {
          success: false,
          error: "API endpoint not found."
        },
        404
      );

    } catch (error) {
      return json(
        {
          success: false,
          error: "Worker internal error",
          message: error?.message || String(error)
        },
        500
      );
    }
  }
};


// =========================
// HELPERS
// =========================

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status: status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        ...corsHeaders()
      }
    }
  );
}


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
