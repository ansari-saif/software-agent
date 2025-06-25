import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DbmlDiagramEmptyProps {
  hasSchema: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  isJsonCreated: boolean;
}

export default function DbmlDiagramEmpty({ isGenerating, onGenerate, isJsonCreated }: DbmlDiagramEmptyProps) {
  if (isJsonCreated) {
    return (
      <div className="w-2/3 flex items-center justify-center text-white bg-gray-800">
        <div className="text-center">
          <p className="mb-4 text-gray-400">No diagram generated yet</p>
          <Button onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Generate DBML Diagram
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-2/3 text-white bg-gray-800 overflow-y-auto relative">
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-gray-400">
          <p>Database Schema Visualization</p>
          <p className="text-sm mt-2">
            Start a conversation to generate your database schema and view the DBML diagram
          </p>
        </div>
      </div>
    </div>
  );
} 