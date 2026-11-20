"use client";

import { useEffect, useState } from "react";
import { Check, Cloud, CloudOff, Copy, Link2, LogOut, Mail } from "lucide-react";
import {
  connectWithSyncCode,
  createSyncSession,
  getCloudUser,
  getSyncCode,
  isCloudConfigured,
  onAuthChange,
  signInWithMagicLink,
  signOutCloud,
  type CloudUser,
} from "@/lib/cloudSync";

type Props = {
  syncStatus: "idle" | "saving" | "saved" | "error" | "local";
  onAuthChanged: () => void;
};

export function CloudAuth({ syncStatus, onAuthChanged }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState<CloudUser | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"menu" | "show" | "join">("menu");

  const refresh = async () => {
    const cfg = await isCloudConfigured();
    setConfigured(cfg);
    const u = await getCloudUser();
    setUser(u);
    setCode(u?.provider === "sync-code" ? getSyncCode() : null);
  };

  useEffect(() => {
    void refresh();
    return onAuthChange(() => {
      void refresh().then(onAuthChanged);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendLink = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await signInWithMagicLink(email);
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setMessage("Kolla din e-post — klicka på länken för att logga in.");
  };

  const create = async () => {
    setBusy(true);
    setMessage(null);
    const res = await createSyncSession();
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setCode(res.code);
    setMode("show");
    setUser(await getCloudUser());
    onAuthChanged();
  };

  const join = async () => {
    if (!paste.trim()) return;
    setBusy(true);
    setMessage(null);
    const res = await connectWithSyncCode(paste);
    setBusy(false);
    if (res.error) {
      setMessage(res.error);
      return;
    }
    setOpen(false);
    setMode("menu");
    setPaste("");
    await refresh();
    onAuthChanged();
  };

  const logout = async () => {
    setBusy(true);
    await signOutCloud();
    setBusy(false);
    setUser(null);
    setCode(null);
    setMode("menu");
    onAuthChanged();
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("Kunde inte kopiera — markera koden manuellt.");
    }
  };

  if (configured === null) return null;

  const statusLabel =
    syncStatus === "saving"
      ? "Sparar…"
      : syncStatus === "saved"
        ? "Synkad"
        : syncStatus === "error"
          ? "Synkfel"
          : syncStatus === "local"
            ? "Ej inloggad"
            : "";

  if (user) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 bg-white hover:bg-slate-50"
        >
          <Cloud className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-slate-700 truncate max-w-[10rem]">
            {user.label}
          </span>
          {statusLabel && (
            <span className="text-slate-400 tabular-nums">{statusLabel}</span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 z-30 w-80 border border-slate-200 rounded-md bg-white shadow-lg p-3 space-y-2">
            {user.provider === "supabase" ? (
              <p className="text-xs text-slate-600">
                Inloggad via e-post. Tidrapporter synkas mellan dina enheter.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-600">
                  Synkad via synkkod (reserv). Samma kod på alla enheter.
                </p>
                {code && (
                  <div className="space-y-1.5">
                    <textarea
                      readOnly
                      value={code}
                      rows={3}
                      className="field w-full text-[11px] font-mono leading-snug resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => void copyCode()}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-slate-900 text-white"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {copied ? "Kopierad" : "Kopiera synkkod"}
                    </button>
                  </div>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => void logout()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logga ut
            </button>
            {message && <p className="text-xs text-slate-500">{message}</p>}
          </div>
        )}
      </div>
    );
  }

  // Supabase configured → magic link (primary)
  if (configured) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs border border-amber-200 text-amber-900 rounded-md px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100"
        >
          <Cloud className="w-3.5 h-3.5" />
          Synka mellan enheter
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-2 z-30 w-72 border border-slate-200 rounded-md bg-white shadow-lg p-3 space-y-2">
            <p className="text-xs text-slate-600">
              Logga in med e-post (magisk länk) för att synka tidrapporter mellan
              dator och telefon.
            </p>
            <div className="flex gap-1.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="namn@exempel.se"
                className="field flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void sendLink();
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendLink()}
                className="px-2.5 rounded-md bg-slate-900 text-white text-sm disabled:opacity-50"
                title="Skicka länk"
              >
                <Mail className="w-4 h-4" />
              </button>
            </div>
            {message && <p className="text-xs text-slate-500">{message}</p>}
          </div>
        )}
      </div>
    );
  }

  // Not configured → show status + optional sync-code fallback
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setMode("menu");
          setMessage(null);
        }}
        className="inline-flex items-center gap-1.5 text-xs border border-slate-200 text-slate-600 rounded-md px-2.5 py-1.5 bg-white hover:bg-slate-50"
      >
        <CloudOff className="w-3.5 h-3.5" />
        Endast denna enhet
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 border border-slate-200 rounded-md bg-white shadow-lg p-3 space-y-2">
          <p className="text-xs text-slate-600">
            Supabase är inte kopplat ännu. Följ{" "}
            <span className="font-medium">supabase-setup.md</span> — eller använd
            synkkod som reserv.
          </p>
          {mode === "menu" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void create()}
                className="w-full text-sm px-2.5 py-2 rounded-md bg-slate-900 text-white disabled:opacity-50"
              >
                Skapa synkkod (reserv)
              </button>
              <button
                type="button"
                onClick={() => setMode("join")}
                className="w-full inline-flex items-center justify-center gap-1.5 text-sm px-2.5 py-2 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                <Link2 className="w-3.5 h-3.5" />
                Ange synkkod
              </button>
            </>
          )}
          {mode === "show" && code && (
            <>
              <textarea
                readOnly
                value={code}
                rows={3}
                className="field w-full text-[11px] font-mono leading-snug resize-none"
              />
              <button
                type="button"
                onClick={() => void copyCode()}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-slate-900 text-white"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? "Kopierad" : "Kopiera synkkod"}
              </button>
            </>
          )}
          {mode === "join" && (
            <>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={3}
                placeholder="tr1.…"
                className="field w-full text-[11px] font-mono leading-snug resize-none"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode("menu")}
                  className="text-xs px-2.5 py-1.5 rounded-md border border-slate-200"
                >
                  Tillbaka
                </button>
                <button
                  type="button"
                  disabled={busy || !paste.trim()}
                  onClick={() => void join()}
                  className="flex-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-900 text-white disabled:opacity-50"
                >
                  Anslut
                </button>
              </div>
            </>
          )}
          {message && <p className="text-xs text-slate-500">{message}</p>}
        </div>
      )}
    </div>
  );
}
