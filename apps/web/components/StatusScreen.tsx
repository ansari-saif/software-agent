import { SiteHeader } from "@/components/SiteHeader";

export function StatusScreen({
  code,
  title,
  description,
  actions,
}: {
  code?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-atmosphere">
      <SiteHeader className="border-transparent bg-transparent" />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          {code && <p className="font-mono text-sm text-primary">{code}</p>}
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-muted-foreground">{description}</p>
          {actions && <div className="mt-8 flex flex-wrap justify-center gap-2">{actions}</div>}
        </div>
      </main>
    </div>
  );
}
