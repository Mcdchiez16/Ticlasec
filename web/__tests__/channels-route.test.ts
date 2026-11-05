import { NextRequest } from "next/server";
import { GET, POST, DELETE } from "@/app/api/channels/[[...path]]/route";
import { getSessionAuthorization } from "@/lib/session";
jest.mock("@/lib/session", () => ({ getSessionAuthorization: jest.fn() }));
beforeEach(() => { global.fetch = jest.fn(); (getSessionAuthorization as jest.Mock).mockReturnValue("Bearer test"); });
test("account routes require auth and allowlisted actions", async () => {
  (getSessionAuthorization as jest.Mock).mockReturnValue(null);
  expect((await GET(new NextRequest("http://localhost/api/channels"), {params:{}})).status).toBe(401);
  expect((await DELETE(new NextRequest("http://localhost", {method:"DELETE"}), {params:{path:["webhooks", "telegram"]}})).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
test("linking codes never use cache", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response('{"url":"https://t.me/test"}'));
  const response = await POST(new NextRequest("http://localhost/api/channels/link", {method:"POST",body:'{"provider":"telegram","consent":true}'}), {params:{path:["link"]}});
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/channels/link"), expect.objectContaining({headers: {"Content-Type":"application/json", Authorization:"Bearer test"}}));
});
test("webhook proxy preserves the signed body and does not forward session auth", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response('{"ok":true}'));
  const body = '{ "message": "café" }';
  const response = await POST(new NextRequest("http://localhost/api/channels/webhooks/whatsapp", {method:"POST",body,headers:{"x-hub-signature-256":"sha256=signature"}}), {params:{path:["webhooks","whatsapp"]}});
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({body,headers:{"Content-Type":"application/json","x-hub-signature-256":"sha256=signature"}}));
});

test("QR polling is authenticated and uncached; internal bridge routes are never exposed", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response('{"status":"awaiting_scan"}'));
  const ctx = {params:{path:["whatsapp", "qr"]}};
  const response = await GET(new NextRequest("http://localhost/api/channels/whatsapp/qr"), ctx);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/channels/whatsapp/qr"), expect.objectContaining({cache:"no-store",headers:{"Content-Type":"application/json",Authorization:"Bearer test"}}));
  expect((await POST(new NextRequest("http://localhost/api/channels/bridge/event", {method:"POST",body:"{}"}), {params:{path:["bridge","event"]}})).status).toBe(404);
  (getSessionAuthorization as jest.Mock).mockReturnValue(null);
  expect((await GET(new NextRequest("http://localhost/api/channels/whatsapp/qr"), ctx)).status).toBe(401);
  expect((await POST(new NextRequest("http://localhost/api/channels/whatsapp/qr", {method:"POST",body:"{}"}), ctx)).status).toBe(401);
});
