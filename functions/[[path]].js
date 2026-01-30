export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // --- 1. 新手引导 ---
  if (!env.BUCKET || !env.ADMIN_PASSWORD) {
    return new Response(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>初始化配置 | LiteGallery</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-50 flex items-center justify-center min-h-screen">
        <div class="max-w-md w-full bg-white shadow-lg rounded-2xl p-8 border border-gray-100">
          <h1 class="text-2xl font-bold text-gray-800 mb-4 flex items-center">
            🚀 部署成功，待配置
          </h1>
          <p class="text-gray-600 mb-6">还差最后两步，即可开启云端画廊：</p>
          <div class="space-y-4">
            <div class="flex items-start">
              <span class="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-1 mr-3">1</span>
              <div>
                <p class="font-semibold">绑定 R2 存储桶</p>
                <p class="text-sm text-gray-500">设置 -> 绑定 -> 添加资源绑定(变量名填<b>BUCKET</b>)</p>
              </div>
            </div>
            <div class="flex items-start">
              <span class="bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold mt-1 mr-3">2</span>
              <div>
                <p class="font-semibold">设置管理密码</p>
                <p class="text-sm text-gray-500">设置 -> 变量和机密 -> 添加变量名<b>ADMIN_PASSWORD</b></p>
              </div>
            </div>
          </div>
          <div class="mt-8 p-4 bg-amber-50 rounded-lg border border-amber-100">
            <p class="text-amber-700 text-sm font-medium">⚠️ 重要：设置完成后，请务必在 Deployments 页面点击 "Retry deployment" 重新部署！</p>
          </div>
          <button onclick="window.location.reload()" class="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition">已完成设置，刷新页面</button>
        </div>
      </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html;charset=UTF-8" }
    });
  }

  const auth = request.headers.get("x-polo-auth");
  const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || "*";
  const corsHeaders = {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-polo-auth, range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- 2. 【核心修正】静态资源避让逻辑 ---
  // 我们不再用正则猜，我们用“白名单”精准指定哪些走 Pages
  const objectKey = decodeURIComponent(path).replace(/^\/+|\/+$/g, '');
  const staticFiles = ["", "index.html", "404.html", "theme.css", "logo.ico", "logo.svg", "favicon.ico", "README.md", "LICENSE"];
  
  const isStaticAsset = staticFiles.includes(objectKey) || path.startsWith("/js/");

  if (isStaticAsset && request.method === "GET") {
    return context.next(); 
  }

  try {
    // --- 3. 管理接口 (POST/DELETE/LIST) ---
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
            httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } 
          });
          uploadResults.push({ key, url: `${url.origin}/${key}` });
        }
        return new Response(JSON.stringify(uploadResults), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      if (request.method === "DELETE") {
        const key = path.replace(/^\/+/, '');
        if (!key || key.includes('..')) return new Response("Invalid Key", { status: 400, headers: corsHeaders });
        await env.BUCKET.delete(key);
        return new Response("Deleted", { headers: corsHeaders });
      }
    }

    // --- 4. 公开读取 (GET) 从 R2 获取 ---
    if (objectKey && request.method === "GET") {
      // 允许的扩展名校验
      const allowedExtensions = /\.(webp|jpg|jpeg|png|gif|svg|ico|mp4|mov|webm|mp3|wav)$/i;
      if (!allowedExtensions.test(objectKey)) {
        return new Response("Forbidden Type", { status: 403, headers: corsHeaders });
      }

      try {
        const rangeHeader = request.headers.get("range");
        const getOptions = rangeHeader ? { range: request.headers } : {};
        const object = await env.BUCKET.get(objectKey, getOptions);

        // 如果 R2 找不到，尝试交给 Pages (万一有漏网的静态资源)
        if (object === null) return context.next();

        const headers = new Headers(corsHeaders);
        const contentType = object.httpMetadata?.contentType || "application/octet-stream";
        headers.set("Content-Type", contentType);
        headers.set("etag", object.httpEtag);
        headers.set("Accept-Ranges", "bytes");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        let status = rangeHeader ? 206 : 200;
        if (object.range) {
          const offset = object.range.offset ?? 0;
          const length = object.range.length ?? object.size;
          headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
          headers.set("Content-Length", length.toString());
        } else {
          headers.set("Content-Length", (object.size ?? 0).toString());
        }

        return new Response(object.body, { headers, status });
      } catch (r2Error) {
        return new Response(`Server Error: ${r2Error.message}`, { status: 500, headers: corsHeaders });
      }
    }

  } catch (e) {
    return new Response("Worker Error: " + e.message, { status: 500, headers: corsHeaders });
  }

  return context.next();
}