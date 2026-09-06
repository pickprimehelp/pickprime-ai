const MODEL = "fal-ai/kling-video/v2.6/pro/text-to-video";

const json = (data, status=200) => Response.json(data, {
  status,
  headers: {"Cache-Control":"no-store"}
});

async function falFetch(env, path, options={}) {
  return fetch(`https://queue.fal.run/${MODEL}${path}`, {
    ...options,
    headers: {
      "Authorization": `Key ${env.FAL_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Create a new video job.
    if (url.pathname === "/api/generate" && request.method === "POST") {
      try {
        if (!env.FAL_KEY) return json({error:"FAL_KEY secret is missing."},500);

        const body = await request.json();
        if (!body.prompt?.trim()) return json({error:"Prompt is required."},400);

        const input = {
          prompt: body.prompt.trim(),
          aspect_ratio: ["9:16","16:9","1:1"].includes(body.aspect_ratio)
            ? body.aspect_ratio : "9:16"
        };

        const res = await falFetch(env, "", {
          method:"POST",
          body:JSON.stringify(input)
        });

        const text = await res.text();
        if (!res.ok) {
          let err; try { err=JSON.parse(text); } catch { err={error:text}; }
          return json({error:err.detail || err.message || err.error || "fal.ai request failed"}, res.status);
        }

        const data = JSON.parse(text);
        return json({
          ok:true,
          request_id:data.request_id,
          status:"IN_QUEUE",
          message:"Video generation started."
        });
      } catch(e) {
        return json({error:e.message || "Server error"},500);
      }
    }

    // Check a queued job.
    if (url.pathname === "/api/status" && request.method === "GET") {
      try {
        if (!env.FAL_KEY) return json({error:"FAL_KEY secret is missing."},500);
        const id = url.searchParams.get("id");
        if (!id) return json({error:"Missing request id."},400);

        const res = await falFetch(env, ` /status?request_id=${encodeURIComponent(id)}`.trim(), {
          method:"GET",
          headers:{"Content-Type":"application/json"}
        });
        const text = await res.text();
        if (!res.ok) return new Response(text,{status:res.status,headers:{"Content-Type":"application/json"}});

        return new Response(text,{status:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
      } catch(e) {
        return json({error:e.message || "Status error"},500);
      }
    }

    // Fetch the completed result.
    if (url.pathname === "/api/result" && request.method === "GET") {
      try {
        if (!env.FAL_KEY) return json({error:"FAL_KEY secret is missing."},500);
        const id = url.searchParams.get("id");
        if (!id) return json({error:"Missing request id."},400);

        const res = await falFetch(env, ` /result?request_id=${encodeURIComponent(id)}`.trim(), {
          method:"GET",
          headers:{"Content-Type":"application/json"}
        });
        const text = await res.text();
        if (!res.ok) return new Response(text,{status:res.status,headers:{"Content-Type":"application/json"}});

        const data=JSON.parse(text);
        const video_url=data?.video?.url || data?.data?.video?.url || data?.output?.video?.url || null;
        return json({ok:true, video_url, data});
      } catch(e) {
        return json({error:e.message || "Result error"},500);
      }
    }

    // Static files.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("PickPrime AI");
  }
};
