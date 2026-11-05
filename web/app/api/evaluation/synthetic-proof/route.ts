import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function GET() {
  const token = getSessionAuthorization();
  try {
    const response = await fetch(`${getBackendUrl()}/evaluation/synthetic-proof`, {
      cache: "no-store",
      headers: token ? { Authorization: token } : {},
    });
    const data = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Request failed" },
      { status: 502 },
    );
  }
}
