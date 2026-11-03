import type { ApiErrorCode, SandboxSessionResponse } from "@repo/contracts";
import { ApiError } from "./errors";

export interface ProjectRef {
  projectId: string;
  userId: string;
}

export interface SandboxController {
  ensure(ref: ProjectRef & { previewPort?: number | null; previewPath?: string | null }): Promise<SandboxSessionResponse>;
  stop(ref: ProjectRef & { deleteWorkspace?: boolean }): Promise<void>;
  listFiles(ref: ProjectRef & { path: string }): Promise<{ entries: unknown[] }>;
  readFile(ref: ProjectRef & { path: string }): Promise<{ content: string }>;
  exportArchive(ref: ProjectRef): Promise<ReadableStream<Uint8Array>>;
}

export class HttpSandboxController implements SandboxController {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string
  ) {}

  private async request(path: string, body: unknown, timeoutMs = 120_000): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/internal${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-token": this.internalToken },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return res;
    let code: ApiErrorCode = "INTERNAL_ERROR";
    let message = "Sandbox service error";
    try {
      const data = (await res.json()) as { error?: { code?: ApiErrorCode; message?: string } };
      if (data.error?.code) code = data.error.code;
      if (data.error?.message) message = data.error.message;
    } catch {
      // non-JSON body
    }
    if (res.status >= 500 && code === "INTERNAL_ERROR") {
      throw new ApiError("INTERNAL_ERROR", "Sandbox service unavailable", { status: 502 });
    }
    throw new ApiError(code, message, { status: res.status });
  }

  async ensure(ref: ProjectRef & { previewPort?: number | null; previewPath?: string | null }) {
    return (await (await this.request("/sandboxes/ensure", ref)).json()) as SandboxSessionResponse;
  }

  async stop(ref: ProjectRef & { deleteWorkspace?: boolean }) {
    await this.request("/sandboxes/stop", ref);
  }

  async listFiles(ref: ProjectRef & { path: string }) {
    return (await (await this.request("/files/list", ref)).json()) as { entries: unknown[] };
  }

  async readFile(ref: ProjectRef & { path: string }) {
    return (await (await this.request("/files/read", ref)).json()) as { content: string };
  }

  async exportArchive(ref: ProjectRef) {
    const res = await this.request("/files/export", ref, 300_000);
    if (!res.body) throw new ApiError("INTERNAL_ERROR", "Empty export archive");
    return res.body;
  }
}
