/** Subtle 3D tilt on deal cards. Skipped on touch screens and with reduced motion. */
export function initTilt(root: ParentNode = document): void {
  if (matchMedia("(hover: none), (prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll<HTMLElement>(".deal-card").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg) translateY(-4px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}
