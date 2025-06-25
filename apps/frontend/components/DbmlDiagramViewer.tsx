import { Loader2 } from "lucide-react";

interface DbmlDiagramViewerProps {
  dbmlId: string;
  diagramId: string;
}

export default function DbmlDiagramViewer({ dbmlId, diagramId }: DbmlDiagramViewerProps) {
  return (
    <>
      <iframe
        key={`${dbmlId}-${diagramId}`}
        src={`https://dbdiagram.io/e/${dbmlId}/${diagramId}`}
        className="w-full h-full"
        title="DBML Diagram"
        onLoad={(e) => {
          const target = e.target as HTMLIFrameElement;
          const loader =
            target.parentElement?.querySelector(".iframe-loader");
          if (loader) {
            loader.classList.add("opacity-0");
            setTimeout(() => loader.remove(), 300);
          }
        }}
      />
      <div className="iframe-loader absolute inset-0 flex items-center justify-center bg-gray-800 transition-opacity duration-300">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    </>
  );
} 