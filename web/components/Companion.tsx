"use client";

import { useEffect, useRef, useState } from "react";
import SentinelScene, { type SceneMode } from "@/components/dark/SentinelScene";
import { onCompanion } from "@/lib/companionBus";
import { classifyQuery } from "@/lib/classifyQuery";
import { useCompanionEnabled } from "@/lib/preferences";

const W = 170;
const H = 190;
const SIDEBAR = 288;
const IDLE_SLEEP_MS = 40_000;

const AMBIENT = [
  "Ready when you are.",
  "Try a wallet address, an .onion URL or a CVE.",
  "I can trace an actor across forums and paste sites.",
  "Pick Deep for a broader crawl.",
  "Everything I find is cited back to its source.",
];

type Bubble = { text: string; thinking?: boolean } | null;
type Side = "left" | "right" | "top" | "below";

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * A free-floating assistant. It drifts around the page, follows the cursor, walks over to the
 * search box when you click into it, reads what you type, thinks while an investigation runs,
 * and dozes off when you are idle.
 */
export function Companion() {
  const wanted = useCompanionEnabled();
  const [wide, setWide] = useState(false);
  const enabled = wanted && wide;
  const [mode, setMode] = useState<SceneMode>("idle");
  const [bubble, setBubble] = useState<Bubble>(null);
  const [side, setSide] = useState<Side>("right");
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pos = { x: window.innerWidth - W - 60, y: 120 };
    const vel = { x: 0, y: 0 };
    const target = { x: pos.x, y: pos.y };
    const pointer = { x: -1, y: -1, t: 0 };
    const st = {
      focused: false,
      loading: false,
      errorUntil: 0,
      lastActivity: performance.now(),
      nextWaypoint: 0,
      nextAmbient: performance.now() + 6000,
      typedAt: 0,
      lastText: "",
      readAt: 0,
      mode: "idle" as SceneMode,
      side: "right" as Side,
      bubbleUntil: 0,
      sleepBubble: false,
    };
    let bubbleTimer: ReturnType<typeof setTimeout> | undefined;

    const say = (b: Bubble, ms = 5500) => {
      setBubble(b);
      clearTimeout(bubbleTimer);
      st.bubbleUntil = performance.now() + ms;
      if (ms > 0) bubbleTimer = setTimeout(() => setBubble(null), ms);
    };
    const setSceneMode = (m: SceneMode) => {
      if (st.mode !== m) {
        st.mode = m;
        setMode(m);
      }
    };

    const bounds = () => ({
      minX: SIDEBAR + 8,
      maxX: window.innerWidth - W - 12,
      minY: 12,
      maxY: window.innerHeight - H - 12,
    });
    const card = () => document.getElementById("investigate-card")?.getBoundingClientRect() ?? null;
    const column = () => document.getElementById("hero-column")?.getBoundingClientRect() ?? card();
    const overlapsCard = (x: number, y: number) => {
      const c = column();
      if (!c) return false;
      const pad = 12;
      return x + W > c.left - pad && x < c.right + pad && y + H > c.top - pad && y < c.bottom + pad;
    };
    const pickWaypoint = () => {
      const b = bounds();
      for (let i = 0; i < 16; i++) {
        const x = rand(b.minX, b.maxX);
        const y = rand(b.minY, b.maxY);
        if (!overlapsCard(x, y)) return { x, y };
      }
      return { x: b.maxX, y: b.maxY };
    };

    // ── events from the page ─────────────────────────────────
    let thinkTimer: ReturnType<typeof setTimeout> | undefined;
    const off = onCompanion((e) => {
      const now = performance.now();
      st.lastActivity = now;
      if (e.type === "focus") {
        st.focused = true;
        say({ text: "I'm listening." }, 2500);
      } else if (e.type === "blur") {
        st.focused = false;
      } else if (e.type === "input") {
        st.typedAt = now;
        st.lastText = e.text;
        if (e.text.trim().length >= 3) say({ text: "", thinking: true }, 0);
        clearTimeout(thinkTimer);
        thinkTimer = setTimeout(() => {
          const reading = classifyQuery(st.lastText);
          if (reading) say({ text: reading.message }, 7000);
          else setBubble(null);
        }, 650);
      } else if (e.type === "state") {
        st.loading = e.state === "loading";
        if (e.state === "loading") say({ text: "Analysing sources", thinking: true }, 0);
        else if (e.state === "error") {
          st.errorUntil = now + 2500;
          say({ text: "That didn't go through. Please try again." }, 4000);
        } else if (!st.focused) setBubble(null);
      }
    });
    const onMove = (ev: PointerEvent) => {
      pointer.x = ev.clientX;
      pointer.y = ev.clientY;
      pointer.t = performance.now();
      st.lastActivity = pointer.t;
    };
    const onKey = () => {
      st.lastActivity = performance.now();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onKey, { passive: true });

    // ── main loop ────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let sideCheck = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const t = now / 1000;
      const b = bounds();
      const c = card();
      const idleFor = now - st.lastActivity;
      const asleep = idleFor > IDLE_SLEEP_MS && !st.loading && !st.focused;

      let mode: SceneMode = "idle";
      let tx = target.x;
      let ty = target.y;

      if (reduced) {
        // static, politely parked beside the search box
        if (c) {
          tx = c.right + 24 <= b.maxX ? c.right + 24 : c.left - W - 24;
          ty = c.top + c.height / 2 - H / 2;
        }
      } else if (now < st.errorUntil) {
        mode = "error";
      } else if (st.loading) {
        mode = "loading";
        if (c) {
          const right = c.right + 14;
          tx = (right <= b.maxX ? right : c.left - W - 14) + Math.sin(t * 1.3) * 12;
          ty = c.top + c.height / 2 - H / 2 - 24 + Math.cos(t * 1.7) * 10;
        }
      } else if (st.focused && c) {
        mode = "email";
        // walk over beside the search box and "read" along
        const right = c.right + 14;
        tx = right <= b.maxX ? right : c.left - W - 14;
        ty = c.top + c.height / 2 - H / 2 - 24;
        if (now - st.typedAt < 900) ty += Math.sin(t * 14) * 4; // nods while you type
      } else if (asleep) {
        mode = "sleep";
        tx = b.maxX - 10;
        ty = b.maxY - 4;
      } else if (now - pointer.t < 2600 && pointer.x >= 0) {
        // curious: keep a polite distance from the cursor
        tx = pointer.x + 70;
        ty = pointer.y - H + 10;
        if (tx > b.maxX) tx = pointer.x - W - 70;
      } else {
        if (now > st.nextWaypoint) {
          const w = pickWaypoint();
          target.x = w.x;
          target.y = w.y;
          st.nextWaypoint = now + rand(3800, 7500);
        }
        tx = target.x + Math.sin(t * 0.7) * 18;
        ty = target.y + Math.cos(t * 0.9) * 14;
      }

      tx = clamp(tx, b.minX, Math.max(b.minX, b.maxX));
      ty = clamp(ty, b.minY, Math.max(b.minY, b.maxY));

      // critically damped spring toward the target
      const k = reduced ? 30 : 11;
      const damping = 2 * Math.sqrt(k) * 0.92;
      vel.x += ((tx - pos.x) * k - vel.x * damping) * dt;
      vel.y += ((ty - pos.y) * k - vel.y * damping) * dt;
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || Math.abs(pos.x) > 1e5 || Math.abs(pos.y) > 1e5) {
        // never let a bad frame fling the mascot out of the page
        pos.x = clamp(tx, b.minX, b.maxX);
        pos.y = clamp(ty, b.minY, b.maxY);
        vel.x = vel.y = 0;
      }

      setSceneMode(mode);

      // ambient "thoughts"
      if (!reduced && !st.loading && !st.focused && mode === "idle" && now > st.nextAmbient && now > st.bubbleUntil) {
        say({ text: AMBIENT[Math.floor(Math.random() * AMBIENT.length)] }, 4500);
        st.nextAmbient = now + rand(14000, 24000);
      }
      if (mode === "sleep" && !st.sleepBubble) {
        st.sleepBubble = true;
        say({ text: "zZ…" }, 0);
      } else if (mode !== "sleep" && st.sleepBubble) {
        st.sleepBubble = false;
        setBubble(null);
      }

      // choose the bubble side with hysteresis so it never clips the screen
      if (now - sideCheck > 250) {
        sideCheck = now;
        const BW = 260;
        const BH = 80;
        const hits = (x0: number, y0: number, x1: number, y1: number) => !!c && x1 > c.left - 6 && x0 < c.right + 6 && y1 > c.top - 6 && y0 < c.bottom + 6;
        const rightOk = pos.x + W + BW + 8 <= window.innerWidth && !hits(pos.x + W, pos.y + 8, pos.x + W + BW, pos.y + 8 + BH);
        const leftOk = pos.x - BW >= SIDEBAR && !hits(pos.x - BW, pos.y + 8, pos.x, pos.y + 8 + BH);
        const onLeftOfCard = !!c && pos.x + W / 2 < (c.left + c.right) / 2;
        const fallback: Side = pos.y + H + BH < window.innerHeight ? "below" : "top";
        const want: Side = onLeftOfCard ? (leftOk ? "left" : rightOk ? "right" : fallback) : rightOk ? "right" : leftOk ? "left" : fallback;
        if (want !== st.side) {
          st.side = want;
          setSide(want);
        }
      }

      const roll = clamp(vel.x * 0.012, -9, 9);
      if (wrapRef.current) wrapRef.current.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
      if (bodyRef.current) bodyRef.current.style.transform = `rotate(${roll.toFixed(2)}deg)`;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      off();
      clearTimeout(bubbleTimer);
      clearTimeout(thinkTimer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-30 will-change-transform"
      style={{ width: W, height: H, transform: "translate3d(-300px,-300px,0)" }}
    >
      <div ref={bodyRef} className="absolute inset-0 origin-center">
        <SentinelScene mode={mode} variant="compact" hover className="absolute inset-0" />
      </div>
      {bubble && (
        <div
          key={bubble.text || "thinking"}
          className={`absolute top-2 w-max max-w-[250px] rounded-2xl border-2 border-[var(--border-dim)] bg-[var(--bg-surface)] px-3.5 py-2 text-[13px] font-bold leading-snug text-[var(--text-primary)] shadow-[0_4px_0_var(--edge)] [animation:companion-pop_0.25s_ease-out] ${
            side === "right" ? "left-full ml-1" : side === "left" ? "right-full mr-1" : side === "below" ? "!top-full right-0 mt-1" : "bottom-full right-0 mb-1 !top-auto"
          }`}
        >
          {bubble.thinking ? (
            <span className="inline-flex items-center gap-1.5">
              {bubble.text && <span className="text-[var(--text-secondary)]">{bubble.text}</span>}
              <span className="inline-flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] [animation:companion-dot_1.1s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.18}s` }} />
                ))}
              </span>
            </span>
          ) : (
            bubble.text
          )}
        </div>
      )}
    </div>
  );
}
