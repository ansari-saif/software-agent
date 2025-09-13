export function addModule(routerCode: string, menuCode: string, modulePath: string, componentName: string, routePath: string, iconName: string = "File") {
    // ===== ROUTER HANDLING =====
    
    // Extract imports properly from the original code
    const importRegex = /import\s+(?:[^;]+)\s+from\s+['"][^'"]+['"];?/g;
    const existingImports = routerCode.match(importRegex) || [];
    
    // Clean up imports to ensure they end with semicolons
    const cleanedImports = existingImports.map(imp => imp.trim().endsWith(';') ? imp.trim() : imp.trim() + ';');
    
    const newImport = `import ${componentName} from '${modulePath}';`;
    
    // Check if import already exists
    const importExists = cleanedImports.some(imp => imp.includes(`import ${componentName} from`));
    const finalImports = importExists ? cleanedImports : [...cleanedImports, newImport];
    
    // Extract routes using a more precise approach
    const routePattern = /<Route\s+path="[^"]*"\s+element={<[^>]+\s*\/?>}\s*\/>/g;
    const existingRoutes = routerCode.match(routePattern) || [];
    const newRoute = `<Route path="${routePath}" element={<${componentName} />} />`;
    
    // Check if route already exists
    const routeExists = existingRoutes.some(route => route.includes(`path="${routePath}"`));
    const finalRoutes = routeExists ? existingRoutes : [...existingRoutes, newRoute];
    
    // Build the clean router code
    const formattedImports = finalImports.join('\n') + '\n\n';
    const formattedRoutes = finalRoutes.map(r => `        ${r}`).join('\n');
    
    const updatedRouter = formattedImports + `const App: React.FC = () => {
  return (
    <Router>
      <Routes>
${formattedRoutes}
      </Routes>
    </Router>
  );
};

export default App;`;

    // ===== MENU HANDLING =====
    
    let updatedMenu = menuCode;
    
    // Step 1: Update icon imports
    const iconImportPattern = /import\s*{([^}]+)}\s*from\s*["']lucide-react["']/;
    if (iconImportPattern.test(updatedMenu)) {
        updatedMenu = updatedMenu.replace(iconImportPattern, (match, icons) => {
            const iconList = icons.split(',').map((i: string) => i.trim());
            if (!iconList.includes(iconName)) {
                iconList.push(iconName);
            }
            return `import { ${iconList.join(', ')} } from "lucide-react"`;
        });
    }
    
    // Step 2: Check if item already exists
    if (!updatedMenu.includes(`href: "${routePath}"`)) {
        // Step 3: Add new menu item - find the last item and add after it
        const lastItemMatch = updatedMenu.match(/}\s*]\s*;?\s*$/);
        if (lastItemMatch) {
            const newItem = `,\n  {\n    name: "${componentName}",\n    href: "${routePath}",\n    icon: ${iconName}\n  }`;
            updatedMenu = updatedMenu.replace(/}\s*]\s*;?\s*$/, `}${newItem}\n];`);
        }
    }
    
    // Step 4: Complete reformat - extract parts and rebuild cleanly
    const importMatch = updatedMenu.match(/import\s*{([^}]+)}\s*from\s*["']lucide-react["']/);
    const interfaceMatch = updatedMenu.match(/(export\s+interface\s+MenuItem\s*{[^}]+})/);
    const menuItemsMatch = updatedMenu.match(/export\s+const\s+menuItems:\s*MenuItem\[\]\s*=\s*\[([\s\S]*?)\]\s*;?\s*$/);
    
    if (importMatch && interfaceMatch && menuItemsMatch) {
        const cleanImport = `import { ${importMatch[1].split(',').map(i => i.trim()).join(', ')} } from "lucide-react"`;
        const cleanInterface = `export interface MenuItem {
  name: string
  href: string
  icon: LucideIcon
}`;
        
        // Parse and clean menu items
        const itemsContent = menuItemsMatch[1];
        const itemRegex = /{[^}]+}/g;
        const items = itemsContent.match(itemRegex) || [];
        
        const cleanItems = items.map(item => {
            const nameMatch = item.match(/name:\s*"([^"]+)"/);
            const hrefMatch = item.match(/href:\s*"([^"]+)"/);
            const iconMatch = item.match(/icon:\s*(\w+)/);
            
            if (nameMatch && hrefMatch && iconMatch) {
                return `  {
    name: "${nameMatch[1]}",
    href: "${hrefMatch[1]}",
    icon: ${iconMatch[1]}
  }`;
            }
            return item;
        });
        
        const cleanMenuItems = `export const menuItems: MenuItem[] = [
${cleanItems.join(',\n')}
];`;
        
        updatedMenu = `${cleanImport}\n\n${cleanInterface}\n\n${cleanMenuItems}`;
    }

    return { router: updatedRouter, menu: updatedMenu };
}

// Test function for menu formatting
function testMenuFormatting() {
    const minifiedMenuInput = `import { CheckSquare, Home, LucideIcon } from "lucide-react"  export interface MenuItem {   name: string   href: string   icon: LucideIcon }  export const menuItems: MenuItem[] = [   {     name: "Home",     href: "/",     icon: Home   },   {     name: "Todo",     href: "/todo",     icon: CheckSquare   } ]`;

    const dummyRouterCode = `import React from 'react';`;
    
    const result = addModule(dummyRouterCode, minifiedMenuInput, './pages/Author', 'Author', '/author', 'File');
    
    console.log('=== Menu Input ===');
    console.log(minifiedMenuInput);
    
    console.log('\n=== Fixed Menu Output ===');
    console.log(result.menu);
    
    return result;
}

// Test with problematic input
function testWithMinifiedInput() {
    const problematicInput = `import React from "react"; import { BrowserRouter as Router, Route, Routes } from "react-router-dom"; import HomePage from "./components/HomePage"; import Todo from "./pages/Todo"; const App: React.FC = () => {   return (     <Router>       <Routes>         <Route path="/" element={<HomePage />} />         <Route path="/todo" element={<Todo />} />       </Routes>     </Router>   ); }; export default App;`;

    const menuInput = `import { CheckSquare, Home, LucideIcon } from "lucide-react"  export interface MenuItem {   name: string   href: string   icon: LucideIcon }  export const menuItems: MenuItem[] = [   {     name: "Home",     href: "/",     icon: Home   },   {     name: "Todo",     href: "/todo",     icon: CheckSquare   } ]`;

    const result = addModule(problematicInput, menuInput, './pages/Author', 'Author', '/author', 'File');
    
    console.log('=== Router Output ===');
    console.log(result.router);
    
    console.log('\n=== Menu Output ===');
    console.log(result.menu);
    
    return result;
}

// Uncomment to test
// testWithMinifiedInput();
// """
// Yes 👍
// Your code right now is **regex-driven**, which works until the input format changes slightly (extra spaces, different import style, multi-line routes, JSX quirks, etc.).

// If you switch to **AST-based parsing with Acorn (or Babel)**, you get a **structural representation** of the code instead of brittle regex matches. That means:

// * Imports are real `ImportDeclaration` nodes, not “lines matching `/import .../`”.
// * Routes are actual JSX AST nodes (`JSXElement`), not regex hacks.
// * Menu items are actual object expressions (`ObjectExpression`), not `{...}` substring matches.

// ---

// ### ⚡ How you’d improve this with Acorn (or better, Babel parser)

// ```js
// import * as parser from "@babel/parser";
// import traverse from "@babel/traverse";
// import generate from "@babel/generator";
// import * as t from "@babel/types";

// export function addModule(routerCode, menuCode, modulePath, componentName, routePath, iconName = "File") {
//   // ===== ROUTER HANDLING =====
//   const routerAst = parser.parse(routerCode, {
//     sourceType: "module",
//     plugins: ["jsx", "typescript"],
//   });

//   let hasImport = false;
//   let hasRoute = false;

//   traverse(routerAst, {
//     ImportDeclaration(path) {
//       if (path.node.specifiers.some(spec => spec.local.name === componentName)) {
//         hasImport = true;
//       }
//     },
//     JSXElement(path) {
//       const opening = path.node.openingElement;
//       if (t.isJSXIdentifier(opening.name, { name: "Route" })) {
//         const pathAttr = opening.attributes.find(
//           attr => t.isJSXAttribute(attr) && attr.name.name === "path"
//         );
//         if (pathAttr && pathAttr.value.value === routePath) {
//           hasRoute = true;
//         }
//       }
//     },
//   });

//   if (!hasImport) {
//     routerAst.program.body.unshift(
//       t.importDeclaration(
//         [t.importDefaultSpecifier(t.identifier(componentName))],
//         t.stringLiteral(modulePath)
//       )
//     );
//   }

//   if (!hasRoute) {
//     const newRoute = t.jsxElement(
//       t.jsxOpeningElement(
//         t.jsxIdentifier("Route"),
//         [
//           t.jsxAttribute(t.jsxIdentifier("path"), t.stringLiteral(routePath)),
//           t.jsxAttribute(
//             t.jsxIdentifier("element"),
//             t.jsxExpressionContainer(
//               t.jsxElement(
//                 t.jsxOpeningElement(t.jsxIdentifier(componentName), [], true),
//                 null,
//                 [],
//                 true
//               )
//             )
//           ),
//         ],
//         true
//       ),
//       null,
//       [],
//       true
//     );

//     traverse(routerAst, {
//       JSXElement(path) {
//         const opening = path.node.openingElement;
//         if (t.isJSXIdentifier(opening.name, { name: "Routes" })) {
//           path.node.children.push(newRoute);
//           path.stop();
//         }
//       },
//     });
//   }

//   const updatedRouter = generate(routerAst, { retainLines: true }).code;

//   // ===== MENU HANDLING =====
//   const menuAst = parser.parse(menuCode, {
//     sourceType: "module",
//     plugins: ["typescript"],
//   });

//   let iconImported = false;
//   traverse(menuAst, {
//     ImportDeclaration(path) {
//       if (path.node.source.value === "lucide-react") {
//         const already = path.node.specifiers.map(s => s.imported.name);
//         if (!already.includes(iconName)) {
//           path.node.specifiers.push(
//             t.importSpecifier(t.identifier(iconName), t.identifier(iconName))
//           );
//         }
//         iconImported = true;
//       }
//     },
//   });

//   traverse(menuAst, {
//     VariableDeclarator(path) {
//       if (path.node.id.name === "menuItems") {
//         const arr = path.node.init.elements;
//         const exists = arr.some(el =>
//           el.properties.some(
//             p =>
//               t.isObjectProperty(p) &&
//               p.key.name === "href" &&
//               p.value.value === routePath
//           )
//         );

//         if (!exists) {
//           arr.push(
//             t.objectExpression([
//               t.objectProperty(t.identifier("name"), t.stringLiteral(componentName)),
//               t.objectProperty(t.identifier("href"), t.stringLiteral(routePath)),
//               t.objectProperty(t.identifier("icon"), t.identifier(iconName)),
//             ])
//           );
//         }
//       }
//     },
//   });

//   const updatedMenu = generate(menuAst, { retainLines: true }).code;

//   return { router: updatedRouter, menu: updatedMenu };
// }
// ```

// ---

// ### 🔥 Benefits vs your regex approach:

// * **Resilient to formatting** (whitespace, line breaks, minified code, etc.)
// * **No accidental matches** (regex can mistake `importX` for `import`, or JSX `<RouteX>` for `<Route>`).
// * **Safe editing** → AST ensures code stays valid JavaScript/TypeScript.
// * **Scalable** → works even if your project grows, uses JSX/TSX, decorators, etc.

// ---

// """