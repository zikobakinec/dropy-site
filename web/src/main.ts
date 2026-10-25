import "./styles/site.css";
import { detectTier, readEnv } from "./scene/tier";
import { initTilt } from "./tilt";

const progress = { current: 0 };
const env = readEnv();
const tier = detectTier(env);
document.documentElement.dataset.tier = tier;

initTilt();

if (!env.reducedMotion) {
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
