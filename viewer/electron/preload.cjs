const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Sandboxed Electron preloads support the CommonJS Electron bridge. Keeping
// this file as .cjs is important: an ESM preload can silently fail to expose
// the bridge in a packaged macOS app, leaving the welcome-page button inert.
contextBridge.exposeInMainWorld('copyframeViewer', {
  chooseArchive: () => ipcRenderer.invoke('copyframe-viewer:choose-archive'),
  returnToWelcome: () => ipcRenderer.invoke('copyframe-viewer:return-to-welcome'),
  openDroppedFile: (file) => {
    let filePath = '';
    try { filePath = webUtils.getPathForFile(file); } catch { filePath = file?.path || ''; }
    return ipcRenderer.invoke('copyframe-viewer:open-dropped-file', filePath);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || document.querySelector('[data-copyframe-viewer-toolbar]')) return;
  const host = document.createElement('div');
  host.setAttribute('data-copyframe-viewer-toolbar', '');
  host.style.cssText = 'position:fixed;top:12px;right:14px;z-index:2147483647;pointer-events:auto';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .bar { display:flex; gap:6px; padding:5px; border:1px solid rgba(123,137,169,.32); border-radius:10px; background:rgba(255,255,255,.94); box-shadow:0 7px 22px rgba(29,42,69,.18); backdrop-filter:blur(8px); font:12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif; }
    button { appearance:none; border:0; border-radius:7px; padding:7px 9px; color:#41516e; background:transparent; font:inherit; font-weight:650; cursor:pointer; }
    button:hover { color:#fff; background:#6357dd; }
    button:focus-visible { outline:2px solid #8e84ff; outline-offset:2px; }
    button:disabled { opacity:.65; cursor:wait; }
  </style><div class="bar"><button id="assets" type="button" title="只允许补载原网页的图片和视频；接口、登录和脚本仍保持离线限制。">加载缺失资源</button><button id="home" type="button">返回选择</button><button id="open" type="button">打开其他网页</button></div>`;
  const invoke = async (button, label, channel) => {
    button.disabled = true;
    const original = button.textContent;
    button.textContent = label;
    try {
      const result = await ipcRenderer.invoke(channel);
      if (result?.error) throw new Error(result.error);
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : '操作失败';
      window.setTimeout(() => { button.disabled = false; button.textContent = original; }, 1800);
      return;
    }
    button.disabled = false;
    button.textContent = original;
  };
  const assetsButton = shadow.getElementById('assets');
  const updateAssetButton = () => {
    const enabled = new URL(location.href).searchParams.get('copyframe-allow-external-assets') === '1';
    assetsButton.textContent = enabled ? '恢复离线资源' : '加载缺失资源';
    assetsButton.title = enabled
      ? '停止从原网页补载图片和视频，恢复严格离线查看。'
      : '只允许补载原网页的图片和视频；接口、登录和脚本仍保持离线限制。';
  };
  assetsButton.addEventListener('click', () => {
    const target = new URL(location.href);
    const enabled = target.searchParams.get('copyframe-allow-external-assets') === '1';
    if (enabled) target.searchParams.delete('copyframe-allow-external-assets');
    else target.searchParams.set('copyframe-allow-external-assets', '1');
    location.assign(target.href);
  });
  updateAssetButton();
  shadow.getElementById('home').addEventListener('click', (event) => invoke(event.currentTarget, '正在返回…', 'copyframe-viewer:return-to-welcome'));
  shadow.getElementById('open').addEventListener('click', (event) => invoke(event.currentTarget, '正在打开…', 'copyframe-viewer:choose-archive'));
  document.documentElement.append(host);
});
