-- Update existing data to have correct values
-- Swap the values so routeCode gets the App component and menuCode gets the menu items

UPDATE "Project" 
SET "routeCode" = 'import React from "react";
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
"menuCode" = 'import { CheckSquare, Home, LucideIcon, File } from "lucide-react"

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