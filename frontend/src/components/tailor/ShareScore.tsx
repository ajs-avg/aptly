"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { SPRING } from "@/components/motion/primitives";

/**
 * The score, as something worth showing somebody.
 *
 * Drawn on a canvas rather than screenshotted from the page, so the card is
 * composed for sharing — the number huge, the movement explicit, the wordmark
 * quiet — and identical on every phone. Brand ink on brand paper; no dark-mode
 * variant, because a shared image lands in feeds that are both.
 */

const PAPER = "#fbfbfa";
const MIST = "#f2f2f0";
const INK = "#16181d";
const SLATE = "#5c6270";
const SIGNAL = "#14655c";
const SIGNAL_SOFT = "#e3efec";

const SIZE = 1080;

export function ShareScore({
  score,
  baseline,
  role,
  company,
}: {
  score: number;
  baseline: number;
  role?: string | null;
  company?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-pill px-4 font-display text-xs font-medium text-signal ring-1 ring-signal/25 transition-colors hover:bg-signal-soft"
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0-12L8 7m4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
        Share your score
      </button>

      <AnimatePresence>
        {open && (
          <ShareDialog
            score={score}
            baseline={baseline}
            role={role}
            company={company}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function ShareDialog({
  score,
  baseline,
  role,
  company,
  onClose,
}: {
  score: number;
  baseline: number;
  role?: string | null;
  company?: string | null;
  onClose: () => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    draw(ctx, { score, baseline, role, company });
    canvas.toBlob((blob) => {
      if (!blob) return;
      blobRef.current = blob;
      setImage(URL.createObjectURL(blob));
    }, "image/png");

    return () => {
      if (blobRef.current) blobRef.current = null;
    };
  }, [score, baseline, role, company]);

  const download = () => {
    if (!image) return;
    const link = document.createElement("a");
    link.href = image;
    link.download = "aptly-score.png";
    link.click();
  };

  const share = async () => {
    const blob = blobRef.current;
    if (!blob) return;
    const file = new File([blob], "aptly-score.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Aptly score" });
        return;
      }
    } catch {
      // Cancelled, or unsupported — the download button is right there.
    }
    download();
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Share your score"
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={SPRING}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-raised shadow-hero ring-1 ring-ink/10"
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={`Match score ${score} percent, up from ${baseline} percent`}
              className="w-full rounded-xl ring-1 ring-ink/10"
            />
          ) : (
            <div className="grid aspect-square place-items-center text-sm text-slate">
              Composing…
            </div>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-pill px-4 font-display text-sm text-slate transition-colors hover:bg-sunken hover:text-ink"
          >
            Close
          </button>
          <button
            type="button"
            onClick={download}
            className="inline-flex h-9 items-center rounded-pill px-4 font-display text-sm text-ink ring-1 ring-ink/10 transition-colors hover:bg-sunken"
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex h-9 items-center rounded-pill bg-signal px-5 font-display text-sm font-medium text-paper transition-colors hover:bg-signal-hover"
          >
            Share
          </button>
        </footer>
      </motion.div>
    </>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  { score, baseline, role, company }: {
    score: number;
    baseline: number;
    role?: string | null;
    company?: string | null;
  },
) {
  const ui = (weight: number, px: number) =>
    `${weight} ${px}px -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;

  // Ground.
  ctx.fillStyle = MIST;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // The card the number sits on, with a soft edge.
  const margin = 72;
  ctx.fillStyle = PAPER;
  roundRect(ctx, margin, margin, SIZE - margin * 2, SIZE - margin * 2, 48);
  ctx.fill();
  ctx.strokeStyle = "rgba(22,24,29,0.08)";
  ctx.lineWidth = 2;
  roundRect(ctx, margin, margin, SIZE - margin * 2, SIZE - margin * 2, 48);
  ctx.stroke();

  // Wordmark.
  ctx.fillStyle = INK;
  ctx.font = ui(700, 44);
  ctx.textAlign = "left";
  ctx.fillText("Aptly", margin + 64, margin + 104);
  ctx.fillStyle = SLATE;
  ctx.font = ui(400, 30);
  ctx.fillText("CV match, measured", margin + 64, margin + 148);

  // The ring.
  const cx = SIZE / 2;
  const cy = SIZE / 2 + 10;
  const radius = 210;
  const start = -Math.PI / 2;

  ctx.lineCap = "round";
  ctx.strokeStyle = SIGNAL_SOFT;
  ctx.lineWidth = 34;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = SIGNAL;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + (Math.PI * 2 * Math.min(score, 100)) / 100);
  ctx.stroke();

  // The number.
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.font = ui(700, 190);
  ctx.fillText(`${score}%`, cx, cy + 46);
  ctx.fillStyle = SLATE;
  ctx.font = ui(500, 34);
  ctx.fillText("R E Q U I R E M E N T S   M E T", cx, cy + 116);

  // The movement — the reason to share at all.
  if (score > baseline) {
    ctx.fillStyle = SIGNAL;
    ctx.font = ui(600, 46);
    ctx.fillText(`was ${baseline}% before tailoring`, cx, cy + radius + 116);
  }

  // The job, quietly.
  const jobLine = [role, company].filter(Boolean).join(" · ");
  if (jobLine) {
    ctx.fillStyle = SLATE;
    ctx.font = ui(400, 32);
    ctx.fillText(jobLine.slice(0, 60), cx, margin + 148 + 76);
  }

  // The way in.
  ctx.fillStyle = SLATE;
  ctx.font = ui(500, 32);
  ctx.fillText("aptly-psi.vercel.app", cx, SIZE - margin - 64);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
