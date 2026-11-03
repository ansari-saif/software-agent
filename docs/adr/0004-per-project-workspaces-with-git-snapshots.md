# ADR 0004: Per-project workspaces with git snapshots per run

- Status: Accepted
- Date: 2026-11-03

## Context

The old stack wrote generated code into shared directories and into database columns (`code_files`, frontend/backend code blobs). There was no history, no way to undo a bad generation, and code from different users and kinds lived side by side, which made cross-tenant mistakes likely (SEC-05). Large blobs in Postgres also bloated backups.

## Decision

- Each project gets one directory, `WORKSPACE_ROOT/<projectId>` (host path `HOST_WORKSPACE_ROOT/<projectId>`). It is created and owned by the sandbox-controller and bind-mounted only into that project's sandbox at `/workspace`.
- The workspace is a git repository. The controller commits a snapshot at the start and end of every run, with the run ID in the commit message. Undo and diff are git operations, and the export endpoint archives the working tree.
- Postgres stores metadata only (projects, messages, runs, events, usage), never file contents.
- Deleting a project removes its sandbox and workspace directory.

## Consequences

- The tenant boundary for files is a directory plus a container mount, enforced in one place: the controller's path-safety layer.
- History is cheap and local. Users can inspect it in the IDE.
- Backups are split: `pg_dump` for the database and a tarball of `HOST_WORKSPACE_ROOT` (excluding `node_modules`, `.next`, `dist` and `.venv`). `scripts/backup.sh` does both. A restore must bring back both sets from the same night.
- Disk usage grows with projects. We will need per-project size limits and cleanup of abandoned projects as usage grows.
- Workspaces live on one host, so horizontal scaling of sandboxes would need shared or replicated storage. That is out of scope for now.
