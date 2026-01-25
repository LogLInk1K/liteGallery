export default {
  /**
   * @param {{ 
   * url: string | URL; 
   * headers: { get: (arg0: string) => any; }; 
   * method: string; 
   * formData: () => any; 
   * }} request
   * @param {{ 
   * ADMIN_PASSWORD: any; 
   * ALLOWED_ORIGIN: any; 
   * BUCKET: { 
   * list: (arg0: { limit: number; }) => any; 
   * put: (arg0: string, arg1: any, arg2: { httpMetadata: { contentType: any; cacheControl: string; }; }) => any; 
   * delete: (arg0: string) => any; 
   * get: (arg0: string, arg1?: { range: any; }) => any;
   * }; 
   * }} env
   */
  async fetch(request, env) {
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

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
          const key = path.slice(1);
          if (!key || key.includes('..')) return new Response("Invalid Key", { status: 400, headers: corsHeaders });
          await env.BUCKET.delete(key);
          return new Response("Deleted", { headers: corsHeaders });
        }
      }

      const objectKey = decodeURIComponent(path).replace(/^\/+|\/+$/g, '');

      if (objectKey && request.method === "GET") {
        const allowedExtensions = /\.(webp|jpg|jpeg|png|gif|svg|ico|mp4|mov|webm|mp3|wav)$/i;
        if (!allowedExtensions.test(objectKey)) {
          return new Response("Forbidden Type", { status: 403, headers: corsHeaders });
        }

        try {
          // 2. 获取 Range 头
          const rangeHeader = request.headers.get("range");
          
          // 3. 执行获取操作
          let object;
          if (rangeHeader) {
            // 如果有 range 请求（如视频预览），带 range 获取
            object = await env.BUCKET.get(objectKey, { range: rangeHeader });
          } else {
            // 普通图片请求，不带 range 参数（最稳健）
            object = await env.BUCKET.get(objectKey);
          }

          if (object === null) {
            return new Response(`Object Not Found: ${objectKey}`, { status: 404, headers: corsHeaders });
          }
          
          const headers = new Headers(corsHeaders);
          
          // 4. 安全设置元数据
          try {
            object.writeHttpMetadata(headers);
          } catch (e) {
            headers.set("Content-Type", object.httpMetadata?.contentType || "image/webp");
          }

          headers.set("etag", object.httpEtag);
          // 核心需求：边缘缓存一年
          headers.set("Cache-Control", "public, max-age=31536000, immutable");

          const status = object.range ? 206 : 200;
          return new Response(object.body, { headers, status });

        } catch (r2Error) {
          // 如果还是报错，把详细信息吐出来
          return new Response(`Detailed R2 Error: ${r2Error.message} (Key: ${objectKey})`, { 
            status: 500, 
            headers: corsHeaders 
          });
        }
      }

    } catch (e) {
      // 将错误信息抛出，方便调试
      return new Response("Worker Error: " + e.message, { status: 500, headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};