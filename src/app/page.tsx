import { Architecture } from "@/components/landing/Architecture";
import { Documentation } from "@/components/landing/Documentation";
import { Features } from "@/components/landing/Features";
import { CTA, Footer } from "@/components/landing/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Navbar } from "@/components/landing/Navbar";
import { Technology } from "@/components/landing/Technology";
import { UseCases } from "@/components/landing/UseCases";

export default function LandingPage() {
  return (
    <div className="landing-shell min-h-screen overflow-x-clip">
      <Navbar />
      <main id="main-content">
        <Hero />
        <Features />
        <HowItWorks />
        <Architecture />
        <Technology />
        <UseCases />
        <Documentation />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
