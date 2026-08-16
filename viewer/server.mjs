import { createReadStream, existsSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.wasm': 'application/wasm', '.pdf': 'application/pdf'
};
function archiveContentSecurityPolicy(allowExternalAssets = false) {
  const assetSources = allowExternalAssets ? "'self' data: blob: https: http:" : "'self' data: blob:";
  return [
    "default-src 'self' data: blob:", "base-uri 'none'", "object-src 'none'", "form-action 'none'", "connect-src 'self'",
    `img-src ${assetSources}`, `media-src ${assetSources}`, "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline' data:", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    `frame-src ${allowExternalAssets ? "'self' data: blob: https: http:" : "'self' data: blob:"}`,
    "worker-src 'self' blob:"
  ].join('; ');
}

export async function createArchiveServer(input, { host = '127.0.0.1', port = 0 } = {}) {
  const root = await archiveRoot(input);
  let externalAssetsAllowed = false;
  let entryPath = '/index.html';
  const server = createServer(async (request, response) => {
    let requestUrl;
    try {
      if (!['GET', 'HEAD'].includes(request.method || 'GET')) throw new Error('不支持的请求方法');
      requestUrl = new URL(request.url || '/', 'http://copyframe.local');
      const pathname = requestUrl.pathname;
      const candidate = await archiveFile(root, pathname === '/' ? '/index.html' : pathname);
      const info = await stat(candidate);
      if (!info.isFile()) throw new Error('不是文件');
      const extension = extname(candidate).toLowerCase();
      const headers = {
        'Content-Type': mime[extension] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': archiveContentSecurityPolicy(externalAssetsAllowed),
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff'
      };
      if (extension === '.html') {
        const html = await readFile(candidate, 'utf8');
        const body = Buffer.from(externalAssetsAllowed ? relaxAssetContentSecurityPolicy(html) : html);
        response.writeHead(200, { ...headers, 'Content-Length': body.byteLength });
        response.end(request.method === 'HEAD' ? undefined : body);
        return;
      }

      const range = parseByteRange(request.headers.range, info.size);
      if (range?.invalid) {
        response.writeHead(416, {
          ...headers,
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${info.size}`,
          'Content-Length': '0'
        });
        response.end();
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? Math.max(0, info.size - 1);
      const length = info.size ? end - start + 1 : 0;
      const streamHeaders = {
        ...headers,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(length)
      };
      if (range) streamHeaders['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      response.writeHead(range ? 206 : 200, streamHeaders);
      if (request.method === 'HEAD' || !info.size) response.end();
      else createReadStream(candidate, range ? { start, end } : undefined).pipe(response);
    } catch {
      // Offline pages often contain client-side routes such as `/pricing` or
      // buttons which update location before their framework handles the
      // transition. Those routes are not files in the ZIP. A top-level 404
      // used to replace the page with "离线资源不存在", and reloading after
      // toggling missing assets only reloaded that error. Send document
      // navigations back to the selected entry while keeping missing images,
      // scripts and media as real 404s.
      if (isDocumentNavigation(request, requestUrl) && requestUrl?.pathname !== entryPath) {
        response.writeHead(302, {
          Location: entryPath,
          'Cache-Control': 'no-store',
          'Content-Length': '0',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end();
        return;
      }
      response.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end('离线资源不存在。');
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    await closeArchiveServer(server);
    throw new Error('无法确定离线 Viewer 的本地地址。');
  }
  return {
    server,
    root,
    host,
    port: address.port,
    url: `http://${host}:${address.port}/`,
    setEntryPath(value) { entryPath = normalizeEntryPath(value); },
    entryPath() { return entryPath; },
    setExternalAssetsAllowed(value) { externalAssetsAllowed = Boolean(value); },
    externalAssetsAllowed() { return externalAssetsAllowed; }
  };
}

function isDocumentNavigation(request, requestUrl) {
  if (!requestUrl || !['GET', 'HEAD'].includes(request?.method || 'GET')) return false;
  const destination = String(request.headers?.['sec-fetch-dest'] || '').toLowerCase();
  if (destination) return destination === 'document';
  return String(request.headers?.accept || '').toLowerCase().includes('text/html');
}

function normalizeEntryPath(value) {
  const path = `/${String(value || 'index.html').replaceAll('\\', '/').replace(/^\/+/, '')}`;
  return path === '/' ? '/index.html' : path;
}

export function parseByteRange(value, size) {
  const input = String(value || '').trim();
  const total = Math.max(0, Number(size) || 0);
  if (!input) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(input);
  if (!match || !total || (!match[1] && !match[2])) return { invalid: true };
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return { invalid: true };
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= total || requestedEnd < start) {
    return { invalid: true };
  }
  return { start, end: Math.min(requestedEnd, total - 1) };
}

function relaxAssetContentSecurityPolicy(html) {
  const policy = archiveContentSecurityPolicy(true);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;
  const expression = /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"content-security-policy"|'content-security-policy'|content-security-policy))[^>]*>/gi;
  const output = String(html || '').replace(expression, meta);
  return output === html ? `${meta}${html}` : output;
}

export function closeArchiveServer(server) {
  return new Promise((resolveClose, rejectClose) => {
    if (!server?.listening) return resolveClose();
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

export async function archiveRoot(input) {
  const root = resolve(String(input || ''));
  if (!existsSync(root) || !(await stat(root)).isDirectory()) throw new Error('找不到离线网页目录。');
  return realpath(root);
}

async function archiveFile(root, requestPath) {
  let decoded;
  try { decoded = decodeURIComponent(requestPath); } catch { throw new Error('资源路径无效'); }
  const candidate = resolve(root, `.${decoded.startsWith('/') ? decoded : `/${decoded}`}`);
  const relativePath = relative(root, candidate);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || relativePath === '') throw new Error('路径不允许访问');
  const realCandidate = await realpath(candidate);
  const realRelativePath = relative(root, realCandidate);
  if (realRelativePath === '..' || realRelativePath.startsWith(`..${sep}`) || realRelativePath === '') throw new Error('路径不允许访问');
  return realCandidate;
}

async function runCli() {
  const input = process.argv[2];
  if (!input) {
    console.error('用法：npm run viewer:server -- /绝对路径/离线网页目录');
    process.exitCode = 1;
    return;
  }
  try {
    const viewer = await createArchiveServer(input, { port: 41731 });
    console.log(`Copyframe Viewer 已启动：${viewer.url}\n目录：${viewer.root}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void runCli();
