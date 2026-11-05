/** Marks an investigation that ran over built-in synthetic data, never the live network. */
export function SyntheticBadge({ title }: { title?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--info-dim,var(--focus-bg))] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--info,var(--accent-text))]"
      title={title ? `Synthetic data: ${title}. Nothing here came from the live network.` : "Synthetic data. Nothing here came from the live network."}
      data-testid="synthetic-badge"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M6 2h4M7 2v4L3.5 12.5A1.2 1.2 0 0 0 4.6 14h6.8a1.2 1.2 0 0 0 1.1-1.5L9 6V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Synthetic data
    </span>
  );
}
