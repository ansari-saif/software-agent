export const STACK_GUIDES: Record<string, { title: string; content: string }> = {
  "static-web": {
    title: "Static HTML/CSS/JS Application",
    content: [
      "Create index.html, styles, and scripts in the workspace root or a public/ directory.",
      "Serve with Python (`python3 -m http.server 3000 --bind 0.0.0.0`) or `npx serve -l tcp://0.0.0.0:3000` via `start_process`.",
      "Call `set_preview` with the chosen port once listening.",
    ].join("\n"),
  },
  "vite-react": {
    title: "Vite + React / TypeScript",
    content: [
      "Configure `vite.config.ts` with `server: { host: '0.0.0.0', port: 5173, allowedHosts: true }` so the reverse proxy can reach the dev server.",
      "Install dependencies with `pnpm install` or `npm install --no-fund`, verify build with `npm run build`, then launch via `start_process` and call `set_preview({ port: 5173, path: '/' })`.",
    ].join("\n"),
  },
  "python-web": {
    title: "Python Web App (Flask / FastAPI)",
    content: [
      "Bind the HTTP server to `0.0.0.0` on your chosen port (e.g. 8000).",
      "Start the server with `start_process` and call `set_preview({ port: 8000, path: '/' })`.",
    ].join("\n"),
  },
  "fullstack-custom": {
    title: "Multi-process or Full-Stack Applications",
    content: [
      "You can run both a backend server and a frontend server or serve the frontend from the backend.",
      "Use relative `/api` paths with a dev server proxy or configure CORS cleanly.",
      "Register the user-facing port with `set_preview`.",
    ].join("\n"),
  },
};

export function listGuideNames(): string[] {
  return Object.keys(STACK_GUIDES);
}

export function getGuideContent(name: string): string | null {
  const guide = STACK_GUIDES[name];
  if (!guide) return null;
  return `# ${guide.title}\n\n${guide.content}`;
}
