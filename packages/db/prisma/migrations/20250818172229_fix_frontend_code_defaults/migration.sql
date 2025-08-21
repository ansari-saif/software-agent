/*
  Warnings:

  - Made the column `menuCode` on table `Project` required. This step will fail if there are existing NULL values in that column.
  - Made the column `routeCode` on table `Project` required. This step will fail if there are existing NULL values in that column.

*/

-- First, update existing NULL values with default values
UPDATE "Project" 
SET "menuCode" = 'import React from "react";
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

export default App;'
WHERE "menuCode" IS NULL;

UPDATE "Project" 
SET "routeCode" = 'import { CheckSquare, Home, LucideIcon, File } from "lucide-react"

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
];'
WHERE "routeCode" IS NULL;

-- Then alter the table to make columns required and set defaults
ALTER TABLE "Project" ALTER COLUMN "menuCode" SET NOT NULL,
ALTER COLUMN "menuCode" SET DEFAULT 'import React from "react";
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

export default App;',
ALTER COLUMN "routeCode" SET NOT NULL,
ALTER COLUMN "routeCode" SET DEFAULT 'import { CheckSquare, Home, LucideIcon, File } from "lucide-react"

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
];';
