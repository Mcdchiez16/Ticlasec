import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

async function forward(request: Request, { params }: { params: { action?: string[] } }) {
  const token = getSessionAuthorization();
  if (!token) return NextResponse.json({ detail: "Sign in first" }, { status: 401 });
  const action = (params.action || []).join("/");
  if (!((request.method === "GET" && !action) || (request.method === "POST" && ["setup", "confirm"].includes(action)))) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  try {
    const response = await fetch(`${getBackendUrl()}/auth/mfa${action ? `/${action}` : ""}`, {
      method: request.method, cache: "no-store", headers: { Authorization: token, "Content-Type": "application/json" },
      ...(request.method === "POST" ? { body: await request.text() } : {}),
    });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ detail: "Authentication service unavailable" }, { status: 502 }); }
}
export const GET = forward;
export const POST = forward;
