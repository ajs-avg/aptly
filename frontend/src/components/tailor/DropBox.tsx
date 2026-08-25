"use client";

import { useCallback, useId, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn, formatBytes, motionTokens } from "@/lib/utils";

interface Props {
  label: string;
  hint: string;
  placeholder: string;
  /** Files are only offered where they make sense — a job post is always text. */
  accept?: string;
  value: string;
  onTextChange: (text: string) => void;
  onFile?: (file: File) => void;
  file?: File | null;
  onClearFile?: () => void;
  busy?: boolean;
  error?: string | null;
  emphasis?: boolean;
  footer?: React.ReactNode;
}

/**
 * One half of the two-box hero.
 *
 * The design doc's core loop is "drop, see, apply", and the first screen *is*
 * that loop — the thesis shown rather than told. So this accepts a drop, a
 * paste or a click with equal weight, and asks for nothing else.
 */
export function DropBox({
  label,
  hint,
  placeholder,
  accept,
  value,
  onTextChange,
  onFile,
  file,
  onClearFile,
  busy = false,
  error = null,
  emphasis = false,
  footer,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped && onFile) onFile(dropped);
    },
    [onFile],
  );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-lg bg-raised ring-1 transition-all duration-200",
        dragging ? "ring-2 ring-signal" : "ring-hairline",
        emphasis ? "shadow-lifted" : "shadow-raised",
      )}
      onDragOver={(event) => {
        if (!onFile) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-baseline justify-between gap-3 px-4 pt-3.5">
        <label
          htmlFor={id}
          className="font-display text-2xs font-medium uppercase tracking-[0.07em] text-ink"
        >
          {label}
        </label>
        <span className="text-2xs text-slate">{hint}</span>
      </div>

      {file ? (
        <div className="flex flex-1 flex-col justify-center px-4 py-6">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: motionTokens.base,
              ease: motionTokens.easeOut,
            }}
            className="flex items-center gap-3 rounded-xl bg-signal-soft px-3.5 py-3"
          >
            <FileMark />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-medium text-ink">
                {file.name}
              </p>
              <p className="text-2xs text-slate" data-numeric>
                {formatBytes(file.size)}
              </p>
            </div>
            {onClearFile && (
              <button
                type="button"
                onClick={onClearFile}
                className="rounded-pill px-2.5 py-1 font-display text-2xs text-slate transition-colors hover:bg-paper hover:text-ink"
              >
                Replace
              </button>
            )}
          </motion.div>
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col">
          <textarea
            id={id}
            value={value}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
            disabled={busy}
            className={cn(
              "flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-ink",
              "placeholder:text-slate/55 focus:outline-none disabled:opacity-50",
              // Capped against the window as well as floored at a usable size.
              // A 15rem box is right on a laptop and is most of a phone held
              // sideways — two of them stacked there leave no room to see the
              // button that acts on them.
              emphasis
                ? "min-h-[min(15rem,42dvh)]"
                : "min-h-[min(11rem,32dvh)]",
            )}
          />

          {onFile && !value && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 pb-3">
              <span className="text-2xs text-slate/70">or</span>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="pointer-events-auto rounded-xs px-2 py-1 font-display text-2xs text-signal underline decoration-signal/30 underline-offset-2 transition-colors hover:bg-signal-soft hover:decoration-signal"
              >
                choose a file
              </button>
            </div>
          )}
        </div>
      )}

      {onFile && (
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (chosen) onFile(chosen);
            event.target.value = "";
          }}
        />
      )}

      {error && (
        <p className="border-t border-hairline px-4 py-2 text-2xs leading-relaxed text-danger">
          {error}
        </p>
      )}
      {footer && (
        <div className="border-t border-hairline px-4 py-2">{footer}</div>
      )}
    </div>
  );
}

/* A small custom mark rather than a generic icon set: three lines and a fold,
   which is what a CV looks like at 20 pixels. */
function FileMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M5 2.5h6.5L16 7v10.5H5z"
        stroke="var(--color-signal)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 2.5V7H16"
        stroke="var(--color-signal)"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.5h5M7.5 13h5M7.5 8h2"
        stroke="var(--color-signal)"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
