import Link from "next/link";

import { Faq } from "@/components/marketing/Faq";
import { Footer } from "@/components/marketing/Footer";
import { Nav } from "@/components/marketing/Nav";
import { Pricing } from "@/components/marketing/Pricing";
import {
  Card,
  Display,
  Eyebrow,
  Lede,
  Pill,
  Section,
} from "@/components/marketing/primitives";
import {
  CardPreview,
  ChangeCardPreview,
  CoveragePreview,
  LibraryPreview,
  RejectionPreview,
} from "@/components/marketing/previews";
import { Entrance, EntranceLine } from "@/components/motion/Entrance";
import { StoryCanvas } from "@/components/story/StoryCanvas";

export const metadata = {
  description:
    "Drop a job post and your CV, get the exact changes with one-tap apply, and keep a living record of every application — so the moment a recruiter calls, you are already prepared.",
};

const CAPABILITIES = [
  "One-tap apply",
  "No fabrication",
  "Frozen job posts",
  "Keeps your formatting",
  ".docx · .pdf · .tex",
  "Keyword coverage",
  "Version history",
  "Works without an account",
];

/*
 * The landing page.
 *
 * Centred, generous, and built from a handful of repeated shapes — a floating
 * pill, a white card on mist, a dark panel showing the real interface. The 3D
 * paper drifts behind the whole thing.
 *
 * The content is ordinary server-rendered HTML with the canvas fixed behind it,
 * so the page ranks, survives JavaScript being off, and loses only decoration
 * on a device that cannot run WebGL.
 */
export default function Home() {
  return (
    <div className="relative bg-paper">
      <StoryCanvas />

      {/* An explicit stacking context. Without it the scene either covers the
          copy or disappears beneath the page background. */}
      <div className="relative z-10">
        <Nav />

        <main>
          <Hero />
          <Capabilities />
          <How />
          <TheCall />
          <Trust />
          <PricingSection />
          <FaqSection />
          <Closing />
        </main>

        <Footer />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    // The nav is sticky rather than fixed, so it holds its own 4.25rem in the
    // flow and this padding is the air *below* it, not the clearance for it.
    <section data-scene="hero" className="gutter pb-14 pt-16 sm:pb-16 sm:pt-24">
      <Entrance className="mx-auto max-w-3xl text-center xl:max-w-4xl ultra:max-w-5xl">
        <EntranceLine>
          <Eyebrow>A CV tool with a memory</Eyebrow>
        </EntranceLine>

        <EntranceLine>
          {/* The floor is 2.15rem rather than 2.6: "Tailor every application."
              is 24 characters, and at 2.6rem it needs 430px of line to stay on
              two lines. A 320px phone does not have it, and the headline breaks
              to four. */}
          <Display as="h1" className="pt-6" size="2.15rem, 7.2vw, 5.6rem">
            Tailor every application.
            <br />
            <span className="text-signal">Be ready when they call.</span>
          </Display>
        </EntranceLine>

        <EntranceLine>
          <Lede className="mx-auto max-w-xl pt-6 ultra:max-w-2xl">
            Drop a job post and your CV. Aptly shows the exact lines to change
            and why, applies them in one tap, and keeps every application — so
            the moment a recruiter calls, you already have what you sent.
          </Lede>
        </EntranceLine>

        <EntranceLine className="flex flex-col items-center gap-3 pt-9">
          <Link
            href="/tailor"
            className="inline-flex h-12 items-center rounded-pill bg-signal px-7 font-display text-base font-medium text-paper shadow-float transition-colors hover:bg-signal-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
          >
            Get your free score →
          </Link>
          {/* The promise spelled out, because it is the unusual part: the
              diagnosis costs nothing and asks for nothing. The account is
              asked for where it earns its keep — at the fixing. */}
          <p className="text-sm text-slate">
            No sign-up needed · Drop your CV, see the match in a minute ·
            Stored only against your own account
          </p>
        </EntranceLine>
      </Entrance>

      {/* The product, immediately. A landing page that describes an interface
          without showing one asks for trust it has not earned yet. */}
      <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:mt-20 sm:grid-cols-[1.25fr_1fr] xl:max-w-5xl ultra:max-w-6xl">
        {/* The grid stretches this to match the two stacked cards beside it, so
            it is always the taller of the two by some amount that depends on
            the window. Left at the top, the change card sat with a hand's width
            of nothing beneath it, which reads as something failing to load.
            Centred in the space instead, the same gap reads as padding. */}
        <Card className="flex flex-col bg-raised/85 backdrop-blur-sm" padded={false}>
          <div className="flex flex-1 flex-col p-5">
            <p className="font-display text-2xs font-medium uppercase tracking-[0.12em] text-slate">
              A change, as you see it
            </p>
            <div className="flex flex-1 flex-col justify-center pt-3">
              <ChangeCardPreview />
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="bg-raised/85 backdrop-blur-sm" padded={false}>
            <div className="p-5">
              <CoveragePreview />
            </div>
          </Card>
          <Card className="bg-raised/85 backdrop-blur-sm" padded={false}>
            <div className="p-5">
              <RejectionPreview />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Capabilities() {
  return (
    <Section scene="capabilities" className="py-14 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <Display size="1.7rem, 4vw, 3.2rem">
          Everything the application needs, one screen away
        </Display>
      </div>
      <div className="mx-auto flex max-w-2xl flex-wrap justify-center gap-2 pt-8">
        {CAPABILITIES.map((item) => (
          <Pill key={item}>{item}</Pill>
        ))}
      </div>
    </Section>
  );
}

function How() {
  return (
    <Section id="how" scene="how" className="bg-mist/80 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>How it works</Eyebrow>
        <Display className="pt-5" size="1.8rem, 4.4vw, 3.4rem">
          Two boxes, then a short list of changes
        </Display>
        <Lede className="mx-auto max-w-lg pt-5">
          No long forms and no setup before the first result. Paste the post,
          drop the CV, and read what Aptly would change.
        </Lede>
      </div>

      {/* `md`, not `sm`: each of these carries a paragraph *and* a miniature of
          the product, and the miniature is built from 11px type. Two of them at
          640px puts that type in a 290px column, which is where it stops being
          a demonstration and becomes texture. */}
      <div className="grid gap-4 pt-12 md:grid-cols-2">
        <Card>
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
            It quotes you before it changes you
          </h3>
          <p className="pt-3 text-base leading-relaxed text-slate">
            Every suggestion shows the current wording, the proposed wording,
            and one plain reason tied to the post. Apply it, or do not. Undo is
            one tap, and your formatting is never rebuilt from scratch.
          </p>
          <div className="pt-5">
            <ChangeCardPreview />
          </div>
        </Card>

        <Card>
          <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
            Then it keeps the whole thing
          </h3>
          <p className="pt-3 text-base leading-relaxed text-slate">
            The job post is frozen the day you apply, stored with the exact CV
            you sent and a hash that proves which file it was. Search by
            company, by role, or by a phrase you half-remember from the advert.
          </p>
          <div className="pt-5">
            <LibraryPreview />
          </div>
        </Card>
      </div>
    </Section>
  );
}

/* The emotional centre. Most air, plainest words, no product in shot. */
function TheCall() {
  return (
    <Section scene="call" className="py-28 sm:py-36">
      <div className="mx-auto max-w-3xl text-center">
        <Eyebrow tone="amber">The moment this is for</Eyebrow>
        <Display className="pt-6" size="1.9rem, 4.8vw, 3.8rem">
          A recruiter calls. You applied five weeks ago. You cannot remember
          which CV you sent, and the job post is gone from the site.
        </Display>
        <Lede className="mx-auto max-w-xl pt-7">
          Every other tool stops at &ldquo;hit send&rdquo;. Aptly follows you
          into the part that decides the outcome — so you open one screen
          instead of stalling.
        </Lede>

        <div className="mx-auto max-w-sm pt-12">
          <CardPreview />
        </div>
      </div>
    </Section>
  );
}

function Trust() {
  return (
    <Section id="trust" scene="trust" className="bg-mist/80 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>Trust as a feature</Eyebrow>
        <Display className="pt-5" size="1.8rem, 4.4vw, 3.4rem">
          It will not invent things about you
        </Display>
        <Lede className="mx-auto max-w-lg pt-5">
          Not because a prompt asks it nicely. Because a check runs on every
          single suggestion before you ever see it.
        </Lede>
      </div>

      {/* Three at a time only where three fit. At `sm` each column is about
          190px, and a 45-word paragraph in 190px is a column of two-word lines.
          The middle step is two columns with the third dropping under them,
          which is what a 640–1024px window actually has room for. */}
      <div className="grid gap-4 pt-12 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            title: "Nothing added",
            body: "A figure, company or tool that is not already in your CV means the suggestion is discarded. The advert asking for Kubernetes is not evidence that you have used it.",
          },
          {
            title: "Nothing removed",
            body: "Tailoring is emphasis, not subtraction. A skills line can be reordered to lead with what this job wants; it cannot come back shorter than it went in.",
          },
          {
            title: "Nothing hidden",
            body: "You see how many suggestions were thrown away and why. Anything the model borrowed from the employer's wording is flagged for you to confirm.",
          },
        ].map((item) => (
          <Card key={item.title}>
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
              {item.title}
            </h3>
            <p className="pt-2.5 text-base leading-relaxed text-slate">
              {item.body}
            </p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function PricingSection() {
  return (
    <Section id="pricing" scene="pricing" className="py-24 sm:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <Eyebrow>Pricing</Eyebrow>
        <Display className="pt-5" size="1.9rem, 4.8vw, 3rem">
          One honest profile.
          <br />
          Every application.
        </Display>
        <Lede className="mx-auto max-w-md pt-5">
          Less than the keyword scanners, and it covers the part of the journey
          they leave out.
        </Lede>
      </div>

      <div className="pt-14">
        <Pricing />
      </div>
    </Section>
  );
}

function FaqSection() {
  return (
    <Section id="faq" scene="faq" className="bg-mist/80 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl text-center">
        <Display size="1.9rem, 4.8vw, 3rem">Frequently asked questions</Display>
        <Lede className="mx-auto max-w-lg pt-5">
          Including the parts Aptly cannot do.
        </Lede>
      </div>
      <div className="pt-12">
        <Faq />
      </div>
    </Section>
  );
}

function Closing() {
  return (
    <Section scene="closing" className="py-28 sm:py-36">
      <div className="mx-auto max-w-2xl text-center">
        <Display size="2rem, 5.4vw, 3.4rem">
          Start with the job you are applying to today.
        </Display>
        <div className="flex flex-col items-center gap-3 pt-9">
          <Link
            href="/tailor"
            className="inline-flex h-12 items-center rounded-pill bg-signal px-7 font-display text-base font-medium text-paper shadow-float transition-colors hover:bg-signal-hover"
          >
            Get your free score →
          </Link>
          <p className="text-sm text-slate">Takes about a minute. No sign-up to see it.</p>
        </div>
      </div>
    </Section>
  );
}
