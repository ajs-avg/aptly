"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The controls a profile section is built from.
 *
 * One vocabulary for eight sections, because the alternative is eight sections
 * that each ended up slightly different — a label 2px off here, a list that
 * deletes with a cross there and a word elsewhere. The profile is the longest
 * form in the product and the one somebody returns to; it has to feel like one
 * surface rather than eight screens that happen to be adjacent.
 */

export function Field({
  label,
  value,
  onChange,
  hint,
  placeholder,
  wide = false,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Said under the field, before it is filled in — not after it is wrong. */
  hint?: string;
  placeholder?: string;
  /** Spans both columns of the grid it sits in. */
  wide?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  const id = useId();
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2")}>
      <label
        htmlFor={id}
        className="block pb-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate"
      >
        {label}
      </label>
      <input
        {...rest}
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        // 16px: iOS zooms the page in on focus for anything smaller, and the way
        // back out is not obvious.
        className="h-11 w-full rounded-lg bg-sunken px-3.5 text-[1rem] text-ink ring-1 ring-hairline transition-shadow placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
      />
      {hint && <p className="pt-1.5 text-2xs leading-relaxed text-slate">{hint}</p>}
    </div>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="min-w-0 sm:col-span-2">
      <label
        htmlFor={id}
        className="block pb-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg bg-sunken px-3.5 py-2.5 text-[1rem] leading-relaxed text-ink ring-1 ring-hairline transition-shadow placeholder:text-slate/45 focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
      />
      {hint && <p className="pt-1.5 text-2xs leading-relaxed text-slate">{hint}</p>}
    </div>
  );
}

/**
 * A list of short strings — skills used, technologies, links, target roles.
 *
 * Chips rather than a comma-separated text field. A text field is quicker to
 * build and puts the burden on the person: they have to know the separator, and
 * a stray comma inside one item silently becomes two. Chips make what is stored
 * visible, which matters here because these lists are read by the scorer.
 */
export function Chips({
  label,
  values,
  onChange,
  placeholder = "Type and press Enter",
  hint,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  const id = useId();

  const commit = () => {
    const value = draft.trim();
    if (!value) return;
    // Case-insensitively unique: "Python" and "python" are one skill, and two
    // chips saying so is the sort of thing that makes a profile look untended.
    if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setDraft("");
  };

  return (
    <div className="min-w-0 sm:col-span-2">
      <label
        htmlFor={id}
        className="block pb-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate"
      >
        {label}
      </label>

      <div className="flex flex-wrap gap-1.5 rounded-lg bg-sunken p-2 ring-1 ring-hairline focus-within:ring-2 focus-within:ring-signal">
        {/* max-w-full + truncate on the chip: one holding a LinkedIn URL is
            wider than a phone, and without these it paints its text over the
            chips beside it while the remove button is squeezed to nothing. */}
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-pill bg-raised py-1 pl-3 pr-1 font-display text-xs text-ink shadow-hairline"
          >
            <span className="min-w-0 truncate">{value}</span>
            {/* size-6 with the negative margin: a 24px target that does not
                make the chip taller. shrink-0, so a long value cannot eat it. */}
            <button
              type="button"
              onClick={() => onChange(values.filter((item) => item !== value))}
              aria-label={`Remove ${value}`}
              data-tap="tight"
              className="-my-0.5 grid size-6 shrink-0 place-items-center rounded-full text-slate transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        ))}

        <input
          id={id}
          value={draft}
          placeholder={values.length ? "" : placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commit();
            }
            // Backspace on an empty box removes the last chip, which is what
            // every other chip input does and what the hand expects.
            if (event.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          // Typed and then abandoned still counts. Losing a chip because
          // somebody clicked Save instead of pressing Enter is a small betrayal
          // that is entirely avoidable.
          onBlur={commit}
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-2 text-[1rem] text-ink placeholder:text-slate/45 focus:outline-none sm:text-sm"
        />
      </div>
      {hint && <p className="pt-1.5 text-2xs leading-relaxed text-slate">{hint}</p>}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-3 sm:col-span-2">
      {/* The track stays 20px tall; the padding (cancelled by the negative
          margins, so nothing else moves) gives a thumb a 28px box to hit —
          20px is under the 24px floor a touch target needs. */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        data-tap="tight"
        className="-mx-1 -mb-1 -mt-0.5 shrink-0 rounded-pill p-1"
      >
        <span
          aria-hidden
          className={cn(
            "relative block h-5 w-9 rounded-pill transition-colors",
            checked ? "bg-signal" : "bg-hairline",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 size-4 rounded-full bg-raised shadow-raised transition-transform",
              checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
            )}
          />
        </span>
      </button>
      <span className="min-w-0">
        <span className="block font-display text-sm text-ink">{label}</span>
        {hint && <span className="block pt-0.5 text-2xs leading-relaxed text-slate">{hint}</span>}
      </span>
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="block pb-1.5 font-display text-2xs font-medium uppercase tracking-[0.1em] text-slate"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full rounded-lg bg-sunken px-3 text-[1rem] text-ink ring-1 ring-hairline focus:outline-none focus:ring-2 focus:ring-signal sm:text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * One entry in a repeating section — a job, a degree, a project.
 *
 * Collapsed to its own heading until opened. A profile with six jobs in it is
 * otherwise a page nobody scrolls to the bottom of, and the thing somebody came
 * to edit is always the one below the fold.
 */
export function Card({
  title,
  subtitle,
  open,
  onToggle,
  onRemove,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-raised ring-1 ring-hairline">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={cn(
              "size-3.5 shrink-0 text-slate transition-transform",
              open && "rotate-90",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
          </svg>
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-medium text-ink">
              {title || "Untitled"}
            </span>
            {subtitle && (
              <span className="block truncate text-2xs text-slate">{subtitle}</span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title || "this entry"}`}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-slate transition-colors hover:bg-danger-soft hover:text-danger [@media(pointer:coarse)]:w-11"
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 0 .5 12h7l.5-12" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="grid gap-4 border-t border-hairline p-4 sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}

export function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-hairline font-display text-sm text-slate transition-colors hover:border-signal hover:bg-signal-soft/40 hover:text-signal"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </svg>
      {children}
    </button>
  );
}
