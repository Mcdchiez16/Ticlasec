"use client";

import { useEffect, useState } from "react";

const KEY = "ticlasec-companion";
const EVENT = "ticlasec:preferences";

/** The animated floating assistant is opt-in: a professional workspace should be calm by default. */
export function getCompanionEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

export function setCompanionEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable: the choice lasts for this page view only */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useCompanionEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => setOn(getCompanionEnabled());
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return on;
}
