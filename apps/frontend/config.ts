export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:8080';

export const WORKER_URL =
  process.env.NEXT_PUBLIC_WORKER_URL ||
  process.env.WORKER_URL ||
  'http://localhost:9091';
