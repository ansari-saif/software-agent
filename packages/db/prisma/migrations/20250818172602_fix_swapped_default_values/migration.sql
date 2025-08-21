-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "menuCode" SET DEFAULT 'import { CheckSquare, Home, LucideIcon, File } from "lucide-react"

export interface MenuItem {
  name: string
  href: string
  icon: LucideIcon
}

export const menuItems: MenuItem[] = [
  {
    name: "Home",
    href: "/",
    icon: Home
  }
];',
ALTER COLUMN "routeCode" SET DEFAULT 'import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import HomePage from "./components/HomePage";

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </Router>
  );
};

export default App;';
