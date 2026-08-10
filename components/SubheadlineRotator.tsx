"use client";

import { useEffect, useState } from "react";

const ROTATE_INTERVAL_MS = 4500;
const FADE_DURATION_MS = 300;

const DEFAULT_PHRASES = [
  "Send homeowners a link to digitally sign and pay for change orders — no more he-said-she-said.",
  "Keep subcontractors and clients aligned on every scope change, in writing.",
  "Give commercial clients a professional portal to approve work in minutes, not meetings.",
  "Turn scope changes into signed, paid approvals — before the extra work even starts.",
];

export default function SubheadlineRotator({
  phrases = DEFAULT_PHRASES,
}: {
  phrases?: string[];
}) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phrases.length < 2) return;

    const interval = setInterval(() => {
      setVisible(false);
      const swap = setTimeout(() => {
        setIndex((i) => (i + 1) % phrases.length);
        setVisible(true);
      }, FADE_DURATION_MS);
      return () => clearTimeout(swap);
    }, ROTATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [phrases.length]);

  return (
    <p
      aria-live="polite"
      className={`mt-3 max-w-md text-gray-900 transition-opacity duration-300 ease-in-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {phrases[index]}
    </p>
  );
}
