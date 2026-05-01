"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function FadeIn({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <div style={{ opacity: 1 }}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
