const MODEL = "alibaba/hh1-t2v";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // Health check
    if (url.pathname === "/api/health") {
      return json({
        success: true,
        service: "PickPrime AI Video Maker",
        model: MODEL,
        ai_binding: !!env.AI
      });
    }

    // Generate video
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        if (!env.AI) {
          return json({
            success: false,
            error: "Cloudflare AI binding is missing."
          }, 500);
        }

        const body = await request.json();

        const prompt = String(body.prompt || "").trim();

        if (!prompt) {
          return json({
            success: false,
            error: "Please enter a prompt."
          }, 400);
        }

        const duration = Math.max(
          3,
          Math.min(15, Number(body.duration) || 5)
        );

        const ratio = [
          "16:9",
          "9:16",
          "1:1",
          "4:3",
          "3:4"
        ].includes(body.ratio)
          ? body.ratio
          : "16:9";

        const result = await env.AI.run(MODEL, {
          prompt: prompt,
          duration: duration,
          ratio: ratio,
          resolution: "720P"
        });

        return json({
          success: true,
          video: result?.video || null,
          result: result
        });

      } catch (error) {
        return json({
          success: false,
          error: "Cloudflare AI generation failed.",
          message: error?.message || String(error)
        }, 500);
      }
    }

    return json({
      success: false,
      error: "Not found"
    }, 404);
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
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
