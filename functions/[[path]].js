export async function onRequest(context) {
  const { request, env } = context; // Pages 通过 context 传递参数
  const url = new URL(request.url);
  const path = url.pathname;
  // --- 1. 新手引导：检查配置是否完整 ---
  // 如果 BUCKET 没绑定或密码没设，直接返回一个友好的引导页面
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
        
        // 1. 获取对象
        if (rangeHeader) {
          object = await env.BUCKET.get(objectKey, { 
            range: request.headers, // 建议直接透传整个 headers，让 R2 处理 if-range 等复杂逻辑
          });
        } else {
          object = await env.BUCKET.get(objectKey);
        }

        if (object === null) return context.next(); 
        
        const headers = new Headers(corsHeaders);
        
        // 2. 写入 R2 的元数据（包括 Content-Type, Content-Range 等）
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        
        // 3. 关键：告诉浏览器支持 Range 请求
        headers.set("Accept-Ranges", "bytes");
        
        // 4. 保持强缓存
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        // 5. 构造响应
        // 注意：如果 object.range 存在，R2 返回的 status 应该是 206
        const status = object.range ? 206 : 200;
        
        return new Response(object.body, { 
          headers, 
          status 
        });

      } catch (r2Error) {
        return new Response(`R2 Error: ${r2Error.message}`, { status: 500, headers: corsHeaders });
      }
    }
    
  } catch (e) {
    return new Response("Worker Error: " + e.message, { status: 500, headers: corsHeaders });
  }

  // 最终兜底：让 Pages 处理
  return context.next();
}