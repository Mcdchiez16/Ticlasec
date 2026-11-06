"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardCheck, FolderSearch, Radar, Search, Settings, type LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { useAlertCount } from "@/components/MonitorNavBadge";
import { StatusBar } from "@/components/StatusBar";
import { LogoutButton } from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/ThemeToggle";

type Item = { href: string; label: string; short: string; icon: LucideIcon; exact?: boolean; badge?: boolean };

const ITEMS: Item[] = [
  { href: "/", label: "Investigate", short: "Home", icon: Search, exact: true },
  { href: "/investigations", label: "Investigations", short: "Cases", icon: FolderSearch },
  { href: "/monitor", label: "Monitoring", short: "Monitor", icon: Radar, badge: true },
  { href: "/evaluation", label: "Evaluation", short: "Eval", icon: ClipboardCheck },
  { href: "/docs", label: "Documentation", short: "Docs", icon: BookOpen },
];
const SETTINGS: Item = { href: "/settings", label: "Settings", short: "Settings", icon: Settings };

/**
 * Floating left sidebar on desktop; compact top bar + floating bottom tab bar on small screens.
 * Pages offset their content with `lg:pl-[288px]` (and `pb-24 lg:pb-0`) on their root element.
 */
export function AppNav() {
  const pathname = usePathname() ?? "";
  const alerts = useAlertCount();
  const isActive = (i: Item) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/"));

  const renderSideLink = (item: Item) => {
    const Icon = item.icon;
    return (
      <Link href={item.href} className="dw-side-link" aria-current={isActive(item) ? "page" : undefined}>
        <Icon className="h-[20px] w-[20px] shrink-0" strokeWidth={2.4} />
        <span className="truncate">{item.label}</span>
        {item.badge && alerts > 0 && (
          <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1.5 text-[11px] font-extrabold leading-none text-white">{alerts}</span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop: floating sidebar */}
      <aside
        aria-label="Sidebar"
        className="dw-card fixed bottom-4 left-4 top-4 z-40 hidden w-[256px] flex-col p-3 shadow-[var(--float-shadow)] lg:flex"
      >
        <div className="px-3 pb-4 pt-2">
          <Wordmark size={27} />
          <p className="mt-1.5 pl-[3px] text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">Threat Intelligence</p>
        </div>

        <p className="px-[14px] pb-1.5 pt-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[var(--text-muted)]">Workspace</p>
        <nav aria-label="Primary" className="flex flex-col gap-1">
          {ITEMS.map((item) => (
            <div key={item.href}>{renderSideLink(item)}</div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <div className="rounded-xl bg-[var(--bg-raised)] px-4 py-3">
            <StatusBar stacked />
          </div>
          {renderSideLink(SETTINGS)}
          <ThemeToggle />
          <LogoutButton block />
        </div>
      </aside>

      {/* Small screens: top bar */}
      <header className="flex items-center justify-between px-4 py-3 lg:hidden">
        <Wordmark size={22} />
        <div className="flex items-center gap-2">
          <ThemeToggle variant="icon" />
          <LogoutButton />
        </div>
      </header>

      {/* Small screens: floating bottom tab bar */}
      <nav aria-label="Primary" className="dw-card fixed inset-x-3 bottom-3 z-40 flex items-stretch justify-around gap-0.5 p-1.5 shadow-[var(--float-shadow)] lg:hidden">
        {[...ITEMS.slice(0, 3), SETTINGS].map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="dw-tab-link" aria-current={isActive(item) ? "page" : undefined}>
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={2.4} />
                {item.badge && alerts > 0 && <span className="absolute -right-2 -top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--danger)] ring-2 ring-[var(--bg-surface)]" />}
              </span>
              <span>{item.short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
