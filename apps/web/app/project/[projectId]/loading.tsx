export default function ProjectLoading() {
  return (
    <div className="flex h-dvh flex-col" role="status" aria-label="Loading project">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="size-7 rounded-lg bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col gap-4 p-4 lg:w-[400px] lg:flex-none lg:border-r xl:w-[460px]">
          <div className="ml-auto h-12 w-2/3 animate-pulse rounded-lg bg-muted" />
          <div className="h-24 w-5/6 animate-pulse rounded-lg bg-muted" />
          <div className="mt-auto h-24 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="hidden flex-1 flex-col lg:flex">
          <div className="h-12 border-b" />
          <div className="m-4 flex-1 animate-pulse rounded-lg bg-muted/60" />
        </div>
      </div>
    </div>
  );
}
