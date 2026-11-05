import { GET, POST } from "@/app/api/evaluation/proposal/[[...action]]/route";
import { POST as mfa } from "@/app/api/auth/mfa/[[...action]]/route";
import { GET as corpus } from "@/app/api/evaluation/synthetic-corpus/route";
import { getSessionAuthorization } from "@/lib/session";
jest.mock("@/lib/session", () => ({ getSessionAuthorization: jest.fn() }));
beforeEach(() => { global.fetch = jest.fn(); (getSessionAuthorization as jest.Mock).mockReturnValue("Bearer test"); });
test("research proxy requires authentication and known actions", async () => {
  (getSessionAuthorization as jest.Mock).mockReturnValue(null);
  expect((await GET(new Request("http://localhost/api/evaluation/proposal"), {params:{}})).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
  (getSessionAuthorization as jest.Mock).mockReturnValue("Bearer test");
  expect((await POST(new Request("http://localhost", {method:"POST"}), {params:{action:["arbitrary"]}})).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
test("audit errors and no-store are preserved", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({detail:"Bad hash"}), {status:422}));
  const response = await POST(new Request("http://localhost", {method:"POST",body:"{}"}), {params:{action:["audit"]}});
  expect(response.status).toBe(422);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/evaluation/proposal/audit"), expect.objectContaining({cache:"no-store",headers:{Authorization:"Bearer test","Content-Type":"application/json"}}));
});
test("MFA setup is authenticated and never cached", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({secret:"temporary"})));
  const response = await mfa(new Request("http://localhost", {method:"POST",body:'{"password":"test"}'}), {params:{action:["setup"]}});
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("frozen synthetic corpus requires a session and stays server-proxied", async () => {
  (getSessionAuthorization as jest.Mock).mockReturnValue(null);
  expect((await corpus()).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();

  (getSessionAuthorization as jest.Mock).mockReturnValue("Bearer test");
  (fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify({ manifest: { documents: 50 }, documents: [] })));
  expect((await corpus()).status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/evaluation/synthetic-corpus"),
    expect.objectContaining({ cache: "no-store", headers: { Authorization: "Bearer test" } }),
  );
});
