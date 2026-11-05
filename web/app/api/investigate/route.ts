import { getSessionAuthorization } from "@/lib/session"
import { NextResponse } from "next/server";
import type { CreateInvestigationBody } from "@/lib/api";
import { getBackendUrl } from "@/lib/backend";

export async function POST(request: Request) {
  const token = getSessionAuthorization();
    let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const { query, model, full_intelligence, depth, intelligence_scope, synthetic_scenario } = body as {
    query?: unknown;
    model?: unknown;
    full_intelligence?: unknown;
    depth?: unknown;
    intelligence_scope?: unknown;
    synthetic_scenario?: unknown;
  };

  if (typeof query !== "string" || query.trim().length === 0) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const payload: CreateInvestigationBody = {
    query: query.trim(),
    depth: depth === "fast" || depth === "deep" ? depth : "standard",
    run_crawler: depth === "deep" || Boolean(full_intelligence),
    intelligence_scope: { profile_id: "global" },
  };

  if (intelligence_scope && typeof intelligence_scope === "object") {
    const candidate = intelligence_scope as {
      profile_id?: unknown;
      focus_name?: unknown;
      keywords?: unknown;
    };
    if (
      candidate.profile_id === "global" ||
      candidate.profile_id === "zambia" ||
      candidate.profile_id === "custom"
    ) {
      payload.intelligence_scope = {
        profile_id: candidate.profile_id,
        ...(typeof candidate.focus_name === "string"
          ? { focus_name: candidate.focus_name.trim().slice(0, 80) }
          : {}),
        ...(Array.isArray(candidate.keywords)
          ? {
              keywords: candidate.keywords
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim().slice(0, 80))
                .filter(Boolean)
                .slice(0, 20),
            }
          : {}),
      };
    }
  }

  if (typeof model === "string" && model.length > 0) {
    payload.model = model;
  }

  if (typeof synthetic_scenario === "string" && /^[a-z0-9_-]{1,64}$/.test(synthetic_scenario)) {
    payload.synthetic_scenario = synthetic_scenario;
    payload.run_crawler = false;
  }

  const backendUrl = getBackendUrl();
  try {
    console.log(`Forwarding investigation to: ${backendUrl}/investigations`);
    const res = await fetch(`${backendUrl}/investigations`, {
      method: "POST",
      headers: { "Content-Type": "application/json",
          ...(token ? { "Authorization": token } : {}) },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      console.error(`Backend returned error ${res.status}:`, data);
      return NextResponse.json(data ?? { detail: `Error ${res.status}` }, { status: res.status });
    }

    const runId =
      data &&
      typeof data === "object" &&
      "run_id" in data &&
      typeof (data as { run_id: unknown }).run_id === "string"
        ? (data as { run_id: string }).run_id
        : null;

    if (!runId) {
      return NextResponse.json(
        { error: "Invalid response from backend", detail: data },
        { status: 502 }
      );
    }

    return NextResponse.json({ run_id: runId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    console.error(`Fetch to backend failed (${backendUrl}/investigations):`, err);
    return NextResponse.json({ error: message, target_url: `${backendUrl}/investigations` }, { status: 502 });
  }
}
