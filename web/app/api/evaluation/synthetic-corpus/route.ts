import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function GET() {
  const token = getSessionAuthorization();
  if (!token) return NextResponse.json({ detail: "Sign in to access the synthetic corpus" }, { status: 401 });
  try {
    const response = await fetch(`${getBackendUrl()}/evaluation/synthetic-corpus`, {
      cache: "no-store",
      headers: { Authorization: token },
    });
    const data = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Synthetic corpus unavailable" }, { status: 502 });
  }
}
