import { Header } from "@/components/landing/Header";
import {
  Closing,
  Faq,
  Footer,
  Hero,
  How,
  Keep,
  Moment,
  Numbers,
  Pricing,
  Trust,
} from "@/components/landing/Sections";
import { StagePose } from "@/components/stage/StagePose";
import styles from "@/components/landing/landing.module.css";

export const metadata = {
  description:
    "Drop a job post and your CV, get the exact changes with one-tap apply, and keep a living record of every application — so the moment a recruiter calls, you are already prepared.",
};

/*
 * The landing page.
 *
 * A column of sections in one rhythm — headline, one sentence, the product —
 * where nearly every picture is the interface itself, in miniature, running.
 * The 3D room stays behind it all as the dark it stands in.
 */
export default function Home() {
  return (
    <div className={styles.landing}>
      <StagePose name="landing.hero" />
      <Header />
      <main>
        <Hero />
        <Numbers />
        <How />
        <Trust />
        <Keep />
        <Moment />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
