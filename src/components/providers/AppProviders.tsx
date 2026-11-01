"use client";

import { AppDataProvider } from "@/components/providers/AppDataProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppDataProvider>{children}</AppDataProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
