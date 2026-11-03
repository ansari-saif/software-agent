import fs from "fs/promises";
import path from "path";

const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export class PathContainmentError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "PathContainmentError";
  }
}

export function sanitizeTenantSegment(id: string, label: string): string {
  if (!id || !SAFE_ID_REGEX.test(id)) {
    throw new PathContainmentError(`Invalid ${label} identifier`);
  }
  return id;
}

export function getProjectWorkspaceDir(
  workspaceRoot: string,
  userId: string,
  projectId: string
): string {
  const safeUser = sanitizeTenantSegment(userId, "userId");
  const safeProject = sanitizeTenantSegment(projectId, "projectId");
  const rootResolved = path.resolve(workspaceRoot);
  const full = path.resolve(rootResolved, safeUser, safeProject);
  if (!full.startsWith(rootResolved + path.sep)) {
    throw new PathContainmentError("Workspace path escaped root");
  }
  return full;
}

export interface ResolveInsideOptions {
  allowGit?: boolean;
  allowRoot?: boolean;
}

/**
 * Pure synchronous path containment check (SEC-02).
 * Rejects null bytes, absolute paths, `~`, `..` traversal, and `.git` access.
 */
export function resolveInside(
  workspaceDir: string,
  relPath: string,
  options: ResolveInsideOptions = {}
): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new PathContainmentError("Path must be a non-empty string");
  }
  if (relPath.includes("\0")) {
    throw new PathContainmentError("Null bytes are not allowed in file paths");
  }
  const trimmed = relPath.trim();
  if (
    path.isAbsolute(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.startsWith("~") ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    throw new PathContainmentError("Absolute paths are not permitted");
  }

  const rootResolved = path.resolve(workspaceDir);
  const normalizedRel = trimmed.replace(/\\/g, "/");
  const targetResolved = path.resolve(rootResolved, normalizedRel);

  if (targetResolved === rootResolved) {
    if (options.allowRoot) {
      return rootResolved;
    }
    throw new PathContainmentError("Operation cannot target workspace root directly");
  }

  if (!targetResolved.startsWith(rootResolved + path.sep)) {
    throw new PathContainmentError("Path traversal outside workspace is forbidden");
  }

  const relativeFromRoot = path
    .relative(rootResolved, targetResolved)
    .split(path.sep);
  if (!options.allowGit && relativeFromRoot.includes(".git")) {
    throw new PathContainmentError(
      "Direct access to .git directory is forbidden"
    );
  }

  return targetResolved;
}

/**
 * Asynchronous path containment check that also inspects every existing path
 * component with `fs.lstat` to refuse following symlinks inside the workspace.
 */
export async function resolveInsideSafe(
  workspaceDir: string,
  relPath: string,
  options: ResolveInsideOptions = {}
): Promise<string> {
  const targetResolved = resolveInside(workspaceDir, relPath, options);
  const rootResolved = path.resolve(workspaceDir);

  const relSegments = path
    .relative(rootResolved, targetResolved)
    .split(path.sep)
    .filter(Boolean);

  let current = rootResolved;
  for (const segment of relSegments) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new PathContainmentError(
          `Symlink encountered at '${segment}'; symlinks are forbidden`
        );
      }
    } catch (err: unknown) {
      if (err instanceof PathContainmentError) {
        throw err;
      }
      const code = (err as { code?: string })?.code;
      if (code === "ENOENT") {
        // Remaining segments do not exist yet (e.g., new file write)
        break;
      }
      throw err;
    }
  }

  return targetResolved;
}
