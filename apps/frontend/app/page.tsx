import { TemplateButtons } from "@/components/TemplateButtons";
import Appbar from "../components/Appbar";
import Prompt from "../components/Prompt";

export default function Home() {
  return (
    <div className="p-4">
      <Appbar />
      <div className="max-w-4xl mx-auto p-32">
        <div className="text-2xl font-bold text-center">
          What do you want to build?
        </div>
        <div className="text-sm text-muted-foreground text-center p-2">
          Prompt, click generate and watch your app come to life.
        </div>
        <div className="p-4">
          <Prompt />
        </div>
        <TemplateButtons />
      </div>
      
      
    </div>
  );
}
