import { Header } from "@/components/landing/Header";
import {
  Capabilities,
  Closing,
  Faq,
  Footer,
  Moment,
  Pricing,
  Trust,
} from "@/components/landing/Sections";
import { Stats } from "@/components/landing/Stats";
import { Story } from "@/components/landing/Story";
import styles from "@/components/landing/landing.module.css";
import { cn } from "@/lib/utils";

export const metadata = {
  description:
    "Drop a job post and your CV, get the exact changes with one-tap apply, and keep a living record of every application — so the moment a recruiter calls, you are already prepared.",
};

/*
 * The landing page.
 *
 * One object — a CV in three dimensions — carries the first four screens,
 * doing the product's work as the page scrolls: read, change, keep. The copy
 * is the product's own; only the room it stands in has changed.
 */
export default function Home() {
  return (
    <div className={cn(styles.landing)}>
      <Header />

      <main>
        <Story />
        <section className={styles.statsStrip} aria-label="Aptly in numbers">
          <Stats />
        </section>
        <Capabilities />
        <Trust />
        <Moment />
        <Pricing />
        <Faq />
        <Closing />
      </main>

      <Footer />
    </div>
  );
}
