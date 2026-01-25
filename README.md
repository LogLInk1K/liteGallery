# 🚀 liteGallery - 云端画廊

一个基于 **Cloudflare Pages + Functions + R2** 构建的轻量化图床。

### 🌟 核心特性
- **零成本运维**：完全运行在 Cloudflare 免费额度内，无需服务器。
- **极致速度**：利用 Cloudflare 边缘网络缓存，图片支持长期缓存（一年），全球秒开。
- **WebP 自动化**：前端自动处理图片，优化存储空间。
- **全栈一体**：前端、后端、API 全部集成，无需手动配置跨域。
- **智能指引**：内置配置检测引导，确保新手部署不迷路。

---

### 📦 第一步：Fork 本仓库
点击页面右上角的 **Fork** 按钮，将本项目克隆到你的 GitHub 账号下。

### 🚢 第二步：连接 Cloudflare Pages
1. 点击下方链接进入 Cloudflare 控制台：
   > [!TIP]
   > **[点击此处进入 Cloudflare Pages 控制台](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages)**
2. 选择 **连接到 Git**，并授权访问你刚才 Fork 的 `liteGallery` 仓库。
3. **设置构建与变量**：
   - **Framework preset**: 选择 `None`。
   - **Build command**: 留空。
   - **环境变量**：点击下方的 `Environment variables`，添加变量：
     - **Variable name**: `ADMIN_PASSWORD`
     - **Value**: `你的管理密码`
4. 点击 **保存并部署**。

### 🛠️ 第三步：绑定 R2 存储桶
由于 Cloudflare 限制，R2 存储桶必须在项目创建后手动绑定：
1. 进入项目控制台，点击 **Settings** -> **Functions**。
2. 滚动到 **R2 bucket bindings**，点击 **Add binding**。
   - **Variable name**: 必须填 `BUCKET`。
   - **R2 bucket**: 选择你已有的存储桶。
3. **关键操作**：绑定完成后，请回到 **Deployments** 页面，点击最近一次部署旁的三个点，选择 **Retry deployment**（重新部署），配置才会正式生效。

---

### ⚙️ 高级配置 (可选)
如果你希望在其他网站调用此图床接口，可以在环境变量中添加：
- `ALLOWED_ORIGIN`: 填写允许跨域的域名（默认值为 `*`）。

---