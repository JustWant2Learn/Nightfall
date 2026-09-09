"use client";

import { useEffect, useState } from "react";

/**
 * Resolves a public GLB path only if the file is actually present.
 * Lets the game keep a procedural fallback until you drop Kenney /
 * Quaternius files into /public/models.
 */
export function useAvailableModel(path: string): string | null {
  const [available, setAvailable] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(path, { method: "GET", cache: "force-cache" })
      .then((response) => {
        if (!cancelled && response.ok) setAvailable(path);
      })
      .catch(() => {
        if (!cancelled) setAvailable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return available;
}
