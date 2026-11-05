import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = getSessionAuthorization();
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "20";
  try {
    const res = await fetch(
      `${getBackendUrl()}/investigations/${encodeURIComponent(params.id)}/evidence?limit=${encodeURIComponent(limit)}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: token } : {},
      },
    );
    const data = await res.json().catch(() => ({ detail: `Error ${res.status}` }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 502 },
    );
  }
}
