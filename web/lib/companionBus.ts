/** Tiny event bus between page components and the floating companion mascot. */
export type CompanionEvent =
  | { type: "focus" }
  | { type: "blur" }
  | { type: "input"; text: string }
  | { type: "state"; state: "idle" | "loading" | "error" };

const EVENT = "ticlasec:companion";

export function emitCompanion(detail: CompanionEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CompanionEvent>(EVENT, { detail }));
}

export function onCompanion(handler: (e: CompanionEvent) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<CompanionEvent>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
