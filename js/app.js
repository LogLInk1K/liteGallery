const API_URL = ''; 
const IMG_HOST = window.location.origin; 

let currentPreviewKey = '';

function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved === 'dark' || (!saved && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.classList.toggle('light', !isDark);
    updateThemeIcons(isDark);
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    document.documentElement.classList.toggle('light', !isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcons(isDark);
}

function updateThemeIcons(isDark) {
    document.getElementById('theme-icon-dark').classList.toggle('hidden', isDark);
    document.getElementById('theme-icon-light').classList.toggle('hidden', !isDark);
}

document.addEventListener('mousemove', (e) => {
    const glow = document.getElementById('cursorGlow');
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
});

function createParticles(x, y) {
    const isDark = document.documentElement.classList.contains('dark');
    const colors = isDark 
        ? ['#ffc848', '#ffb347', '#ff9e40', '#ff8938']
        : ['#425aef', '#6b7fd4', '#8a9bc9', '#a8b8be'];
    for (let i = 0; i < 12; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.background = colors[Math.floor(Math.random() * colors.length)];
        particle.style.setProperty('--tx', (Math.random() - 0.5) * 200 + 'px');
        particle.style.setProperty('--ty', (Math.random() - 0.5) * 200 + 'px');
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 3000);
    }
}

initTheme();
lucide.createIcons();

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

async function loadList() {
    const pw = document.getElementById('pw').value;
    if(!pw) return showToast('🔑 请输入访问密钥');
    const grid = document.getElementById('imageGrid');
    
    grid.innerHTML = Array(8).fill(0).map(() => `
        <div class="img-card rounded-3xl overflow-hidden shadow-xl">
            <div class="aspect-16-9 skeleton"></div>
            <div class="p-4 space-y-3">
                <div class="h-4 skeleton rounded"></div>
                <div class="h-3 skeleton rounded w-2/3"></div>
            </div>
        </div>
    `).join('');
    
    try {
        const res = await fetch(`${API_URL}/list`, { headers: { 'x-polo-auth': pw } });
        if (res.status === 401) return showToast('❌ 密钥验证失败');
        const data = await res.json();
        
        if (data.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center py-32 opacity-30 tracking-widest text-lg">📭 暂无图片，快上传一张吧~</div>';
            showToast('📭 图库为空');
        }
        
        grid.innerHTML = data.map((obj, index) => {
            const isVideo = obj.key.match(/\.(mp4|mov|webm|mp3|wav)$/i);
            const mediaElement = isVideo 
                ? `<video src="${IMG_HOST}/${obj.key}" class="w-full h-full object-cover" loading="lazy" muted loop playsinline></video>`
                : `<img src="${IMG_HOST}/${obj.key}" class="w-full h-full object-cover transition-transform duration-700" loading="lazy" alt="${obj.key}">`;
            
            return `
            <div class="img-card rounded-3xl overflow-hidden shadow-xl card-shine fade-in-up" style="animation-delay: ${index * 0.08}s">
                <div class="absolute top-4 left-4 z-20">
                    <input type="checkbox" class="file-checkbox w-5 h-5 rounded border-2 border-white/50 bg-white/10 cursor-pointer" data-key="${obj.key}" onclick="event.stopPropagation()">
                </div>
                <div class="aspect-16-9 overflow-hidden bg-gradient-to-br from-[var(--accent)]/5 to-[var(--accent-3)]/5">
                    ${mediaElement}
                </div>
                <div class="action-overlay absolute inset-0 flex flex-col items-center justify-end pb-10 gap-6">
                    <div class="flex gap-4">
                        <button onclick="openPreview('${IMG_HOST}/${obj.key}', '${obj.key}')" class="btn-action elastic-btn text-sm tracking-wider border border-white/30 text-white px-6 py-3 rounded-full hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-all flex items-center gap-2">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                            预览
                        </button>
                        <button onclick="copyMd('${obj.key}')" class="btn-action elastic-btn text-sm tracking-wider border border-white/30 text-white px-6 py-3 rounded-full hover:bg-[var(--accent-2)] hover:border-[var(--accent-2)] transition-all flex items-center gap-2">
                            <i data-lucide="link" class="w-4 h-4"></i>
                            链接
                        </button>
                        <button onclick="deleteImg('${obj.key}')" class="btn-action elastic-btn text-sm tracking-wider border border-red-500/40 text-red-400/90 px-6 py-3 rounded-full hover:bg-red-500 hover:text-white transition-all flex items-center gap-2">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                            删除
                        </button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
        lucide.createIcons();
        showToast(`✅ 成功加载 ${data.length} 张图片`);
        selectedKeys = [];
        showGalleryPage();
    } catch (e) { showToast('⚠️ 网络错误，请重试'); }
}

function showUploadPage() {
    document.getElementById('upload-page').classList.remove('hidden');
    document.getElementById('gallery-page').classList.add('hidden');
    clearFiles();
}

function showGalleryPage() {
    document.getElementById('upload-page').classList.add('hidden');
    document.getElementById('gallery-page').classList.remove('hidden');
    selectedKeys = [];
}

function openPreview(src, name) {
    const overlay = document.getElementById('preview-overlay');
    const img = document.getElementById('preview-img');
    const video = document.getElementById('preview-video');
    const nameLabel = document.getElementById('preview-name');
    const isVideo = name.match(/\.(mp4|mov|webm|mp3|wav)$/i);
    
    if (isVideo) {
        img.classList.add('hidden');
        video.classList.remove('hidden');
        video.src = src;
        video.play();
    } else {
        video.classList.add('hidden');
        img.classList.remove('hidden');
        img.src = src;
    }
    
    nameLabel.innerText = name;
    currentPreviewKey = name;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    document.body.style.overflowX = 'hidden';
}

function closePreview() {
    document.getElementById('preview-overlay').classList.remove('active');
    document.body.style.overflow = '';
    document.body.style.overflowX = 'hidden';
}

async function downloadImage(key) {
    try {
        const response = await fetch(`${IMG_HOST}/${key}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = key;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showToast('⬇️ 开始下载');
    } catch (e) {
        showToast('❌ 下载失败');
    }
}

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');
let selectedFiles = [];
let selectedKeys = [];

function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    const selectAllText = document.getElementById('select-all-text');
    const selectAllIcon = document.getElementById('select-all-icon');
    
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    
    checkboxes.forEach(cb => {
        cb.checked = !allChecked;
    });
    
    updateSelectedKeys();
    
    if (allChecked) {
        selectAllText.innerText = '全选';
        selectAllIcon.setAttribute('data-lucide', 'check-square');
    } else {
        selectAllText.innerText = '取消全选';
        selectAllIcon.setAttribute('data-lucide', 'check-square-2');
    }
    
    lucide.createIcons();
}

function updateSelectedKeys() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    selectedKeys = Array.from(checkboxes).map(cb => cb.getAttribute('data-key'));
}

async function deleteSelected() {
    if (selectedKeys.length === 0) return showToast('⚠️ 请先选择要删除的文件');
    
    if (!confirm(`🗑️ 确定要删除选中的 ${selectedKeys.length} 个文件吗？此操作不可恢复。`)) return;
    
    const pw = document.getElementById('pw').value;
    
    try {
        for (const key of selectedKeys) {
            await fetch(`${API_URL}/${key}`, { method: 'DELETE', headers: { 'x-polo-auth': pw } });
        }
        showToast(`🗑️ 已删除 ${selectedKeys.length} 个文件`);
        selectedKeys = [];
        loadList();
    } catch (e) {
        showToast('❌ 删除失败');
    }
}

dropZone.onclick = (e) => {
    createParticles(e.clientX, e.clientY);
    fileInput.click();
};
fileInput.onchange = (e) => {
    showFilePreview(e.target.files);
};

dropZone.ondragover = (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
};

dropZone.ondragleave = () => {
    dropZone.classList.remove('dragover');
};

dropZone.ondrop = async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const files = [];
    const folderPathInput = document.getElementById('folder-path');
    const currentFolderPath = folderPathInput.value.trim();
    let extractedFolderPath = null;

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        
        if (entry) {
            if (entry.isDirectory) {
                if (!extractedFolderPath) {
                    extractedFolderPath = entry.name;
                }
                const dirReader = entry.createReader();
                const dirFiles = await new Promise((resolve) => {
                    dirReader.readEntries(async (entries) => {
                        if (entries.length === 0) {
                            resolve([]);
                            return;
                        }
                        
                        const allFiles = [];
                        for (const entry of entries) {
                            if (entry.isFile) {
                                const file = await new Promise((resolve) => {
                                    entry.file((file) => {
                                        file.relativePath = entry.fullPath.replace(/^\//, '');
                                        resolve(file);
                                    });
                                });
                                allFiles.push(file);
                            } else if (entry.isDirectory) {
                                const subDirReader = entry.createReader();
                                const subFiles = await new Promise((resolve) => {
                                    subDirReader.readEntries(async (entries) => {
                                        if (entries.length === 0) {
                                            resolve([]);
                                            return;
                                        }
                                        
                                        const subFiles = [];
                                        for (const subEntry of entries) {
                                            if (subEntry.isFile) {
                                                const file = await new Promise((resolve) => {
                                                    subEntry.file((file) => {
                                                        file.relativePath = subEntry.fullPath.replace(/^\//, '');
                                                        resolve(file);
                                                    });
                                                });
                                                subFiles.push(file);
                                            }
                                        }
                                        resolve(subFiles);
                                    });
                                });
                                allFiles.push(...subFiles);
                            }
                        }
                        resolve(allFiles);
                    });
                });
                files.push(...dirFiles);
            } else if (entry.isFile) {
                const file = await new Promise((resolve) => {
                    entry.file((file) => {
                        file.relativePath = entry.fullPath.replace(/^\//, '');
                        resolve(file);
                    });
                });
                files.push(file);
            }
        } else {
            const fileList = e.dataTransfer.files;
            for (let j = 0; j < fileList.length; j++) {
                files.push(fileList[j]);
            }
        }
    }

    if (extractedFolderPath && !currentFolderPath) {
        folderPathInput.value = extractedFolderPath;
    }

    if (files.length > 0) {
        showFilePreview(files);
    }
};

function showFilePreview(files) {
    selectedFiles = Array.from(files);
    const previewDiv = document.getElementById('file-preview');
    const fileListDiv = document.getElementById('file-list');
    const fileCountSpan = document.getElementById('file-count');
    const dropZone = document.getElementById('drop-zone');
    
    dropZone.classList.add('hidden');
    previewDiv.classList.remove('hidden');
    fileCountSpan.innerText = selectedFiles.length;
    
    fileListDiv.innerHTML = selectedFiles.map((file, index) => {
        const isImage = file.type.startsWith('image/');
        const icon = isImage ? 'image' : 'file';
        const size = formatFileSize(file.size);
        const path = file.relativePath || file.name;
        
        return `
            <div class="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-[var(--accent)]/20 hover:bg-[var(--accent)]/10 transition-all">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-2)]/20 flex items-center justify-center flex-shrink-0">
                    <i data-lucide="${icon}" class="w-5 h-5 text-[var(--accent)]"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">${path}</p>
                    <p class="text-xs opacity-50">${size}</p>
                </div>
                <button onclick="removeFile(${index})" class="btn-action flex-shrink-0 p-2 rounded-lg hover:bg-red-500/20 transition-all">
                    <i data-lucide="x" class="w-4 h-4 text-red-400/70"></i>
                </button>
            </div>
        `;
    }).join('');
    
    lucide.createIcons();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    showFilePreview(selectedFiles);
}

function clearFiles() {
    selectedFiles = [];
    const previewDiv = document.getElementById('file-preview');
    const dropZone = document.getElementById('drop-zone');
    
    previewDiv.classList.add('hidden');
    dropZone.classList.remove('hidden');
}

async function confirmUpload() {
    if (selectedFiles.length === 0) return showToast('⚠️ 请先选择文件');
    await handleUpload(selectedFiles);
}

// 辅助函数：将图片压缩并转换为 WebP
async function compressImage(file) {
    // 如果不是图片或者是 SVG（SVG不需要压缩），直接返回原文件
    if (!file.type.startsWith('image/') || file.type.includes('svg')) {
        return file;
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // 转换为 WebP，0.8 是压缩质量（0.1-1.0）
                canvas.toBlob((blob) => {
                    if (blob) {
                        // 创建新文件名，后缀改为 .webp
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                        resolve(new File([blob], newFileName, { type: "image/webp" }));
                    } else {
                        resolve(file); // 转换失败则返回原文件
                    }
                }, 'image/webp', 0.8);
            };
            img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
    });
}

async function handleUpload(files) {
    const pw = document.getElementById('pw').value;
    let folderPath = document.getElementById('folder-path').value.trim();
    
    if (!files || files.length === 0) return showToast('⚠️ 请选择文件');
    if (!pw) return showToast('⚠️ 请输入密钥');

    const st = document.getElementById('status-text');
    const originalText = st.innerText;
    st.innerHTML = '<span class="text-[var(--accent)]">⚙️ 正在处理中...</span>';

    try {
        const fd = new FormData();
        const processedFiles = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            let fileToUpload = file;

            if (file.type.startsWith('image/') && !file.type.includes('svg')) {
                st.innerHTML = `<span class="text-[var(--accent)]">⚙️ 正在压缩 ${i + 1}/${files.length}...</span>`;
                fileToUpload = await compressImage(file);
            }

            fd.append('file', fileToUpload);
            processedFiles.push(fileToUpload);
        }

        if (folderPath) {
            fd.append('folder', folderPath);
        } else if (files.length > 0 && files[0].relativePath) {
            const firstFileRelativePath = files[0].relativePath;
            const pathParts = firstFileRelativePath.split('/');
            if (pathParts.length > 1) {
                folderPath = pathParts.slice(0, -1).join('/');
                fd.append('folder', folderPath);
            }
        }

        st.innerHTML = '<span class="text-[var(--accent)]">🚀 上传中...</span>';

        const res = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            headers: { 'x-polo-auth': pw },
            body: fd
        });

        if (res.ok) {
            const result = await res.json();
            showToast(`🎉 成功上传 ${result.length} 个文件！`);
            clearFiles();
            showGalleryPage();
            loadList();
        } else {
            const errorMsg = await res.text();
            showToast(`❌ 上传失败: ${errorMsg || '请检查密钥'}`);
        }
    } catch (e) { 
        console.error(e);
        showToast('⚠️ 网络错误，上传失败'); 
    } finally {
        st.innerText = originalText;
    }
}

async function deleteImg(key) {
    const pw = document.getElementById('pw').value;
    if(!confirm('🗑️ 确定要删除这张图片吗？此操作不可恢复。')) return;
    try {
        await fetch(`${API_URL}/${key}`, { method: 'DELETE', headers: { 'x-polo-auth': pw } });
        showToast('🗑️ 已删除');
        selectedKeys = [];
        loadList();
    } catch (e) { showToast('❌ 删除失败'); }
}

function copyMd(key) {
    navigator.clipboard.writeText(`![](${IMG_HOST}/${key})`);
    showToast('📋 链接已复制到剪贴板');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closePreview();
    }
});

document.querySelectorAll('.btn-action').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        createParticles(x, y);
    });
});
