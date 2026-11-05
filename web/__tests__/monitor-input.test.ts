import { parseMonitorLinks, customIntervalHours, intervalLabel } from "@/lib/monitor-input";

test("accepts many links and removes duplicate fragments", () => {
  expect(parseMonitorLinks("https://EXAMPLE.org\nhttps://example.org/#part\nhttp://other.onion/page")).toEqual(["https://example.org/", "http://other.onion/page"]);
});
test.each(["", "not-a-url", "file:///etc/passwd", "https://u:p@example.org", Array(26).fill("https://a.org").join("\n")])("rejects invalid links: %s", (value) => {
  expect(() => parseMonitorLinks(value)).toThrow();
});
test("custom intervals preserve units and arbitrary days", () => {
  expect(customIntervalHours("45", "minutes")).toBe(0.75);
  expect(customIntervalHours("1.5", "hours")).toBe(1.5);
  expect(customIntervalHours("10", "days")).toBe(240);
  expect(intervalLabel(240)).toBe("every 10 days");
  expect(intervalLabel(0.75)).toBe("every 45 minutes");
});
test.each(["", "NaN", "Infinity", "0", "-4", "29"]) ("rejects invalid minute interval %s", (value) => {
  expect(() => customIntervalHours(value, "minutes")).toThrow();
});
