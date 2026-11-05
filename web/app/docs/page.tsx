import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { PRODUCT_NAME } from "@/lib/brand";

const ENTITY_TYPES = [
  { name: "Threat Actor", color: "var(--entity-threat-actor)", desc: "Handles, aliases, operator identities" },
  { name: "Wallet", color: "var(--entity-wallet)", desc: "BTC/ETH/XMR addresses (auto blockchain lookup)" },
  { name: "Malware", color: "var(--entity-malware)", desc: "Malware families, RATs, ransomware strains" },
  { name: "Forum", color: "var(--entity-forum)", desc: "Dark web forum and marketplace names" },
  { name: "C2 Server", color: "var(--entity-c2)", desc: "Command & control infrastructure" },
  { name: "CVE", color: "var(--entity-cve)", desc: "Vulnerability identifiers" },
  { name: "Onion URL", color: "var(--entity-onion)", desc: ".onion addresses discovered during scraping" },
  { name: "Email", color: "var(--entity-email)", desc: "Email addresses extracted from content" },
  { name: "PGP Key", color: "var(--entity-pgp)", desc: "PGP fingerprints (used for actor correlation)" },
  { name: "Paste URL", color: "var(--entity-paste)", desc: "Paste site URLs containing leaked data" },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-void)] pb-24 lg:pb-0 lg:pl-[288px]">
      <AppNav />
      <div className="max-w-[720px] mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-block text-[13px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mb-8"
        >
          ← Back
        </Link>

        <h1 className="text-[36px] font-extrabold text-[var(--text-primary)] mb-12">
          {PRODUCT_NAME} / docs
        </h1>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Getting Started
          </h2>
          <p className="text-[15px] leading-[1.7] text-[var(--text-secondary)]">
            {PRODUCT_NAME} is an evidence-grounded dark web CTI platform. Submit an investigation query and the platform will:
          </p>
          <ol className="list-decimal list-inside text-[15px] leading-[1.7] text-[var(--text-secondary)] mt-3 space-y-2">
            <li>Search available dark web indexes and approved intelligence sources</li>
            <li>Scrape and extract entities from results</li>
            <li>Build a relationship graph</li>
            <li>Analyze for OPSEC failures and behavioral patterns</li>
          </ol>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Geographic Scope
          </h2>
          <p className="text-[14px] leading-[1.7] text-[var(--text-secondary)]">
            Global mode performs worldwide analysis. Zambia mode prioritises explicit Zambian indicators for the research study. Custom mode accepts any country, region, or organisation group. A geographic focus changes evidence ranking but never removes cross-border findings.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Writing Good Queries
          </h2>
          <p className="text-[15px] leading-[1.7] text-[var(--text-secondary)] mb-4">
            Effective queries are specific and targeted:
          </p>
          <div className="space-y-2">
            <code className="block bg-[var(--bg-raised)] text-[var(--accent-text)] text-[13px] px-3 py-2 rounded">
              LockBit ransomware bitcoin payment 2024
            </code>
            <code className="block bg-[var(--bg-raised)] text-[var(--accent-text)] text-[13px] px-3 py-2 rounded">
              CVE-2024-1234 exploit kit sale dark web
            </code>
            <code className="block bg-[var(--bg-raised)] text-[var(--accent-text)] text-[13px] px-3 py-2 rounded">
              threat actor handle forum credential dump
            </code>
          </div>
          <p className="text-[15px] leading-[1.7] text-[var(--text-secondary)] mt-4">
            Avoid overly broad queries like <span className="text-[var(--text-muted)]">hacking</span> or <span className="text-[var(--text-muted)]">dark web</span>.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Entity Types
          </h2>
          <div className="space-y-3">
            {ENTITY_TYPES.map((type) => (
              <div key={type.name} className="flex items-start gap-3">
                <span
                  className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                  style={{ backgroundColor: type.color }}
                />
                <div>
                  <span className="text-[15px] text-[var(--text-primary)]">{type.name}</span>
                  <span className="text-[14px] text-[var(--text-muted)]"> — {type.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Investigation Modes
          </h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-[14px] font-semibold text-[var(--text-primary)] w-20 shrink-0">Fast</span>
              <span className="text-[14px] text-[var(--text-secondary)]">Small, time-boxed source set for rapid triage</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[14px] font-semibold text-[var(--text-primary)] w-20 shrink-0">Standard</span>
              <span className="text-[14px] text-[var(--text-secondary)]">Balanced source coverage, AI extraction and enrichment</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[14px] font-semibold text-[var(--text-primary)] w-20 shrink-0">Deep</span>
              <span className="text-[14px] text-[var(--text-secondary)]">Broad source set with recursive .onion crawling</span>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Research Evaluation
          </h2>
          <p className="text-[14px] text-[var(--text-secondary)]">
            The <Link href="/evaluation" className="text-[var(--accent-text)] hover:underline">evaluation workbench</Link> calculates extraction precision, recall, exact and partial F1, classification accuracy, summary usefulness and investigation-time reduction from an annotated JSON benchmark.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Graph Controls
          </h2>
          <ul className="text-[14px] text-[var(--text-secondary)] space-y-2">
            <li>• <span className="text-[var(--text-primary)]">Strong edges only</span> — hides weak cross-page links (recommended)</li>
            <li>• <span className="text-[var(--text-primary)]">Filter by type</span> — click entity type chips to isolate</li>
            <li>• <span className="text-[var(--text-primary)]">Click node</span> — opens entity detail panel</li>
            <li>• <span className="text-[var(--text-primary)]">Click entity name</span> — opens full profile page</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Analysis Features
          </h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">Temporal Analysis</h3>
              <p className="text-[14px] text-[var(--text-secondary)]">
                Activity patterns, anomaly detection, silence breaks. Found on investigation results page.
              </p>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">OPSEC Assessment</h3>
              <p className="text-[14px] text-[var(--text-secondary)]">
                Timezone leaks, language switches, PGP reuse detection. Found on entity profile (threat actors).
              </p>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">Stylometry</h3>
              <p className="text-[14px] text-[var(--text-secondary)]">
                Writing style fingerprinting for actor attribution. Found on entity profile (threat actors).
                Matches above 75% suggest possible same actor.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Exports
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[var(--bg-raised)] px-4 py-3 rounded">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">STIX 2.1</span>
              <p className="text-[12px] text-[var(--text-muted)]">For SIEM/SOAR integration</p>
            </div>
            <div className="bg-[var(--bg-raised)] px-4 py-3 rounded">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">MISP</span>
              <p className="text-[12px] text-[var(--text-muted)]">For threat sharing platforms</p>
            </div>
            <div className="bg-[var(--bg-raised)] px-4 py-3 rounded">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">Sigma</span>
              <p className="text-[12px] text-[var(--text-muted)]">Detection rules from IOCs</p>
            </div>
            <div className="bg-[var(--bg-raised)] px-4 py-3 rounded">
              <span className="text-[14px] font-semibold text-[var(--text-primary)]">JSON</span>
              <p className="text-[12px] text-[var(--text-muted)]">Raw entity and relationship data</p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            Monitoring
          </h2>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Create keyword or URL watches. Alerts fire when content changes and can be delivered to connected Telegram or WhatsApp accounts.
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            API Access
          </h2>
          <p className="text-[14px] text-[var(--text-secondary)] mb-3">
            All endpoints require Bearer token authentication.
          </p>
          <p className="text-[14px] text-[var(--text-secondary)] mb-3">
            Get token: <code className="bg-[var(--bg-raised)] text-[var(--accent-text)] text-[13px] px-2 py-0.5 rounded">POST /auth/login</code>
          </p>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Full API: <a href="http://localhost:8000/docs" className="text-[var(--accent-text)] hover:underline">http://localhost:8000/docs</a> (FastAPI auto-docs)
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-[var(--text-muted)] mb-4">
            First Login
          </h2>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Admin credentials are set during the initial deployment via <code className="bg-[var(--bg-raised)] text-[var(--accent-text)] text-[13px] px-2 py-0.5 rounded">bash setup.sh</code>.
          </p>
          <p className="text-[13px] text-[var(--text-muted)] mt-2">
            If you did not use the setup script, the default account will require a password reset before first use.
          </p>
        </section>


      </div>
    </div>
  );
}
