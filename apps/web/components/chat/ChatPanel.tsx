"use client";

import type { MessageResponse, RunStatus } from "@repo/contracts";
import { AlertTriangle, Eye, FileMinus, FilePen, FilePlus, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Composer } from "@/components/Composer";
import { Markdown } from "@/components/chat/Markdown";
import { ToolCard } from "@/components/chat/ToolCard";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ComposerPayload } from "@/hooks/useMessages";
import type { StreamConnection } from "@/hooks/useRunStream";
import { imageDataUrl } from "@/lib/images";
import { buildChatEntries, type ChatBlock, type ChatEntry } from "@/lib/messages";
import type { LiveItem, LiveRunState } from "@/lib/runEvents";
import { cn } from "@/lib/utils";

export interface ChatPanelProps {
  messages: MessageResponse[] | undefined;
  messagesLoading: boolean;
  messagesError: string | null;
  onRetryMessages: () => void;
  activeRunId: string | null;
  live: LiveRunState;
  connection: StreamConnection;
  onReconnect: () => void;
  onSend: (payload: ComposerPayload) => Promise<boolean>;
  sending: boolean;
  onStop: () => void;
  stopping: boolean;
  onShowPreview: () => void;
}

export function ChatPanel(props: ChatPanelProps) {
  const { messages, activeRunId, live } = props;
  const entries = useMemo(() => buildChatEntries(messages ?? [], activeRunId), [messages, activeRunId]);
  const runActive = Boolean(activeRunId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [entries, live.items]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-busy={runActive}
          aria-label="Conversation"
          className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4"
        >
          {props.messagesLoading && !messages ? (
            <MessagesSkeleton />
          ) : props.messagesError && !messages ? (
            <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border p-4 text-sm">
              <p className="text-muted-foreground">{props.messagesError}</p>
              <Button size="sm" variant="outline" onClick={props.onRetryMessages}>
                Try again
              </Button>
            </div>
          ) : entries.length === 0 && !runActive ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tell the agent what to build or change.
            </p>
          ) : (
            entries.map((entry) => <MessageBubble key={entry.key} entry={entry} />)
          )}

          {runActive && (
            <LiveRun
              live={live}
              connection={props.connection}
              onReconnect={props.onReconnect}
              onShowPreview={props.onShowPreview}
            />
          )}
        </div>
      </div>

      <div className="shrink-0 border-t bg-background/95 p-2 sm:p-3">
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            label="Message the agent"
            placeholder={runActive ? "The agent is working…" : "Ask for a change, report a bug, attach a screenshot…"}
            submitLabel="Send"
            busy={props.sending}
            sendDisabled={runActive}
            sendDisabledReason="Wait for the agent to finish, or stop it."
            onSubmit={props.onSend}
            onStop={runActive ? props.onStop : undefined}
            stopping={props.stopping}
          />
        </div>
      </div>
    </div>
  );
}

function MessagesSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-4">
      <span className="sr-only">Loading conversation</span>
      <div className="ml-auto h-12 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-24 w-5/6 animate-pulse rounded-lg bg-muted" />
      <div className="h-9 w-3/4 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function MessageBubble({ entry }: { entry: ChatEntry }) {
  const isUser = entry.role === "USER";
  return (
    <article
      aria-label={isUser ? "You" : "Agent"}
      className={cn("flex flex-col gap-2", isUser ? "items-end" : "items-stretch", entry.optimistic && "opacity-70")}
    >
      {entry.blocks.map((block) => (
        <BlockView key={block.key} block={block} isUser={isUser} />
      ))}
    </article>
  );
}

function BlockView({ block, isUser }: { block: ChatBlock; isUser: boolean }) {
  switch (block.kind) {
    case "text":
      return isUser ? (
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-secondary px-3.5 py-2 text-sm">
          {block.text}
        </p>
      ) : (
        <Markdown>{block.text}</Markdown>
      );
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageDataUrl(block.image)}
          alt="Attached image"
          className="max-h-40 max-w-[60%] rounded-lg border object-contain"
        />
      );
    case "tool":
      return <ToolCard name={block.name} input={block.input} result={block.result} />;
  }
}

const STATUS_LABEL: Partial<Record<RunStatus, string>> = {
  QUEUED: "Queued — waiting for an agent",
  RUNNING: "Working",
  SUCCEEDED: "Finished",
  FAILED: "Failed",
  CANCELLED: "Stopped",
};

function LiveRun({
  live,
  connection,
  onReconnect,
  onShowPreview,
}: {
  live: LiveRunState;
  connection: StreamConnection;
  onReconnect: () => void;
  onShowPreview: () => void;
}) {
  const status = live.status ?? "QUEUED";
  const done = status === "SUCCEEDED" || status === "FAILED" || status === "CANCELLED";

  return (
    <section aria-label="Agent activity" className="flex flex-col gap-2">
      {live.items.map((item, i) => (
        <LiveItemView
          key={item.key}
          item={item}
          streaming={!done && i === live.items.length - 1}
          onShowPreview={onShowPreview}
        />
      ))}

      {live.finalError && status === "FAILED" && !live.items.some((i) => i.kind === "error") && (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>{live.finalError}</p>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {connection === "failed" ? (
          <>
            <AlertTriangle className="size-3.5 text-warning" aria-hidden />
            <span>Lost connection to the agent.</span>
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onReconnect}>
              <RefreshCw aria-hidden /> Reconnect
            </Button>
          </>
        ) : (
          <>
            {!done && <Spinner className="size-3.5" />}
            <span role="status">
              {connection === "reconnecting" ? "Reconnecting…" : STATUS_LABEL[status]}
              {live.model && status === "RUNNING" ? ` · ${live.model}` : ""}
            </span>
          </>
        )}
      </div>
    </section>
  );
}

const FILE_ICONS = { write: FilePlus, edit: FilePen, delete: FileMinus } as const;

function LiveItemView({
  item,
  streaming,
  onShowPreview,
}: {
  item: LiveItem;
  streaming: boolean;
  onShowPreview: () => void;
}) {
  switch (item.kind) {
    case "text":
      return (
        <div>
          <Markdown>{item.text}</Markdown>
          {streaming && (
            <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-caret-blink bg-primary align-text-bottom" />
          )}
        </div>
      );
    case "tool":
      return (
        <ToolCard name={item.name} input={item.input} result={item.result} exitCode={item.exitCode} pending />
      );
    case "file": {
      const Icon = FILE_ICONS[item.action as keyof typeof FILE_ICONS] ?? FilePen;
      return (
        <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden />
          <span>{item.action === "write" ? "Wrote" : item.action === "delete" ? "Deleted" : "Edited"}</span>
          <code className="truncate font-mono text-foreground">{item.path}</code>
        </p>
      );
    }
    case "preview":
      return (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <Eye className="size-3.5 text-primary" aria-hidden />
          <span className="flex-1">
            Preview is live{item.port ? ` on port ${item.port}` : ""}
            {item.path && item.path !== "/" ? ` at ${item.path}` : ""}.
          </span>
          <Button size="sm" variant="outline" className="h-7" onClick={onShowPreview}>
            Show preview
          </Button>
        </div>
      );
    case "error":
      return (
        <div role="alert" className="flex gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p className="break-words">{item.message}</p>
        </div>
      );
  }
}
