import { createRoot } from "react-dom/client";
import { Scene } from "./Scene";

export async function mountScene(tier: "high" | "low", progress: { current: number }): Promise<void> {
  const el = document.getElementById("scene");
  if (!el) return;
  // Tag labels are drawn on a canvas, so the font must be ready first.
  await document.fonts.load('800 76px "Manrope Variable"').catch(() => undefined);
  createRoot(el).render(<Scene tier={tier} progress={progress} />);
}
