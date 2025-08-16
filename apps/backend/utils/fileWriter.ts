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

export async function writeFiles(files: FileContent[], projectId: string, type: 'backend' | 'frontend' = 'backend'): Promise<void> {
  for (const file of files) {
    try {
      // Create the project-specific directory path based on type
      const projectPath = type === 'frontend' ? "/tmp/stich-worker-frontend/" : "/tmp/stich-worker/";
      const fullPath = path.join(projectPath, file.file_path);
      
      // Ensure the directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write the file
      await fs.writeFile(fullPath, file.file_content, 'utf-8');
      
      console.log(`Successfully wrote ${type} file: ${fullPath}`);
    } catch (error) {
      console.error(`Error writing ${type} file ${file.file_path}:`, error);
      throw error;
    }
  }
}

export async function runProjectCommand(command: string, projectId: string, type: 'backend' | 'frontend' = 'backend'): Promise<CommandResult> {
  try {
    // Create the project-specific directory path based on type (same as writeFiles)
    const projectPath = type === 'frontend' ? "/tmp/stich-worker-frontend/" : "/tmp/stich-worker/";
    
    console.log(`Executing ${type} command: ${command} in directory: ${projectPath}`);
    
    const { stdout, stderr } = await execAsync(command, {
      cwd: projectPath,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 300000 // 5 minutes timeout
    });
    
    console.log(`Command executed successfully: ${command}`);
    console.log(`stdout: ${stdout}`);
    if (stderr) {
      console.log(`stderr: ${stderr}`);
    }
    
    return {
      stdout,
      stderr,
      success: true
    };
  } catch (error) {
    console.error(`Error executing ${type} command: ${command}`, error);
    
    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      success: false
    };
  }
} 