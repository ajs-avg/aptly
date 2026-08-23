import { Panel } from "./primitives";

/*
 * Miniatures of the real product.
 *
 * Built from markup rather than screenshots: they stay sharp at any size, they
 * cost nothing to keep current, and — the reason that matters — they show the
 * actual mechanism. A change card that quotes the old line and cites its source
 * *is* the argument. A stock illustration of a document would not be.
 */

/** A change card, as it appears in the Tailor screen. */
export function ChangeCardPreview() {
  return (
    <Panel className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-display text-2xs uppercase tracking-[0.12em] text-panel-ink/45">
          Experience
        </span>
        <span className="rounded-xs bg-signal/20 px-1.5 py-0.5 font-display text-2xs text-signal">
          Apply
        </span>
      </div>

      <p className="cv-literal text-2xs leading-relaxed text-panel-ink/35 line-through decoration-panel-ink/25">
        Cut new-site ramp time from 12 weeks to 6 by rebuilding the onboarding
        flow.
      </p>

      <div className="rounded-sm bg-amber/12 px-2 py-1.5 ring-1 ring-inset ring-amber/30">
        <p className="cv-literal text-2xs leading-relaxed text-panel-ink/90">
          Reduced customer site deployment time from 12 weeks to 6 by rebuilding
          the onboarding flow.
        </p>
      </div>

      <p className="text-2xs leading-relaxed text-panel-ink/55">
        The post asks for evidence of shortening deployment time.
      </p>
    </Panel>
  );
}

/** The coverage meter, honest about what is missing. */
export function CoveragePreview() {
  const covered = ["Python", "SQL", "RAG"];
  const missing = ["Airflow", "dbt", "Kafka"];

  return (
    <Panel className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-2xs uppercase tracking-[0.12em] text-panel-ink/45">
          Coverage
        </span>
        <span className="font-display text-xs text-panel-ink/80" data-numeric>
          3 / 6
        </span>
      </div>

      <div className="flex h-1 gap-1 overflow-hidden rounded-pill">
        {[...covered, ...missing].map((term, index) => (
          <span
            key={term}
            className={`h-full flex-1 rounded-pill ${index < covered.length ? "bg-signal" : "bg-panel-ink/15"}`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {covered.map((term) => (
          <span
            key={term}
            className="rounded-xs bg-signal/20 px-1.5 py-0.5 font-display text-2xs text-signal"
          >
            {term}
          </span>
        ))}
        {missing.map((term) => (
          <span
            key={term}
            className="rounded-xs px-1.5 py-0.5 font-display text-2xs text-panel-ink/40 ring-1 ring-inset ring-panel-ink/15"
          >
            {term}
          </span>
        ))}
      </div>
    </Panel>
  );
}

/** A rejection, which is the trust claim made visible. */
export function RejectionPreview() {
  return (
    <Panel className="space-y-2">
      <span className="font-display text-2xs uppercase tracking-[0.12em] text-panel-ink/45">
        Discarded
      </span>
      <p className="cv-literal text-2xs leading-relaxed text-panel-ink/45">
        …rebuilt the pipeline and deployed it on{" "}
        <span className="text-danger">Kubernetes</span>.
      </p>
      <p className="text-2xs leading-relaxed text-panel-ink/70">
        Introduces a technology that is not in your CV.
      </p>
    </Panel>
  );
}

/** Two rows of the Library, weeks after the fact. */
export function LibraryPreview() {
  const rows = [
    {
      company: "Acme Robotics",
      role: "Senior Product Manager",
      when: "5 weeks ago",
      live: true,
    },
    {
      company: "Northwind",
      role: "Product Manager",
      when: "2 months ago",
      live: false,
    },
  ];

  return (
    <Panel className="space-y-1.5">
      <span className="font-display text-2xs uppercase tracking-[0.12em] text-panel-ink/45">
        Library
      </span>
      {rows.map((row) => (
        <div
          key={row.company}
          className="flex items-baseline justify-between gap-3 rounded-sm bg-panel-soft px-2.5 py-2"
        >
          <div className="min-w-0">
            <p className="truncate font-display text-xs text-panel-ink/90">
              {row.company}
            </p>
            <p className="truncate text-2xs text-panel-ink/45">{row.role}</p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={`font-display text-2xs ${row.live ? "text-signal" : "text-panel-ink/40"}`}
            >
              {row.live ? "Interviewing" : "Applied"}
            </p>
            <p className="text-2xs text-panel-ink/35">{row.when}</p>
          </div>
        </div>
      ))}
    </Panel>
  );
}

/** The Recruiter-Ready Card, condensed. The thing people would pay for. */
export function CardPreview() {
  return (
    <Panel className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-2xs uppercase tracking-[0.12em] text-amber">
          Recruiter-ready
        </span>
        <span className="text-2xs text-panel-ink/40">Acme Robotics</span>
      </div>

      {[
        ["CV you sent", "Aman_SPM_Acme_v3.pdf"],
        [
          "Why you fit",
          "Led a hardware-plus-software launch; cut ramp time by half.",
        ],
        ["Gaps to own", "Team size was 6, not 10+. Frame scope honestly."],
      ].map(([label, value]) => (
        <div key={label}>
          <p className="font-display text-2xs uppercase tracking-[0.1em] text-panel-ink/35">
            {label}
          </p>
          <p className="pt-0.5 text-2xs leading-relaxed text-panel-ink/85">
            {value}
          </p>
        </div>
      ))}
    </Panel>
  );
}
