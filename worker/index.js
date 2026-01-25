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
   * get: (arg0: string, arg1: { range: any; }) => any; 
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
        // 安全第一：严格校验密码
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
          const files = formData.getAll("file"); // 严格支持多文件
          const folder = formData.get("folder") || ""; // 读取目录路径

          if (files.length === 0) return new Response("No files uploaded", { status: 400, headers: corsHeaders });

          const uploadResults = [];
          const cleanFolder = folder ? `${folder.replace(/\/+$/, '')}/` : "";

          for (const file of files) {
            if (file.size > 100 * 1024 * 1024) continue; // 跳过超过100MB的文件

            // 安全加固：净化文件名并强制 WebP 命名逻辑
            let fileName = file.name.replace(/[^\w.-]/g, '_'); 
            let contentType = file.type;

            // 如果前端压了 WebP，确保后缀和 MIME 匹配
            if (contentType.startsWith('image/') && !contentType.includes('svg')) {
               if (!fileName.toLocaleLowerCase().endsWith('.webp')) {
                  fileName = fileName.replace(/\.[^/.]+$/, "") + ".webp";
               }
               contentType = 'image/webp'; 
            }

            // 构造 Key：目录 + 时间戳 - 文件名
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

      // --- 2. 公开读取 (GET) ---
      const objectKey = path.slice(1);
      if (objectKey && request.method === "GET") {
        const allowedExtensions = /\.(webp|jpg|jpeg|png|gif|svg|ico|mp4|mov|webm|mp3|wav)$/i;
        if (!allowedExtensions.test(objectKey)) {
          return new Response("Forbidden Type", { status: 403, headers: corsHeaders });
        }

        const range = request.headers.get("range");
        const object = await env.BUCKET.get(objectKey, { range });

        if (object === null) return new Response("Not Found", { status: 404, headers: corsHeaders });
        
        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        // 核心需求：缓存一年
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        const status = object.range ? 206 : 200;
        return new Response(object.body, { headers, status });
      }

    } catch (e) {
      return new Response(e.message, { status: 500, headers: corsHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};