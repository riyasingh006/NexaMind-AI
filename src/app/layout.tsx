import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DocuMind AI — Intelligent Document Understanding",
    template: "%s · DocuMind AI",
  },
  description:
    "Transform your documents into an intelligent knowledge system. Upload, retrieve, analyze, and get evidence-backed answers powered by advanced Retrieval-Augmented Generation.",
  keywords: [
    "Agentic RAG",
    "document intelligence",
    "AI assistant",
    "semantic search",
    "Gemini",
    "LangGraph",
    "FAISS",
    "knowledge management",
  ],
  authors: [{ name: "DocuMind AI" }],
  openGraph: {
    title: "DocuMind AI — Your Documents. One Intelligent AI.",
    description:
      "An agentic RAG platform for evidence-backed document understanding, semantic retrieval, and cited AI answers.",
    type: "website",
    siteName: "DocuMind AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "DocuMind AI — Your Documents. One Intelligent AI.",
    description:
      "An agentic RAG platform for evidence-backed document understanding, semantic retrieval, and cited AI answers.",
  },
};

export const viewport: Viewport = {
  themeColor: "#070810",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="midnight" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <a
          href="#main-content"
          className="sr-only z-[200] rounded-lg bg-accent px-4 py-2 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
