const MODEL = "alibaba/hh1-t2v";

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

    // Health check
    if (url.pathname === "/api/health") {
      return json({
        success: true,
        service: "PickPrime AI Video Maker",
        model: MODEL,
        ai_binding: !!env.AI,
        time: new Date().toISOString()
      });
    }

    // Generate video
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        // Check AI binding
        if (!env.AI) {
          return json({
            success: false,
            error: "AI binding missing",
            code: "NO_AI_BINDING",
            help: "Check wrangler.jsonc AI binding"
          }, 500);
        }

        // Read request
        let body;

        try {
          body = await request.json();
        } catch (e) {
          return json({
            success: false,
            error: "Invalid JSON request",
            code: "INVALID_JSON",
            message: e?.message || String(e)
          }, 400);
        }

        const prompt = String(body?.prompt || "").trim();

        if (!prompt) {
          return json({
            success: false,
            error: "Prompt is empty",
            code: "EMPTY_PROMPT"
          }, 400);
        }

        if (prompt.length > 2500) {
          return json({
            success: false,
            error: "Prompt is too long",
            code: "PROMPT_TOO_LONG",
            max_length: 2500
          }, 400);
        }

        // Duration: 3-15 seconds
        let duration = Number(body?.duration);

        if (!Number.isFinite(duration)) {
          duration = 5;
        }

        duration = Math.max(3, Math.min(15, Math.round(duration)));

        // Ratio
        const allowedRatios = [
          "16:9",
          "9:16",
          "1:1",
          "4:3",
          "3:4"
        ];

        const ratio = allowedRatios.includes(body?.ratio)
          ? body.ratio
          : "16:9";

        // Resolution
        const resolution =
          body?.resolution === "1080P"
            ? "1080P"
            : "720P";

        const input = {
          prompt,
          duration,
          ratio,
          resolution
        };

        console.log("PickPrime AI request:", JSON.stringify({
          model: MODEL,
          input
        }));

        // Call Cloudflare AI
        let result;

        try {
          result = await env.AI.run(
            MODEL,
            input
          );
        } catch (aiError) {
          console.error(
            "CLOUDFLARE AI ERROR:",
            aiError
          );

          return json({
            success: false,
            error: "Cloudflare AI generation failed",

            // IMPORTANT: actual error
            message: aiError?.message || String(aiError),

            name: aiError?.name || "UnknownError",

            code:
              aiError?.code ||
              aiError?.status ||
              null,

            status:
              aiError?.status ||
              null,

            cause:
              aiError?.cause
                ? String(aiError.cause)
                : null,

            model: MODEL,

            input,

            timestamp: new Date().toISOString()
          }, 500);
        }

        console.log(
          "CLOUDFLARE AI RESULT:",
          JSON.stringify(result)
        );

        // Extract video URL
        const video =
          result?.result?.video ||
          result?.video ||
          null;

        if (!video) {
          return json({
            success: false,
            error: "AI returned no video URL",
            code: "NO_VIDEO_URL",
            model: MODEL,
            state: result?.state || null,
            raw_response: result
          }, 502);
        }

        // SUCCESS
        return json({
          success: true,
          message: "Video generated successfully",
          model: MODEL,
          state: result?.state || "Completed",
          video,
          duration,
          ratio,
          resolution
        });

      } catch (error) {
        console.error(
          "WORKER ERROR:",
          error
        );

        return json({
          success: false,
          error: "Worker error",

          message:
            error?.message ||
            String(error),

          name:
            error?.name ||
            "UnknownError",

          code:
            error?.code ||
            null,

          status:
            error?.status ||
            null,

          stack:
            error?.stack ||
            null,

          timestamp:
            new Date().toISOString()
        }, 500);
      }
    }

    // Not found
    return json({
      success: false,
      error: "Not found",
      path: url.pathname
    }, 404);
  }
};


// -----------------------------
// CORS
// -----------------------------

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}


// -----------------------------
// JSON response
// -----------------------------

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        ...corsHeaders()
      }
    }
  );
}
