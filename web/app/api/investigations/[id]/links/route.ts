import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = getSessionAuthorization();
  const url = new URL(request.url);
  const limit = url.searchParams.get("limit") ?? "100";

  try {
    const response = await fetch(
      `${getBackendUrl()}/investigations/${encodeURIComponent(params.id)}/links?limit=${encodeURIComponent(limit)}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: token } : {},
      },
    );
    const data = await response.json().catch(() => ({ detail: `Error ${response.status}` }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 502 },
    );
  }
}
