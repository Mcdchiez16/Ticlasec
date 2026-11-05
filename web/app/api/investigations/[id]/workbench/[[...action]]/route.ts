import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";
import { getSessionAuthorization } from "@/lib/session";

type Context = { params: { id: string; action?: string[] } };

async function forward(request: Request, { params }: Context) {
  const suffix = (params.action || []).join("/");
  const valid = request.method === "GET" ? ["", "export"].includes(suffix)
    : request.method === "PUT" ? suffix === "organization"
    : request.method === "POST" && /^[a-f0-9-]{36}\/review$/i.test(suffix);
  if (!valid) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const token = getSessionAuthorization();
  if (!token) return NextResponse.json({ detail: "Sign in to review this case" }, { status: 401 });
  try {
    const response = await fetch(`${getBackendUrl()}/investigations/${encodeURIComponent(params.id)}/workbench${suffix ? `/${suffix}` : ""}`, {
      method: request.method, cache: "no-store",
      headers: { Authorization: token, "Content-Type": "application/json" },
      ...(request.method !== "GET" ? { body: await request.text() } : {}),
    });
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    const disposition = response.headers.get("Content-Disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new Response(await response.text(), { status: response.status, headers });
  } catch {
    return NextResponse.json({ detail: "The case service is unavailable" }, { status: 502 });
  }
}

export const GET = forward;
export const PUT = forward;
export const POST = forward;
