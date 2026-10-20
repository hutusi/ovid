/** True when the user has asked the OS for less motion. CSS animations are
 *  already covered by the media query in global.css; script-driven motion
 *  (smooth scrolling) checks this instead. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll behavior that honours the reduced-motion preference. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
