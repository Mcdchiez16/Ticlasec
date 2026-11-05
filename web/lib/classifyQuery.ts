/** Lightweight, local reading of what the analyst typed, so the companion can respond sensibly. */
export type QueryKind =
  | "bitcoin"
  | "ethereum"
  | "monero"
  | "onion"
  | "cve"
  | "ip"
  | "email"
  | "hash"
  | "ransomware"
  | "actor"
  | "malware"
  | "text";

export interface QueryReading {
  kind: QueryKind;
  /** short noun for the kind of thing detected, e.g. "Bitcoin wallet" */
  label: string;
  message: string;
}

const RULES: { kind: QueryKind; label: string; test: RegExp; message: string }[] = [
  { kind: "onion", label: "Onion address", test: /\b[a-z2-7]{16,56}\.onion\b/i, message: "An onion address. I'll look for mentions and related infrastructure." },
  { kind: "bitcoin", label: "Bitcoin wallet", test: /\b(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/, message: "That looks like a Bitcoin wallet. I'll trace mentions and linked activity." },
  { kind: "ethereum", label: "Ethereum address", test: /\b0x[a-fA-F0-9]{40}\b/, message: "An Ethereum address. I'll search for where it appears." },
  { kind: "monero", label: "Monero address", test: /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/, message: "A Monero address. I'll look for mentions, though it's hard to trace." },
  { kind: "cve", label: "CVE", test: /\bCVE-\d{4}-\d{4,}\b/i, message: "A CVE. I'll check exploit sales and chatter around it." },
  { kind: "email", label: "Email address", test: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, message: "An email address. I'll check for leaks and linked handles." },
  { kind: "ip", label: "IP address", test: /\b(?:\d{1,3}\.){3}\d{1,3}\b/, message: "An IP address. I'll look for infrastructure overlap." },
  { kind: "hash", label: "File hash", test: /\b(?:[a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})\b/i, message: "A file hash. I'll look for related malware discussion." },
  { kind: "ransomware", label: "Ransomware", test: /ransom|lockbit|blackbasta|black basta|conti|akira|leak site|extortion/i, message: "Ransomware activity. I'll check leak sites and victim announcements." },
  { kind: "malware", label: "Malware", test: /malware|stealer|botnet|loader|trojan|infostealer|rat\b|redline|qakbot/i, message: "Malware research. I'll look at sales, builders and C2 chatter." },
  { kind: "actor", label: "Threat actor", test: /threat actor|handle|alias|apt\s?\d+|scattered spider|group\b/i, message: "Looks like an actor search. I'll build a profile across forums." },
];

export function classifyQuery(text: string): QueryReading | null {
  const t = text.trim();
  if (t.length < 3) return null;
  for (const r of RULES) if (r.test.test(t)) return { kind: r.kind, label: r.label, message: r.message };
  if (t.length >= 12) return { kind: "text", label: "Keyword search", message: "I'll search across dark web sources." };
  return null;
}
