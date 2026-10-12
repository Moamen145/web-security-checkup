export function resolveApiBaseUrl(customEnv?: { VITE_API_URL?: string }): string {
  if (customEnv && typeof customEnv.VITE_API_URL === 'string' && customEnv.VITE_API_URL.trim() !== '') {
    return customEnv.VITE_API_URL.trim();
  }
  const metaEnvUrl = typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL;
  if (metaEnvUrl && typeof metaEnvUrl === 'string' && metaEnvUrl.trim() !== '') {
    return metaEnvUrl.trim();
  }
  return '/api/v1';
}
