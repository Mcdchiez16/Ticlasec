"use client";

import { useState } from "react";
import { AppNav } from "@/components/AppNav";
import { setCompanionEnabled, useCompanionEnabled } from "@/lib/preferences";

interface ApiKeyDef {
  key_name: string;
  label: string;
  description: string;
}

interface ApiKeyStatus {
  key_name: string;
  is_set: boolean;
  server_configured: boolean;
  label: string;
  description: string;
}

async function fetchApiKeys(): Promise<ApiKeyStatus[]> {
  const res = await fetch("/api/settings/api-keys", {

  });
  if (!res.ok) throw new Error("Failed to load keys");
  const data = await res.json();
  return data.keys;
}

async function saveKey(keyName: string, value: string): Promise<void> {
  const res = await fetch("/api/settings/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key_name: keyName, value }),
  });
  if (!res.ok) throw new Error("Failed to save key");
}

async function deleteKey(keyName: string): Promise<void> {
  const res = await fetch(`/api/settings/api-keys/${keyName}`, {
    method: "DELETE",

  });
  if (!res.ok) throw new Error("Failed to delete key");
}

async function testKey(keyName: string, value: string): Promise<{ valid: boolean; message: string }> {
  const res = await fetch("/api/settings/api-keys/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key_name: keyName, value }),
  });
  if (!res.ok) throw new Error("Failed to test key");
  return res.json();
}

const API_KEY_DEFS: ApiKeyDef[] = [
  {
    key_name: "OPENAI_API_KEY",
    label: "OpenAI",
    description: "Enables GPT-4o and GPT-4 models",
  },
  {
    key_name: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    description: "Enables Claude models",
  },
  {
    key_name: "GOOGLE_API_KEY",
    label: "Google Gemini",
    description: "Enables Gemini models (free tier available)",
  },
  {
    key_name: "OPENROUTER_API_KEY",
    label: "OpenRouter",
    description: "Access 100+ models including free tier options",
  },
  {
    key_name: "GROQ_API_KEY",
    label: "Groq (Free tier)",
    description: "Fast inference — Llama 3.3 70B free. Sign up at console.groq.com",
  },
  {
    key_name: "HETZNER_API_KEY",
    label: "Hetzner Inference",
    description: "OpenAI-compatible open-source models (experimental; currently free)",
  },
  {
    key_name: "OTX_API_KEY",
    label: "AlienVault OTX",
    description: "Threat intelligence enrichment",
  },
  {
    key_name: "VT_API_KEY",
    label: "VirusTotal",
    description: "File hash enrichment (optional)",
  },
];

export default function SettingsPage() {
  const companionOn = useCompanionEnabled();


  const [keys, setKeys] = useState<ApiKeyStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ keyName: string; valid: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchApiKeys();
      setKeys(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (keyName: string) => {
    const value = inputValues[keyName] || "";
    if (!value) return;
    setSaving(keyName);
    try {
      await saveKey(keyName, value);
      setInputValues((prev) => ({ ...prev, [keyName]: "" }));
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (keyName: string) => {
    try {
      await deleteKey(keyName);
      await loadKeys();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleTest = async (keyName: string) => {
    const value = inputValues[keyName];
    if (!value) return;
    setTestingKey(keyName);
    setTestResult(null);
    try {
      const result = await testKey(keyName, value);
      setTestResult({ keyName, valid: result.valid, message: result.message });
    } catch (e) {
      setTestResult({ keyName, valid: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTestingKey(null);
    }
  };

  const getStatus = (keyName: string) => {
    const k = keys.find((k) => k.key_name === keyName);
    if (!k) return "loading";
    if (k.is_set) return "user";
    if (k.server_configured) return "server";
    return "none";
  };

  return (
    <div className="min-h-screen bg-[var(--bg-void)] pb-24 lg:pb-0 lg:pl-[288px]">
      <AppNav />

      <main className="mx-auto max-w-2xl px-6 py-10">
        <section className="mb-10" aria-labelledby="prefs-title">
          <h1 id="prefs-title" className="text-3xl font-extrabold text-[var(--text-primary)]">Preferences</h1>
          <div className="dw-card mt-4 flex items-center justify-between gap-4 p-5">
            <div>
              <h3 className="text-lg font-extrabold text-[var(--text-primary)]">Floating assistant</h3>
              <p className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">
                An animated helper on the home page that moves around, follows your cursor and comments as you type. Off by default.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={companionOn}
              aria-label="Floating assistant"
              onClick={() => setCompanionEnabled(!companionOn)}
              className={`relative h-8 w-14 shrink-0 rounded-full border-2 transition-colors ${companionOn ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border-subtle)] bg-[var(--bg-overlay)]"}`}
            >
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${companionOn ? "left-[26px]" : "left-0.5"}`} />
            </button>
          </div>
        </section>

        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-[var(--text-primary)]">API keys</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Configure your personal API keys. These override server defaults and are encrypted before storage.
          </p>
        </div>

        <div className="mb-6 rounded-2xl bg-[var(--warning-dim)] p-4 text-sm font-bold text-[var(--warning)]">
          💡 Free options: Hetzner Inference is currently free during its experimental phase. Groq, OpenRouter, and Google also offer free access, or you can run models locally with Ollama.
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-[var(--danger-dim)] p-3 text-sm font-bold text-[var(--danger)]">
            {error}
          </div>
        )}

        <button
          onClick={loadKeys}
          className="btn-dw btn-dw-ghost btn-dw-sm mb-6"
        >
          {loading ? "Loading..." : "Load API key status"}
        </button>

        <div className="space-y-4">
          {API_KEY_DEFS.map((def) => {
            const status = getStatus(def.key_name);
            return (
              <div key={def.key_name} className="dw-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-extrabold text-[var(--text-primary)]">{def.label}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{def.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === "user" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-dim)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--success-text)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                        Configured
                      </span>
                    )}
                    {status === "server" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-raised)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--text-muted)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-muted)]" />
                        Server default
                      </span>
                    )}
                    {status === "none" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger-dim)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--danger)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--danger)]" />
                        Not configured
                      </span>
                    )}
                  </div>
                </div>

                {status === "none" && (
                  <div className="mt-3 rounded-xl bg-[var(--warning-dim)] p-2.5 text-xs font-bold text-[var(--warning)]">
                    No key configured — this provider will be unavailable
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="Enter new key to update"
                    value={inputValues[def.key_name] || ""}
                    onChange={(e) => setInputValues((prev) => ({ ...prev, [def.key_name]: e.target.value }))}
                    className="dw-input flex-1 !py-2 text-sm"
                  />
                  <button
                    onClick={() => handleTest(def.key_name)}
                    disabled={!inputValues[def.key_name] || testingKey === def.key_name}
                    className="btn-dw btn-dw-ghost btn-dw-sm"
                  >
                    {testingKey === def.key_name ? "Testing..." : "Test"}
                  </button>
                  <button
                    onClick={() => handleSave(def.key_name)}
                    disabled={!inputValues[def.key_name] || saving === def.key_name}
                    className="btn-dw btn-dw-sm"
                  >
                    {saving === def.key_name ? "Saving..." : "Save"}
                  </button>
                  {status === "user" && (
                    <button
                      onClick={() => handleDelete(def.key_name)}
                      className="btn-dw btn-dw-danger btn-dw-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {testResult?.keyName === def.key_name && (
                  <div className={`mt-3 rounded-xl p-2.5 text-sm font-bold ${testResult.valid ? "bg-[var(--success-dim)] text-[var(--success-text)]" : "bg-[var(--danger-dim)] text-[var(--danger)]"}`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
