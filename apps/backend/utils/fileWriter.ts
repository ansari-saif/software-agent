import * as fs from 'fs/promises';
import * as path from 'path';

interface FileContent {
  file_path: string;
  file_content: string;
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