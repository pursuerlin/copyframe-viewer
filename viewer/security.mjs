export function normalizeExternalUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.username = '';
    url.password = '';
    const output = url.href;
    return output.length <= 4096 ? output : '';
  } catch {
    return '';
  }
}

export function externalUrlLabel(value) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return '';
  const url = new URL(normalized);
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.origin}${path}${url.search ? '（包含查询参数）' : ''}`.slice(0, 240);
}
