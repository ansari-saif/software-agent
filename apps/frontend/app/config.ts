export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080';

export const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:9091';

export const IDE_BASE_DOMAIN =
  process.env.NEXT_PUBLIC_IDE_BASE_DOMAIN || 'ide.ansarisaif.com';

export function ideSessionUrl(sessionId: string, folder?: string): string {
  const base = `https://${sessionId}.${IDE_BASE_DOMAIN}`;
  if (folder) {
    return `${base}/?folder=${encodeURIComponent(folder)}`;
  }
  return base;
}
