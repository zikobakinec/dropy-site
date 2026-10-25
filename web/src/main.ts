import "./styles/site.css";
import { detectTier, readEnv } from "./scene/tier";
import { initTilt } from "./tilt";

const progress = { current: 0 };
const env = readEnv();
const tier = detectTier(env);
document.documentElement.dataset.tier = tier;

initTilt();

if (!env.reducedMotion) {
  const track = document.querySelector(".marquee-track");
  if (track) {
    for (const child of Array.from(track.children)) {
      const clone = child.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      if (clone instanceof HTMLAnchorElement) clone.tabIndex = -1;
      clone.querySelectorAll("a").forEach((a) => (a.tabIndex = -1));
      track.appendChild(clone);
    }
  }
  import("./scroll").then((m) => {
    m.initReveals();
    if (tier !== "none") m.trackProgress(progress);
  });
}

if (tier !== "none") {
  const start = () => import("./scene/mount").then((m) => m.mountScene(tier, progress));
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2000 });
  else setTimeout(start, 600);
}
