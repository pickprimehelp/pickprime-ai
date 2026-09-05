// PickPrime AI Worker
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          success: true,
          service: "PickPrime AI",
          status: "online"
        }),
        { headers: cors }
      );
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "POST required" }),
        { status: 405, headers: cors }
      );
    }

    try {
      const body = await request.json();
      const script = String(body.script || "").trim();

      if (!script) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Please enter a script."
          }),
          { status: 400, headers: cors }
        );
      }

      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      const token = env.CLOUDFLARE_API_TOKEN;

      if (!accountId || !token) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Cloudflare credentials are not configured."
          }),
          { status: 500, headers: cors }
        );
      }

      const prompt = `
You are PickPrime AI Video Maker.

Convert the following user script into a video production plan.

Return ONLY valid JSON in this exact structure:

{
  "title": "video title",
  "scenes": [
    {
      "scene": 1,
      "duration": 5,
      "narration": "voiceover",
      "visual_prompt": "detailed visual description",
      "caption": "short caption"
    }
  ]
}

Create 5 to 10 scenes depending on the script.
Keep the narration natural.
Make visual prompts suitable for AI image/video generation.

USER SCRIPT:
${script}
`;

      const aiResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/moonshotai/kimi-k2.6`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages: [
              {
                role: "system",
                content: "You are a professional AI video production assistant."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.7,
            max_completion_tokens: 3000
          })
        }
      );

      const data = await aiResponse.json();

      if (!aiResponse.ok || data.success === false) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Workers AI request failed.",
            details: data
          }),
          { status: 500, headers: cors }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          result: data.result
        }),
        { headers: cors }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message
        }),
        { status: 500, headers: cors }
      );
    }
  }
};
