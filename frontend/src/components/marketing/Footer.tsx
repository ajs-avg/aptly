import Link from "next/link";

const COLUMNS: Array<{
  heading: string;
  links: Array<{ label: string; href: string }>;
}> = [
  {
    heading: "Product",
    links: [
      { label: "Tailor a CV", href: "/tailor" },
      { label: "Library", href: "/library" },
      { label: "How it works", href: "#how" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Coming next",
    links: [
      { label: "Story Bank", href: "#roadmap" },
      { label: "Recruiter-Ready Card", href: "#roadmap" },
      { label: "Gap Coach", href: "#roadmap" },
      { label: "Browser clipper", href: "#roadmap" },
    ],
  },
  {
    heading: "Trust",
    links: [
      { label: "No fabrication", href: "#trust" },
      { label: "Your data", href: "#trust" },
      { label: "FAQ", href: "#faq" },
    ],
  },
];

/**
 * The footer, with the wordmark set as a watermark.
 *
 * Oversized type clipped by the page edge is a closing gesture rather than
 * decoration — it ends the scroll on the product's name. Kept aria-hidden so a
 * screen reader is not made to spell out a logo.
 */
export function Footer() {
  return (
    <footer
      data-scene="footer"
      className="gutter relative overflow-hidden border-t border-hairline bg-mist pt-16"
    >
      <div className="mx-auto max-w-content">
        {/* Four columns is a desktop shape. At `sm` it puts "Recruiter-Ready
            Card" in a 140px column, where it wraps to three lines and the three
            link lists stop lining up with each other. The middle step pairs
            them: the wordmark and its blurb across the top, the three lists
            two-and-one beneath. */}
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              Aptly
            </p>
            <p className="max-w-xs pt-2.5 text-sm leading-relaxed text-slate">
              Tailor every application. Be ready when they call.
            </p>
            <Link
              href="/tailor"
              className="mt-5 inline-flex h-9 items-center rounded-pill bg-ink px-4 font-display text-sm font-medium text-paper transition-colors hover:bg-ink-soft"
            >
              Tailor a CV
            </Link>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <p className="font-display text-2xs font-medium uppercase tracking-[0.12em] text-ink/70">
                {column.heading}
              </p>
              {/* py-1 on the link, not space-y on the list: the rhythm reads
                  the same, but the 8px lands inside the tap target, which a
                  bare text line leaves at 20px — under the 24px floor. */}
              <ul className="space-y-0.5 pt-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-block py-1 text-sm text-slate transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="hairline-t mt-14 flex flex-wrap items-center justify-between gap-3 pb-6 pt-5">
          <p className="text-2xs text-slate">
            Nothing is stored until you ask. Export or delete everything, any
            time.
          </p>
          <p className="text-2xs text-slate">
            Built around one moment: the callback.
          </p>
        </div>
      </div>

      <p
        aria-hidden
        className="pointer-events-none select-none text-center font-display font-semibold leading-[0.78] tracking-[-0.05em] text-ink/[0.055]"
        style={{ fontSize: "clamp(5rem, 19vw, 17rem)" }}
      >
        Aptly
      </p>
    </footer>
  );
}
