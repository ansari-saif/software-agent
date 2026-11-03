import { HomeComposer } from "@/components/HomeComposer";
import { SiteHeader } from "@/components/SiteHeader";

export default function HomePage() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-atmosphere">
      <SiteHeader className="border-transparent bg-transparent backdrop-blur-none" />
      <main
        id="main"
        className="flex flex-1 flex-col justify-center px-4 pb-16 pt-8 sm:px-8 md:pb-24 lg:px-12"
      >
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12 duration-500 animate-in fade-in slide-in-from-bottom-2">
          <div className="lg:col-span-7">
            <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Describe any app. <span className="text-primary">Watch it get built.</span>
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              One agent writes the code, runs it in a private sandbox, and shows you a live preview
              while it works.
            </p>
            <div className="mt-8 sm:mt-10 max-w-2xl">
              <HomeComposer />
            </div>
          </div>

          <figure
            aria-label="Live sandbox session preview"
            className="lg:col-span-5 overflow-hidden rounded-xl border bg-surface shadow-2xl shadow-black/50"
          >
            <div className="flex items-center justify-between border-b bg-surface-raised px-4 py-2.5 font-mono text-xs text-muted-foreground">
              <span>sandbox · 0.0.0.0:5173</span>
              <span className="inline-flex items-center gap-1.5 text-success">
                <span className="size-1.5 rounded-full bg-success" />
                RUNNING
              </span>
            </div>
            <div className="space-y-3 p-4 font-mono text-xs">
              <div className="text-muted-foreground">
                <span className="text-primary">$</span> pnpm run dev --host 0.0.0.0 --port 5173
              </div>
              <div className="space-y-1.5 rounded-md border bg-background/70 p-3 text-[11px] leading-relaxed">
                <div className="text-foreground">
                  write_file <span className="text-muted-foreground">src/App.tsx</span>
                </div>
                <div className="text-foreground">
                  run_command <span className="text-muted-foreground">vitest run</span>
                </div>
                <div className="text-success">set_preview → http://0.0.0.0:5173/</div>
              </div>
            </div>
          </figure>
        </div>
      </main>
    </div>
  );
}
