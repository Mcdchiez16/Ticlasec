import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

export async function GET() {
  const token = getSessionAuthorization();
  if (!token) return NextResponse.json({ detail: "Sign in to use the evaluation workbench" }, { status: 401 });
  try {
    const response = await fetch(`${getBackendUrl()}/evaluation/lead-demo`, {
      cache: "no-store", headers: { Authorization: token },
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ detail: "Evaluation service unavailable" }, { status: 502 });
  }
}
