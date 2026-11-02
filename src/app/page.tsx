import type { Metadata } from "next";
import { Closing, LandingFooter } from "@/components/landing/closing";
import { Faq } from "@/components/landing/faq";
import { landingFonts } from "@/components/landing/fonts";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingHeader } from "@/components/landing/landing-nav";
import { Reveal } from "@/components/landing/reveal";
import { Security } from "@/components/landing/security";
import { Showcase } from "@/components/landing/showcase";
import { lpContainer } from "@/components/landing/ui";
import { Why } from "@/components/landing/why";
import { getStaff, roleHome } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "Garage Desk · Job cards, quotes and customer approvals" },
};

/** Public product page. Never redirects: staff get "Open app" (role home), everyone else "Sign in". */
export default async function Home() {
  const staff = await getStaff();
  const cta = staff ? { href: roleHome(staff.role), label: "Open app" } : { href: "/login", label: "Sign in" };

  return (
    <div className={cn("lp lp-smooth flex-1", landingFonts)}>
      <Reveal />
      <LandingHeader cta={cta} />
      <main>
        <div className={lpContainer}>
          <Hero cta={cta} />
          <Why />
        </div>
        <HowItWorks />
        <div className={lpContainer}>
          <Showcase cta={cta} />
          <Security />
          <Faq />
        </div>
        <Closing cta={cta} />
      </main>
      <LandingFooter cta={cta} />
    </div>
  );
}
