"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { BriefingText } from "@/components/AiBriefingPanel";
import type { InvestigationEvidence } from "@/components/EvidencePanel";

type ConversationMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  citations: InvestigationEvidence[];
  model_used?: string | null;
};

const STARTERS = [
  "What is the bottom line in simple terms?",
  "Which findings are direct evidence and which are only possible matches?",
  "What should I verify next?",
];

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      return String((detail as { message: unknown }).message);
    }
    if ("error" in data) return String((data as { error: unknown }).error);
  }
  return `Request failed (${status})`;
}

export function InvestigationAssistant({ investigationId }: { investigationId: string }) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/investigations/${encodeURIComponent(investigationId)}/messages`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(errorMessage(data, response.status));
        if (active) setMessages(data.items ?? []);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load conversation");
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [investigationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, answering]);

  const submit = async (event?: FormEvent, starter?: string) => {
    event?.preventDefault();
    const text = (starter ?? question).trim();
    if (text.length < 3 || answering) return;
    const temporaryId = `pending-${Date.now()}`;
    setQuestion("");
    setError(null);
    setAnswering(true);
    setMessages((current) => [
      ...current,
      { id: temporaryId, role: "user", content: text, citations: [] },
    ]);

    try {
      const response = await fetch(`/api/investigations/${encodeURIComponent(investigationId)}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(errorMessage(data, response.status));
      setMessages((current) => [
        ...current,
        {
          id: data.id,
          role: "assistant",
          content: data.content,
          citations: data.citations ?? [],
          model_used: data.model_used,
        },
      ]);
    } catch (reason) {
      setMessages((current) => current.filter((message) => message.id !== temporaryId));
      setQuestion(text);
      setError(reason instanceof Error ? reason.message : "The AI could not answer");
    } finally {
      setAnswering(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--bg-void)]">
      <div className="shrink-0 border-b border-[var(--border-dim)] bg-[var(--bg-surface)] px-5 py-5 lg:px-8">
        <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Ask about this investigation</h2>
        <p className="mt-1.5 text-[12px] leading-5 text-[var(--text-muted)]">
          Answers are limited to the collected evidence and cite the source excerpts they rely on.
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-6 custom-scrollbar lg:px-8">
        {loadingHistory && <p className="text-[11px] text-[var(--text-muted)]">Loading conversation…</p>}
        {!loadingHistory && messages.length === 0 && (
          <div className="mx-auto flex max-w-2xl flex-col items-center py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-dim)] text-sm font-bold text-[var(--accent-text)]">AI</span>
            <h3 className="mt-5 text-[17px] font-bold text-[var(--text-primary)]">Turn the raw findings into an explanation</h3>
            <p className="mt-2 max-w-lg text-[13px] leading-6 text-[var(--text-muted)]">
              Ask what a result means, how strong the connection is, or what a defender should do next.
            </p>
            <div className="mt-6 grid w-full gap-3 sm:grid-cols-3">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => void submit(undefined, starter)}
                  className="dw-card min-h-[72px] px-4 py-3 text-left text-[12px] leading-5 text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[88%] rounded-xl border px-5 py-4 lg:max-w-[78%] ${
              message.role === "user"
                ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--text-primary)]"
                : "border-[var(--border-dim)] bg-[var(--bg-surface)]"
            }`}>
              {message.role === "assistant" ? (
                <BriefingText content={message.content} />
              ) : (
                <p className="text-[13px] leading-6">{message.content}</p>
              )}
              {message.citations.length > 0 && (
                <div className="mt-3 border-t border-[var(--border-dim)] pt-2">
                  <p className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Evidence cited</p>
                  <div className="flex flex-wrap gap-1.5">
                    {message.citations.map((citation) => (
                      <span key={citation.page_id} title={citation.url} className="rounded border border-[var(--accent-border)] bg-[var(--accent-dim)] px-2 py-1 font-mono text-[9px] text-[var(--accent-text)]">
                        {citation.id} · {citation.match_type}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {answering && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 dw-card px-4 py-3 text-[11px] text-[var(--text-muted)]">
              <span className="h-3 w-3 animate-spin rounded-full border border-[var(--accent)] border-t-transparent" />
              Reading the evidence…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(event) => void submit(event)} className="shrink-0 border-t border-[var(--border-dim)] bg-[var(--bg-surface)] p-4 lg:px-8 lg:py-5">
        {error && <p className="mb-2 text-[11px] text-[var(--danger)]">{error}</p>}
        <div className="flex items-end gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-void)] p-2.5 focus-within:border-[var(--accent-border)]">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="Ask what the evidence means…"
            className="min-h-[48px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] leading-5 text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={answering || question.trim().length < 3}
            className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[12px] font-bold text-[var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Ask AI
          </button>
        </div>
      </form>
    </section>
  );
}
