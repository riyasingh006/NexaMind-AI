"use client";

import {
  Bell,
  Building2,
  Check,
  Database,
  Download,
  HardDrive,
  Info,
  KeyRound,
  Mail,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useAppData } from "@/components/providers/AppDataProvider";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useToast } from "@/components/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Modal";
import { PageHeading, Panel } from "@/components/ui/PageHeading";
import { Switch } from "@/components/ui/Switch";
import { cn, downloadTextFile, formatNumber } from "@/lib/utils";
import type { ThemePreference, WorkspaceSettings } from "@/types/settings";

const SETTINGS_KEY = "documind-settings";

const defaultSettings: WorkspaceSettings = {
  workspaceName: "DocuMind Research Workspace",
  displayName: "Alex Morgan",
  email: "alex.morgan@example.com",
  theme: "midnight",
  geminiModel: "gemini-2.5-flash",
  embeddingModel: "gemini-embedding-001",
  temperature: 0.2,
  maxOutputTokens: 2048,
  chunkSize: 800,
  chunkOverlap: 120,
  topK: 8,
  similarityThreshold: 0.7,
  reranking: true,
  notifications: {
    processingComplete: true,
    weeklyDigest: false,
    productUpdates: false,
  },
  compactMode: false,
  reduceMotion: false,
};

type SettingsTab = "workspace" | "ai" | "appearance" | "notifications" | "data";

const tabs: { id: SettingsTab; label: string; description: string; icon: typeof Settings2 }[] = [
  { id: "workspace", label: "Workspace", description: "Profile and identity", icon: Building2 },
  { id: "ai", label: "AI & Retrieval", description: "Models and search", icon: SlidersHorizontal },
  { id: "appearance", label: "Appearance", description: "Theme and display", icon: Palette },
  { id: "notifications", label: "Notifications", description: "Local preferences", icon: Bell },
  { id: "data", label: "Data & Privacy", description: "Storage and export", icon: Database },
];

const inputClass =
  "h-9 w-full rounded-lg border border-line bg-[#0a0c16] px-3 text-[11.5px] text-foreground outline-none transition placeholder:text-subtle focus:border-accent/35 focus:ring-2 focus:ring-accent/10";

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[10px] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[8.5px] leading-4 text-subtle">{hint}</p> : null}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-5 py-4 first:pt-0 last:pb-0">
      <div>
        <p className="text-[11px] font-medium text-foreground/90">{title}</p>
        <p className="mt-0.5 max-w-md text-[9px] leading-4 text-subtle">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} label={title} />
    </div>
  );
}

const themeOptions: {
  value: ThemePreference;
  label: string;
  description: string;
  swatch: string;
}[] = [
  {
    value: "midnight",
    label: "Midnight",
    description: "Deep navy-black with violet accents.",
    swatch: "linear-gradient(145deg,#0b0d18,#1b1836)",
  },
  {
    value: "dim",
    label: "Dim",
    description: "Lighter surfaces for bright rooms.",
    swatch: "linear-gradient(145deg,#141829,#272b49)",
  },
  {
    value: "system",
    label: "System",
    description: "Follow the operating system preference.",
    swatch: "linear-gradient(135deg,#0b0d18 0 50%,#272b49 50% 100%)",
  },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => {
    const requested = searchParams.get("tab");
    return tabs.some((item) => item.id === requested) ? (requested as SettingsTab) : "workspace";
  });
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [savedSettings, setSavedSettings] = useState<WorkspaceSettings>(defaultSettings);
  const [resetOpen, setResetOpen] = useState(false);
  const { setTheme } = useTheme();
  const { toast } = useToast();
  const { documents, conversations } = useAppData();

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (tabs.some((item) => item.id === requested)) {
      setTab(requested as SettingsTab);
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const parsed = { ...defaultSettings, ...JSON.parse(raw) } as WorkspaceSettings;
      parsed.notifications = { ...defaultSettings.notifications, ...parsed.notifications };
      setSettings(parsed);
      setSavedSettings(parsed);
      setTheme(parsed.theme);
    } catch {
      window.localStorage.removeItem(SETTINGS_KEY);
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.compact = String(settings.compactMode);
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings.compactMode, settings.reduceMotion]);

  const dirty = useMemo(
    () => JSON.stringify(settings) !== JSON.stringify(savedSettings),
    [settings, savedSettings],
  );

  const totalMessages = useMemo(
    () => conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
    [conversations],
  );

  const update = (patch: Partial<WorkspaceSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const updateNotification = (
    key: keyof WorkspaceSettings["notifications"],
    value: boolean,
  ) => {
    setSettings((current) => ({
      ...current,
      notifications: { ...current.notifications, [key]: value },
    }));
  };

  const selectTheme = (theme: ThemePreference) => {
    update({ theme });
    setTheme(theme);
  };

  const saveSettings = () => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setSavedSettings(settings);
    setTheme(settings.theme);
    toast({
      title: "Settings saved locally",
      description: "Preferences are stored in this browser. No server update was performed.",
      tone: "success",
    });
  };

  const revertChanges = () => {
    setSettings(savedSettings);
    setTheme(savedSettings.theme);
    toast({
      title: "Changes reverted",
      description: "Restored the last locally saved settings.",
      tone: "info",
    });
  };

  const resetSettings = () => {
    window.localStorage.removeItem(SETTINGS_KEY);
    setSettings(defaultSettings);
    setSavedSettings(defaultSettings);
    setTheme(defaultSettings.theme);
    setResetOpen(false);
    toast({
      title: "Settings reset",
      description: "All local preferences were restored to their defaults.",
      tone: "success",
    });
  };

  const exportWorkspace = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      mode: "Phase 4 frontend demo",
      settings,
      documents,
      conversations,
      notice:
        "Documents are loaded from the backend API; conversations and preferences remain local.",
    };
    downloadTextFile(
      "documind-workspace-demo.json",
      JSON.stringify(payload, null, 2),
    );
    toast({
      title: "Workspace exported",
      description: "A local JSON snapshot of demo data and preferences was downloaded.",
      tone: "success",
    });
  };

  return (
    <div className="space-y-5">
      <PageHeading
        eyebrow="Workspace configuration"
        title="Settings"
        description="Configure the demo workspace, retrieval defaults, appearance and local privacy preferences."
        actions={
          <>
            {dirty ? (
              <span className="flex items-center gap-1.5 text-[9px] text-warning/80">
                <span className="size-1.5 rounded-full bg-warning" />
                Unsaved changes
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-[9px] text-success/80">
                <Check className="size-3" />
                Saved locally
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={revertChanges} disabled={!dirty}>
              <RotateCcw className="size-3.5" />
              Revert
            </Button>
            <Button size="sm" onClick={saveSettings} disabled={!dirty}>
              <Save className="size-3.5" />
              Save changes
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-accent/12 bg-accent/[0.035] px-3.5 py-2.5">
        <Info className="mt-0.5 size-3.5 shrink-0 text-accent-bright/70" />
        <p className="text-[10px] leading-5 text-muted">
          Settings are stored in your browser only. Model, embedding and retrieval controls document
          intended Phase 2 behavior but do not connect to any live service.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <nav className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface/70 p-1.5 lg:flex-col">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition lg:w-full",
                    active
                      ? "bg-accent-soft text-foreground"
                      : "text-subtle hover:bg-white/[0.035] hover:text-muted",
                  )}
                >
                  <Icon
                    className={cn("size-3.5 shrink-0", active ? "text-accent-bright" : "text-subtle")}
                  />
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap text-[10.5px] font-medium">
                      {item.label}
                    </span>
                    <span className="hidden text-[8.5px] text-subtle lg:block">
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mt-3 hidden rounded-xl border border-line bg-surface/50 p-3 lg:block">
            <p className="font-mono text-[7.5px] uppercase tracking-[0.12em] text-subtle">
              Environment
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted">
              <span className="size-1.5 rounded-full bg-success" />
              Frontend only
            </div>
            <p className="mt-1.5 text-[8px] leading-4 text-subtle/70">
              No credentials are stored or transmitted.
            </p>
          </div>
        </div>

        <div className="min-w-0">
          {tab === "workspace" ? (
            <div className="space-y-4">
              <Panel
                title="Workspace identity"
                description="Shown across the local demo workspace."
                action={<Badge tone="muted">Local only</Badge>}
              >
                <div className="space-y-4 p-5">
                  <div className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.018] p-3">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-accent/20 bg-accent-soft text-[12px] font-semibold text-accent-bright">
                      AM
                    </span>
                    <div>
                      <p className="text-[11.5px] font-medium text-foreground">
                        {settings.displayName || "Unnamed user"}
                      </p>
                      <p className="text-[9px] text-subtle">{settings.email || "No email set"}</p>
                    </div>
                    <span className="ml-auto rounded-full border border-line bg-white/[0.025] px-2 py-0.5 font-mono text-[7.5px] uppercase tracking-wide text-subtle">
                      Demo profile
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Workspace name" htmlFor="workspaceName">
                      <div className="relative">
                        <Building2 className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                        <input
                          id="workspaceName"
                          value={settings.workspaceName}
                          onChange={(event) => update({ workspaceName: event.target.value })}
                          className={`${inputClass} pl-8`}
                        />
                      </div>
                    </Field>
                    <Field label="Display name" htmlFor="displayName">
                      <div className="relative">
                        <UserRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                        <input
                          id="displayName"
                          value={settings.displayName}
                          onChange={(event) => update({ displayName: event.target.value })}
                          className={`${inputClass} pl-8`}
                        />
                      </div>
                    </Field>
                  </div>
                  <Field
                    label="Contact email"
                    htmlFor="email"
                    hint="Used only as a local demonstration field. No emails are sent in Phase 1."
                  >
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                      <input
                        id="email"
                        type="email"
                        value={settings.email}
                        onChange={(event) => update({ email: event.target.value })}
                        className={`${inputClass} pl-8`}
                      />
                    </div>
                  </Field>
                </div>
              </Panel>

              <Panel title="Workspace footprint" description="Current local demo state.">
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  {[
                    { label: "Documents", value: formatNumber(documents.length) },
                    { label: "Conversations", value: formatNumber(conversations.length) },
                    { label: "Messages", value: formatNumber(totalMessages) },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-xl border border-line bg-white/[0.018] p-3.5"
                    >
                      <p className="text-[8px] uppercase tracking-[0.1em] text-subtle">
                        {stat.label}
                      </p>
                      <p className="mt-1.5 text-[20px] font-semibold tracking-[-0.03em] text-foreground">
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          ) : null}

          {tab === "ai" ? (
            <div className="space-y-4">
              <Panel
                title="Generation model"
                description="Parameters intended for the Phase 2 Gemini integration."
                action={
                  <Badge tone="danger" dot>
                    Not connected
                  </Badge>
                }
              >
                <div className="space-y-5 p-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Generation model"
                      htmlFor="geminiModel"
                      hint="Configuration preview only. No model request is made."
                    >
                      <select
                        id="geminiModel"
                        value={settings.geminiModel}
                        onChange={(event) => update({ geminiModel: event.target.value })}
                        className={inputClass}
                      >
                        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                        <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                      </select>
                    </Field>
                    <Field
                      label="Embedding model"
                      htmlFor="embeddingModel"
                      hint="Preview only. The backend model and dimensions come from GEMINI_EMBEDDING_* settings."
                    >
                      <select
                        id="embeddingModel"
                        value={settings.embeddingModel}
                        onChange={(event) => update({ embeddingModel: event.target.value })}
                        className={inputClass}
                      >
                        <option value="gemini-embedding-001">gemini-embedding-001</option>
                        <option value="text-embedding-004">text-embedding-004</option>
                      </select>
                    </Field>
                  </div>

                  <div className="rounded-lg border border-line bg-[#080a12] px-3 py-2.5">
                    <div className="flex items-center gap-2 text-[9px] text-subtle">
                      <KeyRound className="size-3" />
                      Gemini API key is managed server-side in Phase 2 and is never entered in the
                      browser.
                    </div>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="temperature" className="text-[10px] font-medium text-muted">
                          Temperature
                        </label>
                        <span className="font-mono text-[9px] text-accent-bright">
                          {settings.temperature.toFixed(2)}
                        </span>
                      </div>
                      <input
                        id="temperature"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.temperature}
                        onChange={(event) => update({ temperature: Number(event.target.value) })}
                        className="mt-2.5 w-full"
                      />
                      <div className="mt-1 flex justify-between font-mono text-[7.5px] text-subtle/60">
                        <span>Precise</span>
                        <span>Creative</span>
                      </div>
                    </div>
                    <Field
                      label="Max output tokens"
                      htmlFor="maxOutputTokens"
                      hint="Upper bound for a future generated answer."
                    >
                      <input
                        id="maxOutputTokens"
                        type="number"
                        min={256}
                        max={8192}
                        step={128}
                        value={settings.maxOutputTokens}
                        onChange={(event) =>
                          update({ maxOutputTokens: Number(event.target.value) })
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </div>
              </Panel>

              <Panel
                title="Retrieval defaults"
                description="Chunking and evidence selection controls."
                action={<Badge tone="accent">Illustrative</Badge>}
              >
                <div className="space-y-5 p-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Chunk size (tokens)" htmlFor="chunkSize">
                      <input
                        id="chunkSize"
                        type="number"
                        min={200}
                        max={2000}
                        step={50}
                        value={settings.chunkSize}
                        onChange={(event) => update({ chunkSize: Number(event.target.value) })}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Chunk overlap (tokens)" htmlFor="chunkOverlap">
                      <input
                        id="chunkOverlap"
                        type="number"
                        min={0}
                        max={500}
                        step={10}
                        value={settings.chunkOverlap}
                        onChange={(event) => update({ chunkOverlap: Number(event.target.value) })}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <div className="flex items-center justify-between">
                        <label htmlFor="topK" className="text-[10px] font-medium text-muted">
                          Top-K retrieved chunks
                        </label>
                        <span className="font-mono text-[9px] text-accent-bright">
                          {settings.topK}
                        </span>
                      </div>
                      <input
                        id="topK"
                        type="range"
                        min={1}
                        max={20}
                        step={1}
                        value={settings.topK}
                        onChange={(event) => update({ topK: Number(event.target.value) })}
                        className="mt-3 w-full"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="similarityThreshold"
                          className="text-[10px] font-medium text-muted"
                        >
                          Similarity threshold
                        </label>
                        <span className="font-mono text-[9px] text-accent-bright">
                          {Math.round(settings.similarityThreshold * 100)}%
                        </span>
                      </div>
                      <input
                        id="similarityThreshold"
                        type="range"
                        min={0.3}
                        max={0.95}
                        step={0.01}
                        value={settings.similarityThreshold}
                        onChange={(event) =>
                          update({ similarityThreshold: Number(event.target.value) })
                        }
                        className="mt-3 w-full"
                      />
                    </div>
                  </div>

                  <div className="border-t border-line pt-4">
                    <ToggleRow
                      title="Cross-encoder reranking"
                      description="Rerank retrieved evidence before generation. The demo chat already applies a simulated rerank order."
                      checked={settings.reranking}
                      onChange={(checked) => update({ reranking: checked })}
                    />
                  </div>
                </div>
              </Panel>
            </div>
          ) : null}

          {tab === "appearance" ? (
            <div className="space-y-4">
              <Panel
                title="Theme"
                description="Applied immediately and saved with your local preferences."
              >
                <div className="grid gap-2.5 p-5 sm:grid-cols-3">
                  {themeOptions.map((option) => {
                    const active = settings.theme === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => selectTheme(option.value)}
                        className={cn(
                          "rounded-xl border p-2.5 text-left transition",
                          active
                            ? "border-accent/45 bg-accent-soft"
                            : "border-line bg-white/[0.018] hover:border-line-strong",
                        )}
                      >
                        <span
                          className="block h-16 w-full rounded-lg border border-white/10 shadow-inner"
                          style={{ background: option.swatch }}
                        />
                        <span className="mt-2.5 flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-foreground">
                            {option.label}
                          </span>
                          {active ? (
                            <Check className="ml-auto size-3 text-accent-bright" />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[8px] leading-4 text-subtle">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Display preferences" description="Local interface adjustments.">
                <div className="divide-y divide-line/60 p-5">
                  <ToggleRow
                    title="Compact layout"
                    description="Reduce vertical padding in the dashboard content area."
                    checked={settings.compactMode}
                    onChange={(checked) => update({ compactMode: checked })}
                  />
                  <ToggleRow
                    title="Reduce motion"
                    description="Minimize interface animation and transition durations."
                    checked={settings.reduceMotion}
                    onChange={(checked) => update({ reduceMotion: checked })}
                  />
                </div>
              </Panel>
            </div>
          ) : null}

          {tab === "notifications" ? (
            <div className="space-y-4">
              <Panel
                title="Notification preferences"
                description="These preferences are stored locally and do not send messages."
                action={<Badge tone="muted">No delivery</Badge>}
              >
                <div className="divide-y divide-line/60 p-5">
                  <ToggleRow
                    title="Document processing complete"
                    description="Show a toast when a simulated upload finishes indexing."
                    checked={settings.notifications.processingComplete}
                    onChange={(checked) => updateNotification("processingComplete", checked)}
                  />
                  <ToggleRow
                    title="Weekly retrieval digest"
                    description="Preview a future weekly summary of retrieval quality metrics."
                    checked={settings.notifications.weeklyDigest}
                    onChange={(checked) => updateNotification("weeklyDigest", checked)}
                  />
                  <ToggleRow
                    title="Product updates"
                    description="Preview future notices about new DocuMind capabilities."
                    checked={settings.notifications.productUpdates}
                    onChange={(checked) => updateNotification("productUpdates", checked)}
                  />
                </div>
              </Panel>

              <div className="flex items-start gap-2.5 rounded-xl border border-warning/12 bg-warning/[0.035] p-4">
                <Bell className="mt-0.5 size-3.5 shrink-0 text-warning/70" />
                <div>
                  <p className="text-[10.5px] font-medium text-warning/85">No email service connected</p>
                  <p className="mt-0.5 text-[9px] leading-4 text-subtle">
                    Phase 1 does not send email, push or in-app notifications beyond local toast
                    messages. Delivery will require an explicit Phase 2 notification design.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "data" ? (
            <div className="space-y-4">
              <Panel
                title="Local demo data"
                description="Everything displayed in this workspace lives in browser memory."
                action={<Badge tone="accent">Session state</Badge>}
              >
                <div className="space-y-4 p-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "Documents", value: documents.length, icon: Database },
                      { label: "Conversations", value: conversations.length, icon: Sparkles },
                      { label: "Messages", value: totalMessages, icon: HardDrive },
                    ].map((stat) => {
                      const Icon = stat.icon;
                      return (
                        <div key={stat.label} className="rounded-xl border border-line p-3.5">
                          <Icon className="size-3.5 text-subtle" />
                          <p className="mt-2 text-[19px] font-semibold tracking-[-0.03em] text-foreground">
                            {formatNumber(stat.value)}
                          </p>
                          <p className="text-[8.5px] text-subtle">{stat.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2 rounded-xl border border-line bg-white/[0.018] p-3.5 sm:flex-row sm:items-center">
                    <div className="flex-1">
                      <p className="text-[10.5px] font-medium text-foreground">Export workspace JSON</p>
                      <p className="mt-0.5 text-[8.5px] text-subtle">
                        Download current mock documents, conversations and preferences.
                      </p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={exportWorkspace}>
                      <Download className="size-3.5" />
                      Export snapshot
                    </Button>
                  </div>
                </div>
              </Panel>

              <Panel title="Privacy posture" description="What this demo does and does not do.">
                <div className="space-y-3 p-5">
                  {[
                    "No document contents leave this browser.",
                    "No API keys or credentials are stored.",
                    "Conversations are not persisted beyond the current session.",
                    "Analytics values are static mock data, not user telemetry.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 size-3 shrink-0 text-success/80" />
                      <p className="text-[9.5px] leading-4 text-muted">{item}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel
                title="Reset preferences"
                description="Restore theme, model and retrieval settings to their defaults."
                className="border-danger/20"
              >
                <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="text-[10.5px] font-medium text-foreground">
                      Clear local settings
                    </p>
                    <p className="mt-0.5 text-[8.5px] leading-4 text-subtle">
                      This removes the saved preferences key from this browser. Demo documents and
                      conversations remain available until the page is reloaded.
                    </p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => setResetOpen(true)}>
                    <RotateCcw className="size-3.5" />
                    Reset settings
                  </Button>
                </div>
              </Panel>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-[8.5px] text-subtle">
              <Settings2 className="size-3" />
              {dirty ? "You have unsaved local changes." : "All changes are saved locally."}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={revertChanges} disabled={!dirty}>
                Revert
              </Button>
              <Button size="sm" onClick={saveSettings} disabled={!dirty}>
                <Save className="size-3.5" />
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={resetSettings}
        title="Reset all local settings?"
        description="Theme, model, retrieval, notification and display preferences will return to their demo defaults."
        confirmLabel="Reset settings"
      />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-16 w-full animate-pulse rounded-xl bg-white/[0.035]" />
      <div className="h-10 w-full animate-pulse rounded-lg bg-white/[0.025]" />
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="h-72 animate-pulse rounded-xl bg-white/[0.025]" />
        <div className="h-96 animate-pulse rounded-xl bg-white/[0.035]" />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton />}>
      <SettingsContent />
    </Suspense>
  );
}
