const MODEL = "minimax/h3-max/text-to-video";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders()
      });
    }

    try {
      // Home page
      if (url.pathname === "/") {
        return new Response("PickPrime AI Video Maker is online.", {
          headers: {
            "content-type": "text/plain",
            ...corsHeaders()
          }
        });
      }

      // Generate video
      if (url.pathname === "/api/generate" && request.method === "POST") {
        if (!env.FAL_KEY) {
          return json({
            error: "FAL_KEY is not configured in Cloudflare."
          }, 500);
        }

        const body = await request.json();

        const prompt = String(body.prompt || "").trim();

        if (!prompt) {
          return json({
            error: "Please enter a video prompt."
          }, 400);
        }

        const duration = Number(body.duration) === 10 ? 10 : 5;

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

        const payload = {
          prompt,
          duration,
          resolution: "480P",
          prompt_expansion_mode: "balanced",
          aspect_ratio,
          enable_safety_checker: true
        };

        const response = await fetch(
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

        const text = await response.text();

        if (!response.ok) {
          return json({
            error: "fal.ai request failed",
            status: response.status,
            details: safeParse(text)
          }, response.status);
        }

        const data = safeParse(text);

        return json({
          success: true,
          request_id: data.request_id,
          status_url: data.status_url,
          response_url: data.response_url
        });
      }

      // Check status
      if (url.pathname === "/api/status" && request.method === "GET") {
        const id = url.searchParams.get("id");

        if (!id) {
          return json({
            error: "Missing request id."
          }, 400);
        }

        const response = await fetch(
          `https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(id)}/status`,
          {
            headers: {
              "Authorization": `Key ${env.FAL_KEY}`
            }
          }
        );

        const text = await response.text();

        return new Response(text, {
          status: response.status,
          headers: {
            "content-type": "application/json",
            ...corsHeaders()
          }
        });
      }

      // Get final result
      if (url.pathname === "/api/result" && request.method === "GET") {
        const id = url.searchParams.get("id");

        if (!id) {
          return json({
            error: "Missing request id."
          }, 400);
        }

        const response = await fetch(
          `https://queue.fal.run/${MODEL}/requests/${encodeURIComponent(id)}`,
          {
            headers: {
              "Authorization": `Key ${env.FAL_KEY}`
            }
          }
        );

        const text = await response.text();

        if (!response.ok) {
          return json({
            error: "Could not get video result.",
            status: response.status,
            details: safeParse(text)
          }, response.status);
        }

        const data = safeParse(text);

        return json({
          success: true,
          data
        });
      }

      return json({
        error: "Not found"
      }, 404);

    } catch (error) {
      return json({
        error: error?.message || String(error)
      }, 500);
    }
  }
};

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
