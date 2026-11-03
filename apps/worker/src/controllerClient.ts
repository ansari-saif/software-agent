import type {
  SandboxClient,
  SandboxExecResult,
  SandboxFileEntry,
  SandboxSearchMatch,
} from "@repo/agent-core";

export class ControllerError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export class ControllerHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string
  ) {}

  async post<T>(path: string, body: unknown, timeoutMs = 330_000): Promise<T> {
    const res = await fetch(`${this.baseUrl}/internal${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": this.internalToken,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      let message = `Sandbox controller ${path} failed with ${res.status}`;
      try {
        const data = (await res.json()) as { error?: { message?: string } };
        if (data.error?.message) message = data.error.message;
      } catch {
        // non-JSON body
      }
      throw new ControllerError(res.status, message);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export interface PreviewHandler {
  (input: { port: number; path: string }): Promise<{ previewUrl: string | null }>;
}

/** Binds the agent's sandbox tools to one project; every call goes through the controller. */
export function createSandboxClient(
  http: ControllerHttp,
  ref: { projectId: string; userId: string },
  onPreview: PreviewHandler
): SandboxClient {
  return {
    async listFiles(path = ".") {
      const r = await http.post<{ entries: SandboxFileEntry[] }>("/files/list", { ...ref, path });
      return r.entries;
    },
    async readFile(path) {
      const r = await http.post<{ content: string }>("/files/read", { ...ref, path });
      return r.content;
    },
    async searchFiles(query, path = ".") {
      const r = await http.post<{ matches: SandboxSearchMatch[] }>("/files/search", {
        ...ref,
        query,
        path,
      });
      return r.matches;
    },
    async writeFile(path, content) {
      await http.post("/files/write", { ...ref, path, content });
    },
    async editFile(path, oldString, newString, replaceAll = false) {
      return http.post<{ replacements: number }>("/files/edit", {
        ...ref,
        path,
        oldString,
        newString,
        replaceAll,
      });
    },
    async deleteFile(path) {
      await http.post("/files/delete", { ...ref, path });
    },
    async runCommand(command, options) {
      const timeoutMs = options?.timeoutMs ?? 120_000;
      return http.post<SandboxExecResult>(
        "/exec",
        { ...ref, command, cwd: options?.cwd ?? ".", timeoutMs },
        timeoutMs + 30_000
      );
    },
    async startProcess(input) {
      return http.post<{ name: string; pid?: number }>("/processes/start", { ...ref, ...input });
    },
    async stopProcess(name) {
      await http.post("/processes/stop", { ...ref, name });
    },
    async setPreview(input) {
      const path = input.path ?? "/";
      const { previewUrl } = await onPreview({ port: input.port, path });
      return { previewUrl, port: input.port, path };
    },
  };
}
