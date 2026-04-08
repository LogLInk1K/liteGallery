# 🚀 liteGallery

English | [中文](./README_zh.md)

A lightweight image hosting solution built on **Cloudflare Pages + Functions + R2**.

---

## 🌟 Key Features

- **Zero Maintenance**: Runs entirely within Cloudflare's free tier—no servers required.
- **Extreme Speed**: Leverages Cloudflare's Edge Network with support for long-term (1-year) image caching for global instant loading.
- **WebP Automation**: Frontend automatically processes images to optimize storage and bandwidth.
- **Full-Stack Integration**: Frontend, backend, and APIs are all-in-one; no manual CORS configuration needed.
- **Smart Setup**: Built-in configuration guide to ensure a smooth deployment experience for beginners.

## 📦 Step 1: Fork the Repository

Click the **Fork** button in the top right corner to clone this project to your GitHub account.

## 🚢 Step 2: Connect to Cloudflare Pages

[**👉 Click here to enter Cloudflare Pages Dashboard 👈**](https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/pages)

1. Select **Connect to Git**, and authorize access to the `liteGallery` repository you just forked.
2. Click **Save and Deploy**.

## 🛠️ Step 3: Initial Configuration (Crucial)

Due to how R2 bindings and environment variables take effect, please follow these steps in your project dashboard after the initial deployment:

### **Set Admin Password**
- **Variable Name**: `ADMIN_PASSWORD`
- **Value**: `YourSecurePassword`

### **Bind R2 Bucket**
- **Variable Name**: Must be `BUCKET`.
- **R2 Bucket**: Select your existing R2 bucket.

### **Apply Changes**
- Go back to the **Deployments** tab.
- Find your latest deployment, click the three dots on the right, and select **Retry deployment**.

## ⚙️ Advanced Configuration (Optional)

By default, `ALLOWED_ORIGIN` is set to `*` (allows access from any site).
- **For better security**: Add an environment variable `ALLOWED_ORIGIN` and set its value to your specific domain.

## ⚖️ License & Disclaimer

This project is open-sourced under the **[MIT](LICENSE)** license.

The repository is provided "as-is." It was originally created for personal blog image hosting. Feel free to fork and customize it, but please note that I may not be able to respond to Issues.
