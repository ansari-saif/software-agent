import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface FileContent {
  file_path: string;
  file_content: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

export function getWorkspaceRoot(): string {
  return process.env.WORKSPACE_ROOT || '/data/workspaces';
}

export function getProjectPath(
  type: 'backend' | 'frontend' = 'backend',
  userId?: string
): string {
  const root = getWorkspaceRoot();
  const kind = type === 'frontend' ? 'frontend' : 'backend';
  if (userId) {
    return path.join(root, userId, kind);
  }
  // Shared fallback for single-tenant / worker writes before user-scoped paths
  return path.join(root, 'shared', kind);
}

export async function writeFiles(
  files: FileContent[],
  projectId: string,
  type: 'backend' | 'frontend' = 'backend',
  userId?: string
): Promise<void> {
  for (const file of files) {
    try {
      const projectPath = getProjectPath(type, userId);
      const fullPath = path.join(projectPath, file.file_path);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.file_content, 'utf-8');

      console.log(`Successfully wrote ${type} file: ${fullPath}`);
    } catch (error) {
      console.error(`Error writing ${type} file ${file.file_path}:`, error);
      throw error;
    }
  }
}

export async function runProjectCommand(
  command: string,
  projectId: string,
  type: 'backend' | 'frontend' = 'backend',
  userId?: string
): Promise<CommandResult> {
  try {
    const projectPath = getProjectPath(type, userId);

    console.log(`Executing ${type} command: ${command} in directory: ${projectPath}`);

    await fs.mkdir(projectPath, { recursive: true });

    const { stdout, stderr } = await execAsync(command, {
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 10,
      timeout: 300000,
    });

    console.log(`Command executed successfully: ${command}`);
    console.log(`stdout: ${stdout}`);
    if (stderr) {
      console.log(`stderr: ${stderr}`);
    }

    return {
      stdout,
      stderr,
      success: true,
    };
  } catch (error) {
    console.error(`Error executing ${type} command: ${command}`, error);

    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      success: false,
    };
  }
}
