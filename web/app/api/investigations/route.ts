import { getSessionAuthorization } from "@/lib/session"
import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";

function nonNegativeInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function GET(request: Request) {
  const token = getSessionAuthorization();
  const { searchParams } = new URL(request.url);
  const skip = nonNegativeInteger(searchParams.get("skip"), 0);
  const limit = Math.min(200, Math.max(1, nonNegativeInteger(searchParams.get("limit"), 20)));

  const q = new URLSearchParams();
  q.set("offset", String(skip));
  q.set("limit", String(limit));
  const qs = q.toString();

  try {
    const res = await fetch(`${getBackendUrl()}/investigations${qs ? `?${qs}` : ""}`, {
      cache: "no-store",
      headers: {
        ...(token ? { "Authorization": token } : {})
      }
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return NextResponse.json(data ?? { detail: `Error ${res.status}` }, { status: res.status });
    }

    // FastAPI intentionally keeps its public list endpoint as a plain array.
    // The web UI uses a paginated envelope, so normalize the upstream shape at
    // this boundary instead of leaking two incompatible contracts to the page.
    if (!Array.isArray(data)) {
      return NextResponse.json({ error: "Invalid investigations response" }, { status: 502 });
    }

    const totalHeader = res.headers.get("x-total-count");
    const parsedTotal = Number(totalHeader);
    const total = Number.isInteger(parsedTotal) && parsedTotal >= 0
      ? parsedTotal
      : skip + data.length;

    return NextResponse.json({ items: data, total, skip, limit });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
