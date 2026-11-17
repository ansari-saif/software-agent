"use client";

import type { ImageBlock } from "@repo/contracts";
import { ArrowUp, ImagePlus, Square, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ComposerPayload } from "@/hooks/useMessages";
import { MAX_IMAGES_PER_MESSAGE, imageDataUrl, readImageFile } from "@/lib/images";
import { cn } from "@/lib/utils";

function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True on touch-first devices, where Enter should insert a newline. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false
  );
}

export interface ComposerProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (payload: ComposerPayload) => Promise<boolean>;
  busy?: boolean;
  /** Prevents sending (e.g. while a run is active) without disabling typing. */
  sendDisabled?: boolean;
  sendDisabledReason?: string;
  onStop?: () => void;
  stopping?: boolean;
  variant?: "hero" | "compact";
  autoFocus?: boolean;
  visibleLabel?: boolean;
  /** Lets the primary action run before there is a prompt. Used for Google sign-in. */
  allowEmptySubmit?: boolean;
}

export function Composer({
  label,
  placeholder,
  submitLabel,
  onSubmit,
  busy = false,
  sendDisabled = false,
  sendDisabledReason,
  onStop,
  stopping = false,
  variant = "compact",
  autoFocus = false,
  visibleLabel = false,
  allowEmptySubmit = false,
}: ComposerProps) {
  const id = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageBlock[]>([]);
  const [dragging, setDragging] = useState(false);
  const coarse = useCoarsePointer();

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, variant === "hero" ? 320 : 240)}px`;
  }, [variant]);

  useEffect(resize, [prompt, resize]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const room = MAX_IMAGES_PER_MESSAGE - images.length;
      if (room <= 0) {
        toast.error(`You can attach up to ${MAX_IMAGES_PER_MESSAGE} images.`);
        return;
      }
      if (files.length > room) toast.error(`Only ${room} more image${room === 1 ? "" : "s"} can be attached.`);
      const results = await Promise.all(files.slice(0, room).map(readImageFile));
      const added: ImageBlock[] = [];
      for (const r of results) {
        if (r.ok) added.push(r.image);
        else toast.error(r.error);
      }
      if (added.length) setImages((prev) => [...prev, ...added].slice(0, MAX_IMAGES_PER_MESSAGE));
    },
    [images.length]
  );

  const trimmed = prompt.trim();
  const canSend = !busy && !sendDisabled && (allowEmptySubmit || trimmed.length > 0 || images.length > 0);

  async function submit() {
    if (!canSend) return;
    const ok = await onSubmit({ prompt: trimmed, images });
    if (ok) {
      setPrompt("");
      setImages([]);
      textareaRef.current?.focus();
    }
  }

  const hintId = `${id}-hint`;
  const showStop = Boolean(onStop);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
      className={cn(
        "group relative flex flex-col rounded-xl border bg-surface/90 shadow-lg transition-colors focus-within:border-ring/60",
        dragging && "border-primary ring-2 ring-primary/40",
        variant === "hero" && "rounded-2xl shadow-2xl shadow-black/40"
      )}
    >
      <label htmlFor={`${id}-input`} className={visibleLabel ? "px-4 pt-3 text-sm font-medium" : "sr-only"}>
        {label}
      </label>

      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attached images">
          {images.map((img, i) => (
            <li key={`${i}-${img.base64.length}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUrl(img)}
                alt={`Attachment ${i + 1}`}
                className="size-16 rounded-md border object-cover"
              />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border bg-popover text-foreground hover:bg-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove attachment ${i + 1}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        ref={textareaRef}
        id={`${id}-input`}
        value={prompt}
        rows={variant === "hero" ? 3 : 2}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-describedby={hintId}
        onChange={(e) => setPrompt(e.target.value)}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (files.length) {
            e.preventDefault();
            void addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            (e.metaKey || e.ctrlKey || (!e.shiftKey && !coarse))
          ) {
            e.preventDefault();
            void submit();
          }
        }}
        className={cn(
          "w-full resize-none bg-transparent px-4 pt-3 text-foreground placeholder:text-muted-foreground focus:outline-none",
          variant === "hero" ? "min-h-[96px] text-base" : "min-h-[56px] text-sm"
        )}
      />

      <div className="flex items-center gap-2 px-2 pb-2 pt-1">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Attach images"
          disabled={images.length >= MAX_IMAGES_PER_MESSAGE}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus aria-hidden />
        </Button>
        <p id={hintId} className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {sendDisabled && sendDisabledReason
            ? sendDisabledReason
            : coarse
              ? "Paste or attach up to 4 images"
              : "Enter to send · Shift+Enter for a new line"}
        </p>
        {showStop ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onStop}
            disabled={stopping}
            aria-label="Stop active run"
          >
            {stopping ? <Spinner /> : <Square className="fill-current" aria-hidden />}
            Stop
          </Button>
        ) : null}
        <Button
          type="submit"
          size={variant === "hero" ? "default" : "sm"}
          disabled={!canSend}
        >
          {busy ? <Spinner label="Sending" /> : <ArrowUp aria-hidden />}
          <span className={variant === "hero" ? "" : "sr-only sm:not-sr-only"}>{submitLabel}</span>
        </Button>
      </div>
    </form>
  );
}
