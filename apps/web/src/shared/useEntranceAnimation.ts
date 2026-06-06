import { useEffect, useRef } from "react";
import gsap from "gsap";

export function useEntranceAnimation<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const context = gsap.context(() => {
      gsap.fromTo(
        ".animate-in",
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: "power2.out" }
      );
    }, ref);

    return () => context.revert();
  }, []);

  return ref;
}

