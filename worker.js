const MODEL = "fal-ai/kling-video/v2.6/pro/text-to-video";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        if (!env.FAL_KEY) {
          return Response.json({error:"FAL_KEY secret is missing in Cloudflare Worker."},{status:500});
        }

        const body = await request.json();
        if (!body.prompt) return Response.json({error:"Prompt is required."},{status:400});

        // fal.ai queue endpoint. The secret stays server-side in Cloudflare.
        const input = {
          prompt: body.prompt,
          aspect_ratio: body.aspect_ratio || "9:16"
        };

        const res = await fetch(`https://queue.fal.run/${MODEL}`, {
          method:"POST",
          headers:{
            "Authorization":`Key ${env.FAL_KEY}`,
            "Content-Type":"application/json"
          },
          body:JSON.stringify(input)
        });

        const text = await res.text();
        if (!res.ok) return new Response(text,{status:res.status,headers:{"Content-Type":"application/json"}});

        const data = JSON.parse(text);

        // Queue APIs normally return a request_id/status URL rather than the final video.
        // The frontend can use the returned status URL in a later polling implementation.
        return Response.json({
          ok:true,
          request_id:data.request_id || data.requestId,
          status_url:data.status_url || data.statusUrl,
          response_url:data.response_url || data.responseUrl,
          message:"Video generation started."
        });
      } catch(e) {
        return Response.json({error:e.message},{status:500});
      }
    }

    return env.ASSETS.fetch(request);
  }
};
