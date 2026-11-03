import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PathContainmentError,
  getProjectWorkspaceDir,
  resolveInside,
  resolveInsideSafe,
} from "./pathSafety";
import type Docker from "dockerode";
import pino from "pino";
import { SandboxManager, loadSandboxConfig, parseCookie, shellQuote } from "./sandboxManager";
import { WorkspaceFilesystem } from "./workspaceFs";

let root: string;
const USER = "user_abc";
const PROJECT = "11111111-1111-1111-1111-111111111111";

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "sbx-test-"));
});

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("resolveInside", () => {
  const ws = "/data/workspaces/u/p";

  it("accepts normal relative paths", () => {
    expect(resolveInside(ws, "src/index.ts")).toBe("/data/workspaces/u/p/src/index.ts");
    expect(resolveInside(ws, "./a/../b.txt")).toBe("/data/workspaces/u/p/b.txt");
  });

  it.each([
    "../x",
    "../../etc/passwd",
    "a/../../x",
    "/etc/passwd",
    "~/.ssh/id_rsa",
    "C:\\Windows",
    "\\\\server\\share",
    "a\0b",
    ".git/config",
    "sub/.git/hooks/pre-commit",
    "",
  ])("rejects %j", (bad) => {
    expect(() => resolveInside(ws, bad)).toThrow(PathContainmentError);
  });

  it("rejects the workspace root unless allowed", () => {
    expect(() => resolveInside(ws, ".")).toThrow(PathContainmentError);
    expect(resolveInside(ws, ".", { allowRoot: true })).toBe(ws);
  });

  it("never escapes the root under random fuzzing", () => {
    const parts = ["..", ".", "a", "b", "/", "\\", "%2e%2e", "..\\..", "x/..", ".git", "\0"];
    for (let i = 0; i < 5000; i++) {
      const len = 1 + Math.floor(Math.random() * 6);
      const candidate = Array.from(
        { length: len },
        () => parts[Math.floor(Math.random() * parts.length)]
      ).join("/");
      try {
        const resolved = resolveInside(ws, candidate);
        expect(resolved.startsWith(ws + path.sep)).toBe(true);
        expect(resolved.split(path.sep)).not.toContain(".git");
      } catch (err) {
        expect(err).toBeInstanceOf(PathContainmentError);
      }
    }
  });
});

describe("workspace isolation", () => {
  it("rejects unsafe tenant identifiers", () => {
    expect(() => getProjectWorkspaceDir(root, "../evil", PROJECT)).toThrow(PathContainmentError);
    expect(() => getProjectWorkspaceDir(root, USER, "a/b")).toThrow(PathContainmentError);
    expect(getProjectWorkspaceDir(root, USER, PROJECT)).toBe(path.join(root, USER, PROJECT));
  });

  it("refuses to follow symlinks out of the workspace", async () => {
    const ws = path.join(root, USER, PROJECT);
    await fs.mkdir(ws, { recursive: true });
    const outside = path.join(root, "outside");
    await fs.mkdir(outside, { recursive: true });
    await fs.symlink(outside, path.join(ws, "link"));
    await expect(resolveInsideSafe(ws, "link/secret.txt")).rejects.toThrow(/Symlink/);
  });

  it("writes, edits, reads, searches and deletes within the workspace", async () => {
    const wfs = new WorkspaceFilesystem(root);
    await wfs.writeFile(USER, PROJECT, "src/app.js", "const a = 1;\nconsole.log(a);\n");
    expect(await wfs.editFile(USER, PROJECT, "src/app.js", "const a = 1;", "const a = 2;")).toEqual({
      replacements: 1,
    });
    expect(await wfs.readFile(USER, PROJECT, "src/app.js")).toContain("const a = 2;");
    const matches = await wfs.searchFiles(USER, PROJECT, "console.log");
    expect(matches[0]).toMatchObject({ path: "src/app.js", line: 2 });
    await expect(wfs.writeFile(USER, PROJECT, "../escape.txt", "x")).rejects.toThrow(
      PathContainmentError
    );
    await wfs.deleteFile(USER, PROJECT, "src/app.js");
    await expect(wfs.readFile(USER, PROJECT, "src/app.js")).rejects.toThrow();
  });
});

describe("helpers", () => {
  it("quotes shell arguments safely", () => {
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
  });

  it("parses cookies", () => {
    expect(parseCookie("a=1; sbx_x=tok%20en; b=2", "sbx_x")).toBe("tok en");
    expect(parseCookie("a=1", "missing")).toBeNull();
  });

  it("builds sandbox URLs with and without a session token", () => {
    const config = loadSandboxConfig({ SANDBOX_BASE_DOMAIN: "sbx.test", SANDBOX_PROTOCOL: "http" });
    const manager = new SandboxManager(config, pino({ level: "silent" }), {} as Docker);
    expect(manager.buildUrls(PROJECT, "a b", 5173, "/app?x=1")).toEqual({
      ideUrl: `http://${PROJECT}.sbx.test/?folder=/workspace&tkn=a%20b`,
      previewUrl: `http://${PROJECT}.sbx.test/proxy/5173/app?x=1&tkn=a%20b`,
    });
    expect(manager.buildUrls(PROJECT, null, 3000, "")).toEqual({
      ideUrl: `http://${PROJECT}.sbx.test/?folder=/workspace`,
      previewUrl: `http://${PROJECT}.sbx.test/proxy/3000/`,
    });
  });

  it("serializes lifecycle operations per project, even after a failure", async () => {
    const manager = new SandboxManager(loadSandboxConfig({}), pino({ level: "silent" }), {} as Docker);
    const withLock = (
      manager as unknown as { withProjectLock<T>(id: string, fn: () => Promise<T>): Promise<T> }
    ).withProjectLock.bind(manager);
    const order: string[] = [];
    const step = (label: string, ms: number, fail = false) => async () => {
      order.push(`${label}:start`);
      await new Promise((r) => setTimeout(r, ms));
      order.push(`${label}:end`);
      if (fail) throw new Error(label);
      return label;
    };
    const results = await Promise.allSettled([
      withLock(PROJECT, step("a", 20, true)),
      withLock(PROJECT, step("b", 5)),
      withLock("other", step("c", 1)),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(order.indexOf("b:start")).toBeGreaterThan(order.indexOf("a:end"));
    expect(order.indexOf("c:end")).toBeLessThan(order.indexOf("a:end"));
  });
});
