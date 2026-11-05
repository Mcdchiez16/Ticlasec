import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function POST(request: Request) {
  const token = getSessionAuthorization();
  const body = await request.text();
  try {
    const response = await fetch(`${getBackendUrl()}/evaluation/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: token } : {}),
      },
      body,
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
