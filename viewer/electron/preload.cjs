const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Sandboxed Electron preloads support the CommonJS Electron bridge. Keeping
// this file as .cjs is important: an ESM preload can silently fail to expose
// the bridge in a packaged macOS app, leaving the welcome-page button inert.
const isWelcomePage = location.protocol === 'file:' && /\/welcome\.html$/i.test(decodeURIComponent(location.pathname));
if (isWelcomePage) {
  contextBridge.exposeInMainWorld('copyframeViewer', {
    chooseArchive: () => ipcRenderer.invoke('copyframe-viewer:choose-archive'),
    getAppInfo: () => ipcRenderer.invoke('copyframe-viewer:get-app-info'),
    openDroppedFile: (file) => {
      let filePath = '';
      try { filePath = webUtils.getPathForFile(file); } catch { filePath = file?.path || ''; }
      return ipcRenderer.invoke('copyframe-viewer:open-dropped-file', filePath);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1' || document.querySelector('[data-copyframe-viewer-toolbar]')) return;
  const viewerDocument = document;
  const host = viewerDocument.createElement('div');
  host.setAttribute('data-copyframe-viewer-toolbar', '');
  const hostStyles = {
    position: 'fixed', top: '12px', right: '14px', zIndex: '2147483647', pointerEvents: 'auto',
    display: 'block', visibility: 'visible', opacity: '1', filter: 'none', transform: 'none',
    width: 'max-content', height: 'auto', margin: '0', padding: '0', isolation: 'isolate'
  };
  for (const [property, value] of Object.entries(hostStyles)) host.style.setProperty(property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`), value, 'important');
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `<style>
    :host { display:block !important; visibility:visible !important; opacity:1 !important; pointer-events:auto !important; }
    .bar { display:flex; width:max-content; gap:6px; padding:5px; border:1px solid rgba(123,137,169,.32); border-radius:10px; color:#263750; background:rgba(255,255,255,.94); box-shadow:0 7px 22px rgba(29,42,69,.18); backdrop-filter:blur(8px); font:400 12px/17px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; pointer-events:auto; }
    .version { align-self:center; padding:0 5px; color:#53657d; font:600 11px/15px -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; white-space:nowrap; }
    button { appearance:none; border:0; border-radius:7px; padding:7px 9px; color:#41516e; background:transparent; font:inherit; font-weight:600; cursor:pointer; }
    button:hover { color:#fff; background:#6357dd; }
    button:focus-visible { outline:2px solid #8e84ff; outline-offset:2px; }
    button:disabled { opacity:.65; cursor:wait; }
    @media (prefers-color-scheme:dark) {
      .bar { color:#f5f8fd; border-color:#35465d; background:rgba(29,38,50,.96); box-shadow:0 7px 22px rgba(0,0,0,.42); }
      .version { color:#d2dbe7; }
      button { color:#d2dbe7; }
      button:hover { color:#182231; background:#70a1ff; }
      button:focus-visible { outline-color:#9ec1ff; }
    }
  </style><div class="bar"><span class="version" id="version" aria-label="Viewer 版本"></span><button id="assets" type="button" title="需要联网：允许补载原网页的图片、视频和跨域 iframe；接口、登录和脚本仍保持离线限制。">加载缺失资源（需联网）</button><button id="home" type="button">返回选择</button><button id="open" type="button">打开其他网页</button></div>`;
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
  const updateAssetButton = (enabled) => {
    assetsButton.dataset.enabled = String(Boolean(enabled));
    assetsButton.textContent = enabled ? '恢复严格离线' : '加载缺失资源（需联网）';
    assetsButton.title = enabled
      ? '停止从原网页补载图片、视频和跨域 iframe，恢复严格离线查看。'
      : '允许补载原网页的图片、视频和跨域 iframe；接口、登录和脚本仍保持离线限制。';
  };
  const refreshViewerState = async () => {
    try {
      const state = await ipcRenderer.invoke('copyframe-viewer:get-viewer-state');
      if (!state?.ok) throw new Error(state?.error || '无法读取 Viewer 状态');
      shadow.getElementById('version').textContent = state.version ? `v${state.version}` : '';
      updateAssetButton(state.externalAssetsAllowed);
    } catch {
      updateAssetButton(false);
    }
  };
  assetsButton.addEventListener('click', async () => {
    const enabled = assetsButton.dataset.enabled === 'true';
    assetsButton.disabled = true;
    assetsButton.textContent = '正在切换…';
    try {
      const state = await ipcRenderer.invoke('copyframe-viewer:set-external-assets', !enabled);
      if (!state?.ok) throw new Error(state?.error || '无法切换资源模式');
      location.reload();
    } catch (error) {
      assetsButton.disabled = false;
      assetsButton.textContent = error instanceof Error ? error.message : '切换失败';
      window.setTimeout(() => {
        assetsButton.disabled = false;
        updateAssetButton(enabled);
      }, 1800);
    }
  });
  const legacyUrl = new URL(location.href);
  if (legacyUrl.searchParams.has('copyframe-allow-external-assets')) {
    legacyUrl.searchParams.delete('copyframe-allow-external-assets');
    history.replaceState(history.state, '', legacyUrl.href);
  }
  void refreshViewerState();
  shadow.getElementById('home').addEventListener('click', (event) => invoke(event.currentTarget, '正在返回…', 'copyframe-viewer:return-to-welcome'));
  shadow.getElementById('open').addEventListener('click', (event) => invoke(event.currentTarget, '正在打开…', 'copyframe-viewer:choose-archive'));
  const openTrustedExternalLink = (event) => {
    if (!event.isTrusted || event.defaultPrevented || ![0, 1].includes(event.button)) return;
    const link = event.composedPath().find((node) => node?.matches?.('a[href],area[href]'));
    if (!link) return;
    let target;
    try { target = new URL(link.href, location.href); } catch { return; }
    if (!['http:', 'https:'].includes(target.protocol) || target.origin === location.origin) return;
    event.preventDefault();
    void ipcRenderer.invoke('copyframe-viewer:open-external-link', target.href);
  };
  viewerDocument.addEventListener('click', openTrustedExternalLink, true);
  viewerDocument.addEventListener('auxclick', openTrustedExternalLink, true);
  let observedRoot = null;
  let rootObserver = null;
  const observeRoot = () => {
    const root = viewerDocument.documentElement;
    if (!root || root === observedRoot) return root;
    rootObserver?.disconnect();
    observedRoot = root;
    rootObserver = new MutationObserver(mountToolbar);
    rootObserver.observe(root, { childList: true });
    return root;
  };
  const mountToolbar = () => {
    const root = observeRoot();
    if (!host.isConnected && root) root.append(host);
  };
  // React/Next.js can hydrate the entire HTML document and discard unknown
  // siblings that were inserted at DOMContentLoaded. Keep Viewer chrome in an
  // isolated world and reattach the same host after any such replacement.
  const documentObserver = new MutationObserver(mountToolbar);
  documentObserver.observe(viewerDocument, { childList: true });
  window.addEventListener('pageshow', mountToolbar);
  window.addEventListener('pagehide', () => {
    documentObserver.disconnect();
    rootObserver?.disconnect();
  }, { once: true });
  mountToolbar();
});
