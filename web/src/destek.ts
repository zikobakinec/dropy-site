import "./styles/site.css";

if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
  import("./scroll").then((m) => m.initReveals());
}
