
import Appbar from "../components/Appbar";
import Prompt from "../components/Prompt";

export default function Home() {
  return (
    <div className="p-4 min-h-screen bg-[rgb(10,10,10)]">
      <Appbar />
      <div className="max-w-4xl mx-auto p-32">
        <div className="text-2xl font-bold text-center text-white">
          What do you want to build?
        </div>
        <div className="text-sm text-center p-2 text-gray-400">
          Prompt, click generate and watch your app come to life.
        </div>
        <div className="p-4">
          <Prompt />
        </div>
      </div>
    </div>
  );
}
