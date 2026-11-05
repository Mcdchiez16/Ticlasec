"use client";

import { Companion } from "@/components/Companion";
import { InvestigationInput } from "@/components/InvestigationInput";

export function HomeHero() {
  return (
    <main className="relative flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-16 lg:min-h-screen lg:px-8">
      <div id="hero-column" className="flex w-full max-w-[880px] flex-col items-center gap-7 text-center sm:gap-9">
        <div className="flex w-full flex-col items-center gap-4">
          <h1 className="text-balance text-[2.25rem] font-black leading-[1.12] tracking-tight text-[var(--text-primary)] md:text-[2.75rem]">
            What are you <span className="text-[var(--accent)]">investigating</span> today?
          </h1>
          <p className="max-w-[600px] text-pretty text-[15px] font-semibold leading-relaxed text-[var(--text-secondary)]">
            Evidence-grounded dark web intelligence for worldwide investigations, with configurable country and regional focus.
          </p>
        </div>

        <div className="w-full text-left">
          <InvestigationInput />
        </div>
      </div>

      <Companion />
    </main>
  );
}
