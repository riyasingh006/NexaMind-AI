"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LANDING_NAV } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled ? "border-b border-line bg-[#070810]/82 backdrop-blur-xl" : "bg-transparent",
        )}
      >
        <div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {LANDING_NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-lg px-3 py-2 text-[12.5px] font-medium text-muted transition hover:bg-white/[0.04] hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <Link
              href="/dashboard"
              className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-muted transition hover:text-foreground"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="group inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.055] px-4 text-[12.5px] font-medium text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-accent/30 hover:bg-accent-soft"
            >
              Get Started
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          <button
            type="button"
            className="rounded-lg border border-line bg-white/[0.04] p-2 text-muted transition hover:text-foreground sm:hidden"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
          </button>
        </div>
        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
              className="overflow-hidden border-t border-line bg-[#080a13]/97 backdrop-blur-xl sm:hidden"
            >
              <nav className="flex flex-col gap-1 px-4 py-4" aria-label="Mobile navigation">
                {LANDING_NAV.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-[13px] text-muted transition hover:bg-white/[0.04] hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-4">
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex h-9.5 items-center justify-center rounded-lg border border-line-strong text-[12px] font-medium text-foreground"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex h-9.5 items-center justify-center rounded-lg bg-accent text-[12px] font-medium text-white"
                  >
                    Get Started
                  </Link>
                </div>
              </nav>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>
    </>
  );
}
