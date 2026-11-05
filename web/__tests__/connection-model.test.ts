import {
  applyFilters,
  buildModel,
  defangText,
  displayValue,
  focusConnections,
  groupConnections,
  layoutOverview,
  middleTruncate,
  shortestPath,
  visibleEdges,
} from "@/components/connections/model"
import type { GraphApiResponse, InvestigationEntity } from "@/lib/types/investigation"

const onion = (i: number) => `abc${String(i).padStart(3, "0")}xyzabcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqr.onion`

function sample(onionCount = 40): { data: GraphApiResponse; entities: InvestigationEntity[] } {
  const nodes = [
    { id: "actor-play", type: "ThreatActor", confidence: 0.66 },
    { id: "malware-ranion", type: "MalwareFamily", confidence: 0.64 },
    { id: "wallet-1", type: "CryptoWallet", confidence: 0.7 },
    { id: "hub", type: "OnionURL", confidence: 0.6 },
    ...Array.from({ length: onionCount }, (_, i) => ({ id: onion(i), type: "OnionURL", confidence: 0.6 })),
  ]
  const edges = [
    { source: "actor-play", target: "malware-ranion", type: "USES", confidence: 0.9 },
    { source: "actor-play", target: "wallet-1", type: "CONTROLS", confidence: 0.8 },
    { source: "malware-ranion", target: "hub", type: "CO_APPEARED_ON", confidence: 0.6 },
    // the hub page was seen alongside every other onion site: the "hairball" case
    ...Array.from({ length: onionCount }, (_, i) => ({ source: "hub", target: onion(i), type: "CO_APPEARED_ON", confidence: 1 })),
  ]
  return { data: { nodes, edges } as GraphApiResponse, entities: [] }
}

const noFilters = { hiddenCategories: new Set<never>(), strongOnly: false, search: "" }

test("nodes are placed in lanes by what they are", () => {
  const { data, entities } = sample(2)
  const model = buildModel(data, entities, { defang: true })
  expect(model.nodes.get("actor-play")?.lane).toBe("actors")
  expect(model.nodes.get("malware-ranion")?.lane).toBe("threats")
  expect(model.nodes.get("wallet-1")?.lane).toBe("identifiers")
  expect(model.nodes.get("hub")?.lane).toBe("infrastructure")
})

test("parallel and reversed links between a pair merge into one connection", () => {
  const data = {
    nodes: [
      { id: "a", type: "ThreatActor" },
      { id: "b", type: "OnionURL" },
    ],
    edges: [
      { source: "a", target: "b", type: "CO_APPEARED_ON" },
      { source: "b", target: "a", type: "CO_APPEARED_ON" },
      { source: "a", target: "b", type: "POSTED_BY" },
    ],
  } as unknown as GraphApiResponse
  const model = buildModel(data, [], { defang: false })
  expect(model.edges).toHaveLength(2) // one "seen together" pair, one directed relationship
  const strong = model.edges.find((e) => e.strong)!
  expect(strong.label).toBe("Posted by")
})

test("a large lane is capped, and selecting a hidden node reveals it", () => {
  const { data, entities } = sample(80)
  const model = buildModel(data, entities, { defang: true })
  const collapsed = layoutOverview(model, { expandedLanes: new Set(), pinned: new Set() })
  const infra = collapsed.lanes.find((l) => l.key === "infrastructure")!
  expect(infra.shown).toBe(10)
  expect(infra.hidden).toBe(81 - 10) // the hub + 80 onion sites, minus the 10 shown
  const lastOnion = onion(79)
  expect(collapsed.positions.has(lastOnion)).toBe(false)

  const revealed = layoutOverview(model, { expandedLanes: new Set(), pinned: new Set([lastOnion]) })
  expect(revealed.positions.has(lastOnion)).toBe(true)
  // the lane stays tidy: the revealed node takes a slot instead of growing the lane
  expect(revealed.lanes.find((l) => l.key === "infrastructure")!.shown).toBe(10)
})

test("layout is deterministic, so updates do not shuffle the map", () => {
  const { data, entities } = sample(30)
  const model = buildModel(data, entities, { defang: true })
  const a = layoutOverview(model, { expandedLanes: new Set(), pinned: new Set() })
  const b = layoutOverview(buildModel(data, entities, { defang: true }), { expandedLanes: new Set(), pinned: new Set() })
  expect([...a.positions.entries()]).toEqual([...b.positions.entries()])
})

test("overview lanes share a baseline and connected rows are ordered to reduce crossings", () => {
  const data = {
    nodes: [
      { id: "actor-a", type: "ThreatActor" },
      { id: "actor-b", type: "ThreatActor" },
      { id: "site-x", type: "OnionURL" },
      { id: "site-y", type: "OnionURL" },
    ],
    // Alphabetical placement would cross these links (A→Y and B→X).
    edges: [
      { source: "actor-a", target: "site-y", type: "CONTROLS", confidence: 0.9 },
      { source: "actor-b", target: "site-x", type: "CONTROLS", confidence: 0.9 },
    ],
  } as unknown as GraphApiResponse
  const model = buildModel(data, [], { defang: true })
  const layout = layoutOverview(model, { expandedLanes: new Set(), pinned: new Set() })
  expect(new Set(layout.lanes.map((lane) => lane.height)).size).toBe(1)
  expect(layout.positions.get("site-y")!.y).toBeLessThan(layout.positions.get("site-x")!.y)
})

test("the overview does not paint a fan of same-lane links, but shows them for the selection", () => {
  const { data, entities } = sample(40)
  const model = buildModel(data, entities, { defang: true })
  const layout = layoutOverview(model, { expandedLanes: new Set(), pinned: new Set() })
  const calm = visibleEdges(model, layout.positions, new Set())
  // cross-lane + direct relationships only: actor→malware, actor→wallet, malware→hub
  expect(calm.length).toBe(3)
  const focused = visibleEdges(model, layout.positions, new Set(["hub"]))
  expect(focused.length).toBeGreaterThan(calm.length)
})

test("filters remove hidden categories and the links that touched them", () => {
  const { data, entities } = sample(5)
  const model = buildModel(data, entities, { defang: true })
  const filtered = applyFilters(model, { ...noFilters, hiddenCategories: new Set(["ONION_URL"] as const) })
  expect([...filtered.nodes.keys()].sort()).toEqual(["actor-play", "malware-ranion", "wallet-1"])
  expect(filtered.edges).toHaveLength(2)
  const strongOnly = applyFilters(model, { ...noFilters, strongOnly: true })
  expect(strongOnly.edges.every((e) => e.strong)).toBe(true)
})

test("shortest path follows direct relationships and reports no path when unconnected", () => {
  const { data, entities } = sample(3)
  const model = buildModel(data, entities, { defang: true })
  const path = shortestPath(model, "wallet-1", onion(0))!
  expect(path.nodes).toEqual(["wallet-1", "actor-play", "malware-ranion", "hub", onion(0)])
  expect(path.edges).toHaveLength(4)
  const lonely = buildModel(
    { nodes: [{ id: "x", type: "OnionURL" }, { id: "y", type: "OnionURL" }], edges: [] } as unknown as GraphApiResponse,
    [],
    { defang: true },
  )
  expect(shortestPath(lonely, "x", "y")).toBeNull()
})

test("connections are grouped by meaning, direct relationships first", () => {
  const { data, entities } = sample(20)
  const model = buildModel(data, entities, { defang: true })
  const groups = groupConnections(focusConnections(model, "hub"), 8)
  const together = groups.find((g) => g.weak)!
  expect(together.items).toHaveLength(8)
  expect(together.hidden).toBe(13) // 20 sites + the malware page-mate, minus the 8 listed
  const actorGroups = groupConnections(focusConnections(model, "actor-play"))
  expect(actorGroups.map((g) => g.weak)).toEqual([false, false]) // "Uses" and "Controls" are direct relationships
  expect(actorGroups.map((g) => g.label).sort()).toEqual(["Controls", "Uses"])
})

test("safe display defangs indicators and trims onion links to the host", () => {
  expect(defangText("http://example.onion/path")).toBe("hxxp://example[.]onion/path")
  expect(defangText("already[.]safe")).toBe("already[.]safe")
  const label = displayValue("ONION_URL", "hxxp://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx[.]onion/forum", true, 24)
  expect(label.length).toBeLessThanOrEqual(24)
  expect(label).not.toContain("/forum")
  expect(displayValue("EMAIL", "a@b.com", true)).toBe("a[@]b[.]com")
  expect(displayValue("THREAT_ACTOR", "play", true)).toBe("play")
  expect(middleTruncate("0123456789", 6)).toHaveLength(6)
})
