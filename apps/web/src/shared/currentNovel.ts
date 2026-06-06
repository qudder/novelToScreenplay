import { useCallback, useEffect, useState } from "react";
import type { CurrentNovel } from "./types";

const STORAGE_KEY = "novel-to-screenplay.currentNovel";

export function getCurrentNovel(): CurrentNovel | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CurrentNovel;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveCurrentNovel(novel: CurrentNovel) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(novel));
  window.dispatchEvent(new CustomEvent("current-novel-updated"));
}

export function useCurrentNovel() {
  const [novel, setNovel] = useState<CurrentNovel | null>(() => getCurrentNovel());

  const refresh = useCallback(() => {
    setNovel(getCurrentNovel());
  }, []);

  useEffect(() => {
    window.addEventListener("storage", refresh);
    window.addEventListener("current-novel-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("current-novel-updated", refresh);
    };
  }, [refresh]);

  return novel;
}
