import { NextRequest, NextResponse } from "next/server";
import { getSessionAuthorization } from "@/lib/session";
import { getBackendUrl } from "@/lib/backend";

export const dynamic = "force-dynamic";

async function proxy(request: NextRequest, context: { params: { path?: string[] } }) {
  const path = (context.params.path ?? []).join("/");
  const webhook = ["webhooks/telegram", "webhooks/whatsapp"].includes(path);
  const allowed = webhook
    ? request.method === "POST" || (path === "webhooks/whatsapp" && request.method === "GET")
    : (path === "" && request.method === "GET") || (path === "link" && request.method === "POST") ||
      (path === "whatsapp/qr" && ["GET", "POST"].includes(request.method)) ||
      (["telegram", "whatsapp"].includes(path) && request.method === "DELETE");
  if (!allowed) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  const auth = webhook ? null : getSessionAuthorization();
  if (!webhook && !auth) return NextResponse.json({ detail: "Sign in required" }, { status: 401 });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  for (const header of ["x-telegram-bot-api-secret-token", "x-hub-signature-256"]) {
    const value = request.headers.get(header);
    if (webhook && value) headers[header] = value;
  }
  try {
    let body: string | undefined;
    if (request.method === "POST") {
      // Bound streamed bodies as well as requests with Content-Length.
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024 * 1024) {
            await reader.cancel();
            return NextResponse.json({ detail: "Request too large" }, { status: 413 });
          }
          chunks.push(value);
        }
      }
      body = Buffer.concat(chunks).toString("utf8");
    }
    const query = webhook && request.method === "GET" ? request.nextUrl.search : "";
    const upstream = await fetch(`${getBackendUrl()}/channels${path ? `/${path}` : ""}${query}`, {
      method: request.method, headers, body, cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store",
    } });
  } catch {
    return NextResponse.json({ detail: "Channel service unavailable. Please try again." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE };
