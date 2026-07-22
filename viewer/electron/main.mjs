import { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } from 'electron';
import { existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closeArchiveServer, createArchiveServer } from '../server.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const welcomeUrl = pathToFileURL(resolve(here, 'welcome.html')).href;
let mainWindow;
let archive;
let pendingOpenPath = firstPathArgument(process.argv);

app.setName('Copyframe Viewer');
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) void openArchive(filePath);
  else pendingOpenPath = filePath;
});

app.whenReady().then(async () => {
  hardenElectronSession();
  createMainWindow();
  buildMenu();
  if (pendingOpenPath) await openArchive(pendingOpenPath);
  else await showWelcome();
  app.on('activate', () => { void restoreMainWindow(); });
}).catch((error) => {
  dialog.showErrorBox('Copyframe Viewer 无法启动', messageOf(error));
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (archive?.server) void closeArchiveServer(archive.server).catch(() => {});
});

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 860,
    minHeight: 600,
    show: false,
    title: 'Copyframe Viewer',
    backgroundColor: '#f7f8fc',
    webPreferences: {
      preload: resolve(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isViewerUrl(url)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) void shell.openExternal(url);
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.on('closed', () => {
    mainWindow = undefined;
    void releaseArchiveServer();
  });
  return mainWindow;
}

async function restoreMainWindow() {
  const window = createMainWindow();
  if (!window.isVisible()) await showWelcome();
  window.show();
  window.focus();
}

async function releaseArchiveServer() {
  const previous = archive;
  archive = undefined;
  if (previous?.server) await closeArchiveServer(previous.server).catch(() => {});
}

function hardenElectronSession() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开离线网页…', accelerator: 'CommandOrControl+O', click: () => void chooseArchive() },
        { label: '回到开始页', accelerator: 'CommandOrControl+Shift+O', click: () => void returnToWelcome() },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' }
      ]
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' }
      ]
    },
    {
      label: '帮助',
      submenu: [{ label: 'Copyframe Viewer 使用说明', click: () => void returnToWelcome() }]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function chooseArchive() {
  const result = await dialog.showOpenDialog(createMainWindow(), {
    title: '选择解压后的离线网页文件夹或 index.html',
    buttonLabel: '打开离线网页',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: '网页文件', extensions: ['html', 'htm'] }]
  });
  if (!result.canceled && result.filePaths[0]) await openArchive(result.filePaths[0]);
}

async function openArchive(input) {
  try {
    const selected = await resolveArchiveSelection(input);
    await replaceArchiveServer(selected.root);
    const page = relative(archive.root, selected.page).replaceAll('\\', '/');
    const window = createMainWindow();
    await window.loadURL(new URL(page, archive.url).href);
    window.setTitle(`Copyframe Viewer — ${basename(selected.page)}`);
    window.show();
    window.focus();
    return { ok: true };
  } catch (error) {
    const message = messageOf(error);
    await returnToWelcome(message);
    return { ok: false, error: message };
  }
}

async function replaceArchiveServer(root) {
  if (archive?.root === root && archive.server?.listening) return;
  const nextArchive = await createArchiveServer(root);
  const previous = archive;
  archive = nextArchive;
  // The currently displayed archive can keep an HTTP connection alive. Do not
  // wait for its server to close before navigating to the newly selected page,
  // otherwise "打开其他网页" can deadlock in the same way as the return action.
  if (previous?.server) void closeArchiveServer(previous.server).catch(() => {});
}

async function returnToWelcome(error = '') {
  const previous = archive;
  // Navigate first. Closing an HTTP server while its current page is still
  // loaded waits for that page's keep-alive connection and deadlocks the
  // return action. The welcome page does not need the archive server.
  await showWelcome(error);
  if (archive === previous) archive = undefined;
  if (previous?.server) void closeArchiveServer(previous.server).catch(() => {});
}

async function resolveArchiveSelection(input) {
  const selected = resolve(String(input || ''));
  if (!existsSync(selected)) throw new Error('找不到所选的离线网页。请先解压 Copyframe 下载的 ZIP。');
  const info = await stat(selected);
  if (info.isDirectory()) {
    const index = resolve(selected, 'index.html');
    if (!existsSync(index) || !(await stat(index)).isFile()) throw new Error('这个文件夹里没有 index.html。请选择解压后的离线网页文件夹。');
    return { root: await realpath(selected), page: await realpath(index) };
  }
  if (!info.isFile() || !/\.html?$/i.test(selected)) throw new Error('请选择离线网页的 index.html，或它所在的文件夹。');
  return { root: await realpath(dirname(selected)), page: await realpath(selected) };
}

async function showWelcome(error = '') {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(`${welcomeUrl}${error ? `?error=${encodeURIComponent(error)}` : ''}`);
  mainWindow.setTitle('Copyframe Viewer');
  mainWindow.show();
  mainWindow.focus();
}

function isViewerUrl(url) {
  if (url.startsWith(welcomeUrl)) return true;
  return isArchiveUrl(url);
}

function isArchiveUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(archive?.url || 'http://127.0.0.1:0/').origin;
  } catch { return false; }
}

function canControlViewer(event) {
  const senderUrl = event.senderFrame?.url || '';
  return senderUrl.startsWith(welcomeUrl) || isArchiveUrl(senderUrl);
}

function firstPathArgument(argumentsList) {
  return argumentsList.slice(1).find((value) => !value.startsWith('-') && existsSync(value)) || '';
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error || '无法打开离线网页。');
}

ipcMain.handle('copyframe-viewer:choose-archive', async (event) => {
  if (!canControlViewer(event)) return { ok: false, error: '此操作只能在 Copyframe Viewer 中使用。' };
  const result = await dialog.showOpenDialog(createMainWindow(), {
    title: '选择解压后的离线网页文件夹或 index.html',
    buttonLabel: '打开离线网页',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: '网页文件', extensions: ['html', 'htm'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { ok: false, cancelled: true };
  return openArchive(result.filePaths[0]);
});

ipcMain.handle('copyframe-viewer:open-dropped-file', async (event, filePath) => {
  if (!canControlViewer(event)) return { ok: false, error: '此操作只能在 Copyframe Viewer 中使用。' };
  if (typeof filePath !== 'string' || !filePath.trim()) return { ok: false, error: '没有读取到拖入的文件。请拖入解压后的文件夹或 index.html。' };
  return openArchive(filePath);
});

ipcMain.handle('copyframe-viewer:return-to-welcome', async (event) => {
  if (!canControlViewer(event)) return { ok: false, error: '此操作只能在 Copyframe Viewer 中使用。' };
  await returnToWelcome();
  return { ok: true };
});
