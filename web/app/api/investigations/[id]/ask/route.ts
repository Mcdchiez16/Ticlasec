import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = getSessionAuthorization();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${getBackendUrl()}/investigations/${encodeURIComponent(params.id)}/ask`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: token } : {}),
        },
        body: JSON.stringify(body),
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
