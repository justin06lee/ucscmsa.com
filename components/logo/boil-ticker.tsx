"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const BoilTickerContext = createContext(0);

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const m = window.matchMedia(REDUCED_MOTION_QUERY);
  m.addEventListener?.("change", onChange);
  return () => m.removeEventListener?.("change", onChange);
}

function getReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function BoilTickerProvider({
  intervalMs = 250,
  children,
}: {
  intervalMs?: number;
  children: ReactNode;
}) {
  const [tick, setTick] = useState(0);
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotion,
    () => false,
  );

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, reduced]);

  return (
    <BoilTickerContext.Provider value={reduced ? 0 : tick}>
      {children}
    </BoilTickerContext.Provider>
  );
}

export function useBoilTick() {
  return useContext(BoilTickerContext);
}
