"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { SPRING } from "@/components/motion/primitives";

/**
 * The score, as something worth showing somebody.
 *
 * Drawn on a canvas rather than screenshotted from the page, so the card is
 * composed for sharing and identical on every phone — but drawn with the
 * product's own hands: the real Poppins and Plex the pages set, the paper
 * sheets from the landing scene scattered behind, the signal green doing the
 * one loud thing it does everywhere else. A share card in a different voice
 * than the app is an ad for some other product.
 *
 * One light look on purpose. A shared image lands in feeds that are light and
 * dark both, and the brand's ground is paper.
 */

const PAPER = "#fbfbfa";
const MIST = "#f2f2f0";
const SUNKEN = "#f3f3f1";
const INK = "#16181d";
const SLATE = "#5c6270";
const SIGNAL = "#14655c";
const SIGNAL_BRIGHT = "#2f9e8f";
const SIGNAL_SOFT = "#e3efec";
const AMBER_SOFT = "#f5e9d4";
const HAIRLINE = "rgba(22,24,29,0.08)";

const SIZE = 1080;

interface Fonts {
  display: string;
  body: string;
  mono: string;
}

/** The families the pages actually loaded, read off the root element. */
function brandFonts(): Fonts {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    display: read("--font-geist", "Geist, sans-serif"),
    body: read("--font-inter", "Inter, sans-serif"),
    mono: read("--font-jetbrains", "'JetBrains Mono', monospace"),
  };
}

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
    let cancelled = false;

    void (async () => {
      // The composition depends on the brand fonts being resident; drawing
      // before they load falls back to system faces and the card comes out
      // in somebody else's handwriting.
      try {
        await document.fonts.ready;
      } catch {
        // Unsupported — the fallback families still draw something sane.
      }
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      draw(ctx, { score, baseline, role, company, fonts: brandFonts() });
      canvas.toBlob((blob) => {
        if (!blob || cancelled) return;
        blobRef.current = blob;
        setImage(URL.createObjectURL(blob));
      }, "image/png");
    })();

    return () => {
      cancelled = true;
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

/* ── The composition ──────────────────────────────────────────────────────── */

function draw(
  ctx: CanvasRenderingContext2D,
  {
    score,
    baseline,
    role,
    company,
    fonts,
  }: {
    score: number;
    baseline: number;
    role?: string | null;
    company?: string | null;
    fonts: Fonts;
  },
) {
  // Ground: the landing scene in miniature — mist, with the paper sheets
  // drifting behind the card.
  ctx.fillStyle = MIST;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const sheets: Array<[number, number, number, string]> = [
    [60, 130, -12, SIGNAL_SOFT],
    [900, 90, 9, AMBER_SOFT],
    [-20, 620, -7, AMBER_SOFT],
    [960, 560, 12, SIGNAL_SOFT],
    [120, 900, 7, SIGNAL_SOFT],
    [860, 900, -10, AMBER_SOFT],
  ];
  for (const [x, y, deg, accent] of sheets) sheet(ctx, x, y, deg, accent);

  // The card everything sits on.
  const card = { x: 110, y: 120, w: 860, h: 840, r: 44 };
  ctx.save();
  ctx.shadowColor = "rgba(22,24,29,0.14)";
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 26;
  ctx.fillStyle = PAPER;
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  roundRect(ctx, card.x, card.y, card.w, card.h, card.r);
  ctx.stroke();

  // Wordmark row: the mark, the name, and the job on the far side.
  const rowY = card.y + 96;
  mark(ctx, card.x + 64, rowY - 40);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = `600 46px ${fonts.display}`;
  ctx.fillText("Aptly", card.x + 64 + 68, rowY);

  const jobLine = [role, company].filter(Boolean).join(" · ");
  if (jobLine) {
    ctx.fillStyle = SLATE;
    ctx.textAlign = "right";
    ctx.font = `400 27px ${fonts.body}`;
    ctx.fillText(truncate(ctx, jobLine, 430), card.x + card.w - 64, rowY - 4);
  }

  ctx.strokeStyle = HAIRLINE;
  ctx.beginPath();
  ctx.moveTo(card.x + 64, rowY + 40);
  ctx.lineTo(card.x + card.w - 64, rowY + 40);
  ctx.stroke();

  // The ring. Gradient stroke, from twelve o'clock, over a soft track.
  const cx = SIZE / 2;
  const cy = card.y + 448;
  const radius = 188;
  const start = -Math.PI / 2;

  ctx.lineCap = "round";
  ctx.strokeStyle = SIGNAL_SOFT;
  ctx.lineWidth = 25;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  const sweep = (Math.PI * 2 * Math.max(2, Math.min(score, 100))) / 100;
  const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  gradient.addColorStop(0, SIGNAL);
  gradient.addColorStop(1, SIGNAL_BRIGHT);
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, start, start + sweep);
  ctx.stroke();

  // The number, with the percent sign stepped down — one figure, two weights,
  // which is hierarchy; one size is just loudness.
  const figure = String(score);
  ctx.textAlign = "left";
  ctx.font = `600 176px ${fonts.display}`;
  const figureWidth = ctx.measureText(figure).width;
  ctx.font = `500 72px ${fonts.display}`;
  const signWidth = ctx.measureText("%").width;
  const together = figureWidth + 10 + signWidth;

  ctx.fillStyle = INK;
  ctx.font = `600 176px ${fonts.display}`;
  ctx.fillText(figure, cx - together / 2, cy + 40);
  ctx.fillStyle = SLATE;
  ctx.font = `500 72px ${fonts.display}`;
  ctx.fillText("%", cx - together / 2 + figureWidth + 10, cy + 38);

  ctx.fillStyle = SLATE;
  ctx.textAlign = "center";
  ctx.font = `500 26px ${fonts.body}`;
  ctx.letterSpacing = "7px";
  ctx.fillText("REQUIREMENTS MET", cx + 3, cy + 106);
  ctx.letterSpacing = "0px";

  // The movement — the reason to share at all. A pill, in the product's own
  // change-card green, with the journey written out.
  const pillY = cy + radius + 74;
  if (score > baseline) {
    const label = `${baseline}%  →  ${score}%  after tailoring`;
    pill(ctx, cx, pillY, label, `500 34px ${fonts.display}`, SIGNAL_SOFT, SIGNAL);
  } else {
    pill(ctx, cx, pillY, "measured against the job post", `400 30px ${fonts.body}`, SUNKEN, SLATE);
  }

  // Footer: the tagline and the way in, on one quiet line.
  const footY = card.y + card.h - 62;
  ctx.strokeStyle = HAIRLINE;
  ctx.beginPath();
  ctx.moveTo(card.x + 64, footY - 44);
  ctx.lineTo(card.x + card.w - 64, footY - 44);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.font = `500 27px ${fonts.display}`;
  ctx.fillText("Tailor every application.", card.x + 64, footY);
  ctx.fillStyle = SLATE;
  ctx.textAlign = "right";
  ctx.font = `400 25px ${fonts.mono}`;
  ctx.fillText("aptly-psi.vercel.app", card.x + card.w - 64, footY);
}

/** One drifting paper sheet — the landing scene's motif, in miniature. */
function sheet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  degrees: number,
  accent: string,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.shadowColor = "rgba(22,24,29,0.09)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, 168, 216, 14);
  ctx.fill();
  ctx.shadowColor = "transparent";

  // Suggested text: an accent heading, then grey lines of uneven length.
  ctx.fillStyle = accent;
  roundRect(ctx, 24, 30, 66, 12, 6);
  ctx.fill();
  ctx.fillStyle = "#e9e9e6";
  for (const [line, width] of [
    [66, 120],
    [90, 104],
    [114, 118],
    [138, 84],
    [162, 112],
  ]) {
    roundRect(ctx, 24, line, width, 10, 5);
    ctx.fill();
  }
  ctx.restore();
}

/** The mark: the product's little document, standing on the signal square. */
function mark(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = SIGNAL;
  roundRect(ctx, x, y, 52, 52, 14);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (const [line, width] of [
    [15, 26],
    [25, 20],
    [35, 24],
  ] as const) {
    roundRect(ctx, x + 13, y + line, width, 5, 2.5);
    ctx.fill();
  }
}

function pill(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  label: string,
  font: string,
  background: string,
  color: string,
) {
  ctx.font = font;
  ctx.textAlign = "center";
  const width = ctx.measureText(label).width + 76;
  const height = 66;
  ctx.fillStyle = background;
  roundRect(ctx, cx - width / 2, cy - height / 2, width, height, height / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(label, cx, cy + 12);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > max) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
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
