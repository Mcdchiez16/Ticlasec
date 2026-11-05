import { GET, POST } from "@/app/api/investigations/[id]/workbench/[[...action]]/route";
import { GET as demo } from "@/app/api/evaluation/lead-demo/route";
import { getSessionAuthorization } from "@/lib/session";

jest.mock("@/lib/session", () => ({ getSessionAuthorization: jest.fn() }));

beforeEach(() => {
  global.fetch = jest.fn();
  (getSessionAuthorization as jest.Mock).mockReturnValue("Bearer test-token");
});

test("review and demo require a session before any backend call", async () => {
  (getSessionAuthorization as jest.Mock).mockReturnValue(null);
  const response = await GET(new Request("http://localhost/api/investigations/case/workbench"), { params: { id: "case" } });
  expect(response.status).toBe(401);
  expect((await demo()).status).toBe(401);
  expect(fetch).not.toHaveBeenCalled();
});

test("case export keeps the download header and disables caching", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response('{"history":[]}', {
    headers: { "Content-Disposition": 'attachment; filename="case.json"' },
  }));
  const response = await GET(new Request("http://localhost/api/investigations/case/workbench/export"), { params: { id: "case", action: ["export"] } });
  expect(response.headers.get("content-disposition")).toContain("case.json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/investigations\/case\/workbench\/export$/), expect.objectContaining({ headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" } }));
});

test("review forwards the revision and preserves backend conflicts", async () => {
  (fetch as jest.Mock).mockResolvedValue(new Response('{"detail":"Reload the case"}', {status:409}));
  const entity = "00000000-0000-0000-0000-000000000001";
  const body = JSON.stringify({decision:"accepted",expected_version:2,reason:"Supporting passage"});
  const response = await POST(new Request("http://localhost/api/review", {method:"POST",body}), {params:{id:"case",action:[entity,"review"]}});
  expect(response.status).toBe(409);
  expect(fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({method:"POST",body}));
});

test("unknown workbench actions cannot be forwarded", async () => {
  const response = await GET(new Request("http://localhost/api/review"), {params:{id:"case",action:["arbitrary"]}});
  expect(response.status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});

test("backend outage returns a readable error", async () => {
  (fetch as jest.Mock).mockRejectedValue(new Error("offline"));
  expect((await demo()).status).toBe(502);
  const response = await GET(new Request("http://localhost/api/review"),{params:{id:"case"}});
  expect(response.status).toBe(502);
});
