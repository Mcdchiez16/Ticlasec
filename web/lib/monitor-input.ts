export function parseMonitorLinks(value: string): string[] {
  const entries = value.trim().split(/\s+/).filter(Boolean);
  if (!entries.length || entries.length > 25) throw new Error("Enter 1–25 links, one per line.");
  return [...new Set(entries.map((entry) => {
    let url: URL;
    try { url = new URL(entry); } catch { throw new Error(`Invalid link: ${entry}`); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Use complete http:// or https:// links without embedded credentials.");
    }
    url.hash = "";
    return url.toString();
  }))];
}

export function customIntervalHours(value: string, unit: "minutes" | "hours" | "days"): number {
  const amount = Number(value);
  const hours = unit === "minutes" ? amount / 60 : unit === "days" ? amount * 24 : amount;
  if (!value.trim() || !Number.isFinite(hours) || hours < 0.5 || hours > 720) {
    throw new Error("Choose an interval between 30 minutes and 30 days.");
  }
  return hours;
}

export function intervalLabel(hours: number): string {
  const minutes = Math.round(hours * 60);
  if (minutes % 1440 === 0) return `every ${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `every ${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `every ${minutes} minutes`;
}
