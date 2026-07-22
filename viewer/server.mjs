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
    "default-src 'self' data: blob:", "base-uri 'none'", "object-src 'none'", "connect-src 'self'",
    `img-src ${assetSources}`, `media-src ${assetSources}`, "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline' data:", "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "frame-src 'self' data: blob:", "worker-src 'self' blob:"
  ].join('; ');
}

export async function createArchiveServer(input, { host = '127.0.0.1', port = 0 } = {}) {
  const root = await archiveRoot(input);
  const server = createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method || 'GET')) throw new Error('不支持的请求方法');
      const requestUrl = new URL(request.url || '/', 'http://copyframe.local');
      const pathname = requestUrl.pathname;
      const allowExternalAssets = requestUrl.searchParams.get('copyframe-allow-external-assets') === '1';
      const candidate = await archiveFile(root, pathname === '/' ? '/index.html' : pathname);
      const info = await stat(candidate);
      if (!info.isFile()) throw new Error('不是文件');
      const extension = extname(candidate).toLowerCase();
      response.writeHead(200, {
        'Content-Type': mime[extension] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': archiveContentSecurityPolicy(allowExternalAssets),
        'Cross-Origin-Resource-Policy': 'same-origin',
        'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') response.end();
      else if (extension === '.html') {
        const html = await readFile(candidate, 'utf8');
        response.end(allowExternalAssets ? relaxAssetContentSecurityPolicy(html) : html);
      } else createReadStream(candidate).pipe(response);
    } catch {
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
  return { server, root, host, port: address.port, url: `http://${host}:${address.port}/` };
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
