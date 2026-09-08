export function withBasePath(resource, base = '/') {
  if (!base.startsWith('/') || !base.endsWith('/') || base.includes('//')) throw new Error('Invalid application base path');
  return base + resource.replace(/^\/+/, '');
}
