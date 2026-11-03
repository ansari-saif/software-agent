"use client";

import { Toaster } from "sonner";
import { SWRConfig } from "swr";
import { ApiError } from "@/lib/api";

function shouldRetry(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 0 || err.status >= 500;
  return true;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 2_000,
        errorRetryCount: 3,
        onErrorRetry: (err, _key, config, revalidate, { retryCount }) => {
          if (!shouldRetry(err) || retryCount >= (config.errorRetryCount ?? 3)) return;
          setTimeout(() => revalidate({ retryCount }), Math.min(1000 * 2 ** retryCount, 10_000));
        },
      }}
    >
      {children}
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </SWRConfig>
  );
}
