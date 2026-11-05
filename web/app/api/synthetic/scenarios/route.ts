import { getSessionAuthorization } from "@/lib/session";
import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";

export async function GET() {
  const token = getSessionAuthorization();
  try {
    const res = await fetch(`${getBackendUrl()}/investigations/synthetic/scenarios`, {
      cache: "no-store",
      headers: { ...(token ? { Authorization: token } : {}) },
    });
    const data = await res.json().catch(() => ({ items: [] }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ items: [] }, { status: 502 });
  }
}
