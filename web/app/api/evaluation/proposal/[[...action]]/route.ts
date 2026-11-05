import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

type Context = { params: { action?: string[] } };
async function forward(request: Request, { params }: Context) {
  const token = getSessionAuthorization();
  if (!token) return NextResponse.json({ detail: "Sign in to use research evaluation" }, { status: 401 });
  const action = (params.action || []).join("/");
  if (!((request.method === "GET" && action === "") || (request.method === "POST" && action === "audit"))) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  try {
    const body = request.method === "POST" ? await request.text() : undefined;
    if (body && new TextEncoder().encode(body).length > 4_000_000) return NextResponse.json({ detail: "Study exceeds the 4 MB limit" }, { status: 413 });
    const response = await fetch(`${getBackendUrl()}/evaluation/proposal${action ? `/${action}` : ""}`, {
      method: request.method, headers: { Authorization: token, "Content-Type": "application/json" }, body, cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ detail: "Research service is unavailable" }, { status: 502 }); }
}
export const GET = forward;
export const POST = forward;
