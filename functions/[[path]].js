export async function onRequest(context) {
  const { request, env } = context; // Pages 通过 context 传递参数
  const url = new URL(request.url);
  const path = url.pathname;
  const auth = request.headers.get("x-polo-auth");
  const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || "*";

  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-polo-auth, range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
  };

  // 1. 处理预检请求
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 2. 【新增】静态资源避让：如果是根路径或前端文件，交给 Pages 托管
  // 这样你的 index.html, style.css 和 js/*.js 才能正常加载
  const isStaticAsset = path === "/" || /\.(html|css|js|map|json|png|jpg|ico)$/i.test(path);
  if (isStaticAsset && request.method === "GET") {
    return context.next(); 
  }

  try {
    // --- 1. 管理接口 (POST/DELETE/LIST) ---
    if (["POST", "DELETE"].includes(request.method) || (request.method === "GET" && path === "/list")) {
      if (!auth || auth !== env.ADMIN_PASSWORD) {
        return new Response("Unauthorized", { status: 401, headers: corsHeaders });
      }

      if (path === "/list") {
        const objects = await env.BUCKET.list({ limit: 100 });
        return new Response(JSON.stringify(objects.objects), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      if (path === "/upload" && request.method === "POST") {
        const formData = await request.formData();
        const files = formData.getAll("file");
        const folder = formData.get("folder") || "";

        if (files.length === 0) return new Response("No files uploaded", { status: 400, headers: corsHeaders });

        const uploadResults = [];
        const cleanFolder = folder ? `${folder.replace(/\/+$/, '')}/` : "";

        for (const file of files) {
          if (file.size > 100 * 1024 * 1024) continue;

          let fileName = file.name.replace(/[^\w.-]/g, '_'); 
          let contentType = file.type;

          if (contentType.startsWith('image/') && !contentType.includes('svg')) {
             if (!fileName.toLocaleLowerCase().endsWith('.webp')) {
                fileName = fileName.replace(/\.[^/.]+$/, "") + ".webp";
             }
             contentType = 'image/webp'; 
          }

          const key = `${cleanFolder}${Date.now()}-${fileName}`;
          
          await env.BUCKET.put(key, file.stream(), { 
            httpMetadata: { 
              contentType: contentType,
              cacheControl: 'public, max-age=31536000, immutable' 
            } 
          });
          uploadResults.push({ key, url: `${url.origin}/${key}` });
        }
        
        return new Response(JSON.stringify(uploadResults), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      if (request.method === "DELETE") {
        const key = path.replace(/^\/+/, ''); // 清理开头的斜杠
        if (!key || key.includes('..')) return new Response("Invalid Key", { status: 400, headers: corsHeaders });
        await env.BUCKET.delete(key);
        return new Response("Deleted", { headers: corsHeaders });
      }
    }

    // --- 2. 公开读取 (GET) ---
    const objectKey = decodeURIComponent(path).replace(/^\/+|\/+$/g, '');

    if (objectKey && request.method === "GET") {
      const allowedExtensions = /\.(webp|jpg|jpeg|png|gif|svg|ico|mp4|mov|webm|mp3|wav)$/i;
      if (!allowedExtensions.test(objectKey)) {
        return new Response("Forbidden Type", { status: 403, headers: corsHeaders });
      }

      try {
        const rangeHeader = request.headers.get("range");
        let object;
        if (rangeHeader) {
          object = await env.BUCKET.get(objectKey, { range: rangeHeader });
        } else {
          object = await env.BUCKET.get(objectKey);
        }

        if (object === null) {
          // 如果 R2 没找到，有可能是请求了不存在的静态资源，交给 Pages 兜底
          return context.next(); 
        }
        
        const headers = new Headers(corsHeaders);
        try {
          object.writeHttpMetadata(headers);
        } catch (e) {
          headers.set("Content-Type", object.httpMetadata?.contentType || "image/webp");
        }

        headers.set("etag", object.httpEtag);
        // 核心需求：边缘强缓存一年
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        const status = object.range ? 206 : 200;
        return new Response(object.body, { headers, status });

      } catch (r2Error) {
        return new Response(`Detailed R2 Error: ${r2Error.message}`, { status: 500, headers: corsHeaders });
      }
    }

  } catch (e) {
    return new Response("Worker Error: " + e.message, { status: 500, headers: corsHeaders });
  }

  // 最终兜底：让 Pages 处理
  return context.next();
}