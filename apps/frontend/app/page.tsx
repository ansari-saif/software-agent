import { type FC } from "react";
import ProjectHistorySidebar from "../components/ProjectHistorySidebar";
import Appbar from "../components/Appbar";
import Prompt from "../components/Prompt";

const Home: FC = () => {
  return (
    <main className="p-4 min-h-screen bg-[rgb(10,10,10)]">
      <ProjectHistorySidebar />
      <Appbar />
      <div className="max-w-4xl mx-auto p-32">
        <h1 className="text-2xl font-bold text-center text-white">
          What do you want to build?
        </h1>
        <p className="text-sm text-center p-2 text-gray-400">
          Prompt, click generate and watch your app come to life.
        </p>
        <div className="p-4">
          <Prompt />
        </div>
      </div>
    </main>
  );
};

export default Home;
