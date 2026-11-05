import { GET } from "@/app/api/investigations/route"
import { POST as regenerateBriefing } from "@/app/api/investigations/[id]/briefing/route"

jest.mock("@/lib/session", () => ({
  getSessionAuthorization: () => "Bearer test-token",
}))

beforeEach(() => {
  global.fetch = jest.fn()
})

test("normalizes the backend list into the pagination envelope used by the page", async () => {
  const upstream = [
    {
      id: "investigation-1",
      query: "Example investigation",
      status: "completed",
      created_at: "2026-10-22T10:00:00Z",
      entity_count: 2,
      page_count: 1,
    },
  ]

  ;(fetch as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify(upstream), {
      status: 200,
      headers: { "x-total-count": "7" },
    }),
  )

  const response = await GET(
    new Request("http://localhost/api/investigations?skip=0&limit=20"),
  )

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    items: upstream,
    total: 7,
    skip: 0,
    limit: 20,
  })
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/investigations\?offset=0&limit=20$/),
    expect.objectContaining({
      cache: "no-store",
      headers: { Authorization: "Bearer test-token" },
    }),
  )
})

test("rejects an invalid successful payload instead of crashing the page", async () => {
  ;(fetch as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
  )

  const response = await GET(
    new Request("http://localhost/api/investigations?skip=0&limit=20"),
  )

  expect(response.status).toBe(502)
  expect(await response.json()).toEqual({ error: "Invalid investigations response" })
})

test("forwards an authenticated briefing regeneration request", async () => {
  ;(fetch as jest.Mock).mockResolvedValue(
    new Response(JSON.stringify({ summary: "## Threat actors and groups\n- ExampleGroup [S1]" }), { status: 200 }),
  )

  const response = await regenerateBriefing(
    new Request("http://localhost/api/investigations/investigation-1/briefing", { method: "POST" }),
    { params: { id: "investigation-1" } },
  )

  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    summary: "## Threat actors and groups\n- ExampleGroup [S1]",
  })
  expect(fetch).toHaveBeenCalledWith(
    expect.stringMatching(/\/investigations\/investigation-1\/briefing$/),
    expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer test-token" },
    }),
  )
})
