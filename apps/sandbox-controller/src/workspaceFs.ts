import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import {
  PathContainmentError,
  getProjectWorkspaceDir,
  resolveInsideSafe,
} from "./pathSafety";

const execFileAsync = promisify(execFile);

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
]);

export interface FileEntry {
  path: string;
  type: "file" | "directory";
  size?: number;
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

export class WorkspaceFilesystem {
  constructor(private readonly workspaceRoot: string) {}

  getWorkspaceDir(userId: string, projectId: string): string {
    return getProjectWorkspaceDir(this.workspaceRoot, userId, projectId);
  }

  async ensureWorkspace(userId: string, projectId: string): Promise<string> {
    const dir = this.getWorkspaceDir(userId, projectId);
    await fs.mkdir(dir, { recursive: true, mode: 0o750 });
    return dir;
  }

  async deleteWorkspace(userId: string, projectId: string): Promise<void> {
    const dir = this.getWorkspaceDir(userId, projectId);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async listFiles(
    userId: string,
    projectId: string,
    relPath = "."
  ): Promise<FileEntry[]> {
    const workspaceDir = await this.ensureWorkspace(userId, projectId);
    const targetDir =
      relPath === "." || relPath === ""
        ? workspaceDir
        : await resolveInsideSafe(workspaceDir, relPath, { allowRoot: true });

    const results: FileEntry[] = [];
    const maxEntries = 500;

    const walk = async (currentDir: string, depth: number): Promise<void> => {
      if (results.length >= maxEntries || depth > 6) return;
      let dirents;
      try {
        dirents = await fs.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }
      dirents.sort((a, b) => a.name.localeCompare(b.name));
      for (const dirent of dirents) {
        if (results.length >= maxEntries) break;
        if (dirent.isSymbolicLink()) continue;
        if (dirent.name === ".git") continue;

        const fullPath = path.join(currentDir, dirent.name);
        const relFromWorkspace = path
          .relative(workspaceDir, fullPath)
          .replace(/\\/g, "/");

        if (dirent.isDirectory()) {
          results.push({ path: relFromWorkspace, type: "directory" });
          if (!IGNORED_DIRS.has(dirent.name)) {
            await walk(fullPath, depth + 1);
          }
        } else if (dirent.isFile()) {
          const stat = await fs.lstat(fullPath);
          results.push({
            path: relFromWorkspace,
            type: "file",
            size: stat.size,
          });
        }
      }
    };

    await walk(targetDir, 0);
    return results;
  }

  async readFile(
    userId: string,
    projectId: string,
    relPath: string
  ): Promise<string> {
    const workspaceDir = await this.ensureWorkspace(userId, projectId);
    const targetFile = await resolveInsideSafe(workspaceDir, relPath);
    const stat = await fs.lstat(targetFile);
    if (stat.isSymbolicLink()) {
      throw new PathContainmentError("Refusing to read symbolic link");
    }
    if (stat.isDirectory()) {
      throw new PathContainmentError(`'${relPath}' is a directory`);
    }
    if (stat.size > 5 * 1024 * 1024) {
      throw new PathContainmentError("File exceeds 5 MB read limit");
    }
    return await fs.readFile(targetFile, "utf-8");
  }

  async writeFile(
    userId: string,
    projectId: string,
    relPath: string,
    content: string
  ): Promise<void> {
    const workspaceDir = await this.ensureWorkspace(userId, projectId);
    const targetFile = await resolveInsideSafe(workspaceDir, relPath);
    await fs.mkdir(path.dirname(targetFile), { recursive: true, mode: 0o750 });
    await fs.writeFile(targetFile, content, { encoding: "utf-8", mode: 0o640 });
  }

  async editFile(
    userId: string,
    projectId: string,
    relPath: string,
    oldString: string,
    newString: string,
    replaceAll = false
  ): Promise<{ replacements: number }> {
    const existing = await this.readFile(userId, projectId, relPath);
    if (!existing.includes(oldString)) {
      throw new PathContainmentError(
        `oldString was not found in '${relPath}'`
      );
    }
    const occurrences = existing.split(oldString).length - 1;
    if (!replaceAll && occurrences > 1) {
      throw new PathContainmentError(
        `oldString matched ${occurrences} times in '${relPath}'; provide more context or set replaceAll=true`
      );
    }
    const updated = replaceAll
      ? existing.split(oldString).join(newString)
      : existing.replace(oldString, () => newString);
    await this.writeFile(userId, projectId, relPath, updated);
    return { replacements: replaceAll ? occurrences : 1 };
  }

  async deleteFile(
    userId: string,
    projectId: string,
    relPath: string
  ): Promise<void> {
    const workspaceDir = await this.ensureWorkspace(userId, projectId);
    const targetFile = await resolveInsideSafe(workspaceDir, relPath);
    await fs.rm(targetFile, { force: false });
  }

  async searchFiles(
    userId: string,
    projectId: string,
    query: string,
    relPath = "."
  ): Promise<SearchMatch[]> {
    const files = await this.listFiles(userId, projectId, relPath);
    const matches: SearchMatch[] = [];
    const maxMatches = 100;

    for (const entry of files) {
      if (matches.length >= maxMatches) break;
      if (entry.type !== "file" || (entry.size ?? 0) > 512_000) continue;

      try {
        const content = await this.readFile(userId, projectId, entry.path);
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i] ?? "";
          if (lineText.includes(query)) {
            matches.push({
              path: entry.path,
              line: i + 1,
              text: lineText.slice(0, 300),
            });
            if (matches.length >= maxMatches) break;
          }
        }
      } catch {
        // Ignore binary or unreadable files
      }
    }
    return matches;
  }

  async createTarGzArchive(
    userId: string,
    projectId: string
  ): Promise<Buffer> {
    const workspaceDir = await this.ensureWorkspace(userId, projectId);
    const tmpOut = path.join(
      "/tmp",
      `export-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`
    );
    try {
      await execFileAsync("tar", [
        "-czf",
        tmpOut,
        "--exclude=.git",
        "--exclude=node_modules",
        "--exclude=.next",
        "--exclude=.venv",
        "-C",
        workspaceDir,
        ".",
      ]);
      return await fs.readFile(tmpOut);
    } finally {
      await fs.rm(tmpOut, { force: true }).catch(() => undefined);
    }
  }
}
