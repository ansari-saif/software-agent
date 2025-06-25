import { Loader2 } from "lucide-react";

export default function DbmlDiagramLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p className="text-gray-400">Generating DBML diagram...</p>
      </div>
    </div>
  );
} 