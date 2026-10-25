import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/** Fade-up for every .reveal block. Not called when the user prefers reduced motion. */
export function initReveals(): void {
  gsap.utils.toArray<HTMLElement>(".reveal").forEach((el) => {
    gsap.from(el, { y: 36, opacity: 0, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  });
}

/** Maps hero → end of "Necə işləyir" to progress 0..1 for the 3D scene, then dims the canvas. */
export function trackProgress(progress: { current: number }): void {
  ScrollTrigger.create({
    trigger: "#top",
    start: "top top",
    endTrigger: "#how",
    end: "bottom center",
    onUpdate: (s) => {
      progress.current = s.progress;
    },
  });
  gsap.to("#scene", { opacity: 0.18, ease: "none", scrollTrigger: { trigger: "#deals", start: "top bottom", end: "top 30%", scrub: true } });
}
