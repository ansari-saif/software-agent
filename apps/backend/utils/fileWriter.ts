import * as fs from 'fs/promises';
import * as path from 'path';

interface FileContent {
  file_path: string;
  file_content: string;
}

export async function writeFiles(files: FileContent[], projectId: string): Promise<void> {
  for (const file of files) {
    try {
      // Create the project-specific directory path
      const projectPath = path.join(process.cwd(), 'generated', projectId);
      const fullPath = path.join(projectPath, file.file_path);
      
      // Ensure the directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      
      // Write the file
      await fs.writeFile(fullPath, file.file_content, 'utf-8');
      
      console.log(`Successfully wrote file: ${fullPath}`);
    } catch (error) {
      console.error(`Error writing file ${file.file_path}:`, error);
      throw error;
    }
  }
} 