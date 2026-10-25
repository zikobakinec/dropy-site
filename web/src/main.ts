import "./styles/site.css";
import { detectTier, readEnv } from "./scene/tier";

export const progress = { current: 0 };

const tier = detectTier(readEnv());
document.documentElement.dataset.tier = tier;

if (tier !== "none") {
  const start = () => import("./scene/mount").then((m) => m.mountScene(tier, progress));
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 2000 });
  else setTimeout(start, 600);
}
