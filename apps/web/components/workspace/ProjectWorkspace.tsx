"use client";

import type { MessageResponse, ProjectResponse, SandboxSessionResponse } from "@repo/contracts";
import { Code2, Eye, MessageSquare, Terminal } from "lucide-react";
import { notFound, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { SiteHeader } from "@/components/SiteHeader";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogsPanel } from "@/components/workspace/LogsPanel";
import { ProjectSettingsDialog } from "@/components/workspace/ProjectSettingsDialog";
import { PanelMessage, SandboxError, SandboxFrame } from "@/components/workspace/SandboxFrame";
import { useMessages, useSendMessage, type ComposerPayload } from "@/hooks/useMessages";
import { useProjectActions } from "@/hooks/useProjectMutations";
import { useInvalidateProjects, useProject } from "@/hooks/useProjects";
import { useRunStream } from "@/hooks/useRunStream";
import { useSandbox } from "@/hooks/useSandbox";
import { ApiError, errorMessage } from "@/lib/api";
import { deriveCommandLogs } from "@/lib/messages";
import { isActiveStatus } from "@/lib/runEvents";
import { cn } from "@/lib/utils";

type WorkspaceTab = "preview" | "code" | "logs";
type MobileView = "chat" | WorkspaceTab;

const PREVIEW_SANDBOX = "allow-scripts allow-forms allow-same-origin allow-popups";

const MOBILE_VIEWS: { value: MobileView; label: string; icon: typeof Eye }[] = [
  { value: "chat", label: "Chat", icon: MessageSquare },
  { value: "preview", label: "Preview", icon: Eye },
  { value: "code", label: "Code", icon: Code2 },
  { value: "logs", label: "Logs", icon: Terminal },
];

function isMissing(err: unknown) {
  return err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN");
}

export function ProjectWorkspace({
  projectId,
  initialProject,
}: {
  projectId: string;
  initialProject?: ProjectResponse;
}) {
  const projectQ = useProject(projectId, initialProject);
  const messagesQ = useMessages(projectId);
  const sendMessage = useSendMessage(projectId);
  const invalidateProjects = useInvalidateProjects();
  const { cancelRun } = useProjectActions(projectId);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const panelParam = searchParams.get("panel");
  const initialTab: WorkspaceTab =
    panelParam === "code" || panelParam === "logs" ? panelParam : "preview";

  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [showWorkspaceOnMobile, setShowWorkspaceOnMobile] = useState(
    panelParam === "preview" || panelParam === "code" || panelParam === "logs"
  );
  const [codeOpened, setCodeOpened] = useState(initialTab === "code");
  const [previewSeen, setPreviewSeen] = useState(false);
  const [previewReload, setPreviewReload] = useState(0);
  const [finishedRuns, setFinishedRuns] = useState<ReadonlySet<string>>(() => new Set());
  const [sending, setSending] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);

  if (isMissing(projectQ.error) || isMissing(messagesQ.error)) notFound();

  const project = projectQ.data;
  const reportedRun = messagesQ.data?.activeRun;
  const activeRunId =
    reportedRun && isActiveStatus(reportedRun.status) && !finishedRuns.has(reportedRun.id)
      ? reportedRun.id
      : null;

  const previewAvailable = previewSeen || project?.previewPort != null;
  const sandbox = useSandbox(projectId, codeOpened || previewAvailable);

  const stream = useRunStream(activeRunId, {
    onEvent: (event) => {
      if (event.type === "preview") {
        setPreviewSeen(true);
        void projectQ.mutate();
        void sandbox.refresh().then(() => setPreviewReload((n) => n + 1));
      }
    },
    onDone: async (event) => {
      try {
        await messagesQ.mutate();
      } finally {
        setFinishedRuns((prev) => new Set(prev).add(event.runId));
        void projectQ.mutate();
        void invalidateProjects();
      }
    },
  });

  const logs = useMemo(() => {
    const persisted: MessageResponse[] = (messagesQ.data?.items ?? []).filter(
      (m) => !(activeRunId && m.runId === activeRunId)
    );
    return [...deriveCommandLogs(persisted), ...(activeRunId ? stream.live.logs : [])];
  }, [messagesQ.data, activeRunId, stream.live.logs]);

  function selectTab(next: WorkspaceTab) {
    setTab(next);
    if (next === "code") setCodeOpened(true);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("panel", next);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }

  function selectMobileView(view: MobileView) {
    if (view === "chat") {
      setShowWorkspaceOnMobile(false);
    } else {
      setShowWorkspaceOnMobile(true);
      selectTab(view);
    }
  }

  async function handleSend(payload: ComposerPayload) {
    setSending(true);
    try {
      await sendMessage(payload);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  }

  async function handleStop() {
    if (!activeRunId) return;
    setStoppingRunId(activeRunId);
    try {
      await cancelRun(activeRunId);
    } catch (err) {
      setStoppingRunId(null);
      toast.error(errorMessage(err));
    }
  }

  const mobileView: MobileView = showWorkspaceOnMobile ? tab : "chat";

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader>
        {project ? (
          <h1 className="min-w-0 truncate text-sm font-medium" title={project.name}>
            {project.name}
          </h1>
        ) : (
          <div className="h-4 w-32 animate-pulse rounded bg-muted" aria-hidden />
        )}
        {activeRunId && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
            <Spinner className="size-3" />
            <span className="hidden sm:inline">Agent working</span>
            <span className="sr-only sm:hidden">Agent working</span>
          </span>
        )}
        {project && <ProjectSettingsDialog project={project} />}
      </SiteHeader>

      <nav aria-label="Workspace view" className="shrink-0 border-b p-2 lg:hidden">
        <div className="grid grid-cols-4 gap-1 rounded-lg border bg-surface p-1">
          {MOBILE_VIEWS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={mobileView === value}
              onClick={() => selectMobileView(value)}
              className={cn(
                "flex h-8 items-center justify-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mobileView === value && "bg-accent text-foreground"
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main id="main" className="flex min-h-0 flex-1">
        <section
          aria-label="Chat"
          className={cn(
            "min-h-0 flex-col lg:flex lg:w-[400px] lg:flex-none lg:border-r xl:w-[460px]",
            showWorkspaceOnMobile ? "hidden" : "flex flex-1"
          )}
        >
          <ChatPanel
            messages={messagesQ.data?.items}
            messagesLoading={messagesQ.isLoading}
            messagesError={messagesQ.error ? errorMessage(messagesQ.error) : null}
            onRetryMessages={() => void messagesQ.mutate()}
            activeRunId={activeRunId}
            live={stream.live}
            connection={stream.connection}
            onReconnect={stream.retry}
            onSend={handleSend}
            sending={sending}
            onStop={() => void handleStop()}
            stopping={stoppingRunId !== null && stoppingRunId === activeRunId}
            onShowPreview={() => selectMobileView("preview")}
          />
        </section>

        <section
          aria-label="Workspace"
          className={cn("min-h-0 min-w-0 flex-1 flex-col", showWorkspaceOnMobile ? "flex" : "hidden lg:flex")}
        >
          <Tabs
            value={tab}
            onValueChange={(v) => selectTab(v as WorkspaceTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="hidden h-12 shrink-0 items-center border-b px-3 lg:flex">
              <TabsList aria-label="Workspace">
                <TabsTrigger value="preview">
                  <Eye aria-hidden /> Preview
                </TabsTrigger>
                <TabsTrigger value="code">
                  <Code2 aria-hidden /> Code
                </TabsTrigger>
                <TabsTrigger value="logs">
                  <Terminal aria-hidden /> Logs
                  {logs.length > 0 && (
                    <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                      {logs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
              {!previewAvailable ? (
                <PanelMessage icon={<Eye className="size-6 text-muted-foreground" aria-hidden />} title="No preview yet">
                  When the agent starts your app, a live preview appears here.
                </PanelMessage>
              ) : (
                <SandboxView
                  session={sandbox.session}
                  error={sandbox.error}
                  onRetry={() => void sandbox.refresh()}
                  render={(s) =>
                    s.previewUrl ? (
                      <SandboxFrame
                        src={s.previewUrl}
                        title="App preview"
                        sandbox={PREVIEW_SANDBOX}
                        toolbar
                        reloadKey={previewReload}
                        onReload={() => setPreviewReload((n) => n + 1)}
                      />
                    ) : (
                      <PanelMessage icon={<Eye className="size-6 text-muted-foreground" aria-hidden />} title="Preview isn't running">
                        Ask the agent to start the app and the preview will appear here.
                      </PanelMessage>
                    )
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="code" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
              {codeOpened && (
                <SandboxView
                  session={sandbox.session}
                  error={sandbox.error}
                  onRetry={() => void sandbox.refresh()}
                  render={(s) => (
                    <SandboxFrame src={s.ideUrl} title="Code editor" allow="clipboard-read; clipboard-write" />
                  )}
                />
              )}
            </TabsContent>

            <TabsContent value="logs" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
              <LogsPanel logs={logs} />
            </TabsContent>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

function SandboxView({
  session,
  error,
  onRetry,
  render,
}: {
  session: SandboxSessionResponse | undefined;
  error: unknown;
  onRetry: () => void;
  render: (session: SandboxSessionResponse) => React.ReactNode;
}) {
  if (error && !session) return <SandboxError message={errorMessage(error)} onRetry={onRetry} />;
  if (!session || session.status === "STARTING") {
    return (
      <PanelMessage busy title="Starting your sandbox…">
        This can take up to a minute the first time.
      </PanelMessage>
    );
  }
  if (session.status === "ERROR" || session.status === "STOPPED") {
    return (
      <SandboxError
        message={session.status === "STOPPED" ? "The sandbox was stopped." : "The sandbox failed to start."}
        onRetry={onRetry}
      />
    );
  }
  return <>{render(session)}</>;
}
