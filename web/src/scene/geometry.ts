import * as THREE from "three";
import { COLORS } from "../ui/tokens";

// All objects are built in code (no model files) to keep the 3D chunk small.

export function tagGeometry(): THREE.ExtrudeGeometry {
  const w = 1.1, h = 0.62, r = 0.12, tip = 0.32;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - tip, -h / 2);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2 - tip, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const hole = new THREE.Path();
  hole.absarc(w / 2 - tip, 0, 0.07, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 12 });
  g.center();
  return g;
}

/** White "-30%"-style text for the tag face. Call after fonts are ready. */
export function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = '800 76px "Manrope Variable", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 112, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export const geo = {
  tag: tagGeometry(),
  ring: new THREE.TorusGeometry(0.17, 0.065, 16, 40),
  slash: new THREE.CapsuleGeometry(0.06, 0.78, 6, 16),
  bag: new THREE.BoxGeometry(0.8, 0.9, 0.38),
  handle: new THREE.TorusGeometry(0.2, 0.03, 10, 28, Math.PI),
  label: new THREE.PlaneGeometry(0.9, 0.45),
};

export const mat = {
  coral: new THREE.MeshStandardMaterial({ color: COLORS.primary, roughness: 0.45 }),
  coralGloss: new THREE.MeshStandardMaterial({ color: COLORS.primary, roughness: 0.18 }),
  teal: new THREE.MeshStandardMaterial({ color: COLORS.accent, roughness: 0.4 }),
  paper: new THREE.MeshStandardMaterial({ color: COLORS.paper, roughness: 0.85 }),
};
