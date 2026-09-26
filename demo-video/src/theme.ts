import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";

export const inter = loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;
export const roboto = loadRoboto("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily;

export const C = {
  canvas: "#e9eefb", // flat pastel backdrop, no gradients
  card: "#ffffff",
  ink: "#1f1f1f",
  ink2: "#444746",
  muted: "#5f6368",
  line: "#e3e6ea",
  lineSoft: "#f1f3f4",
  primary: "#0b57d0",
  before: "#5b6fd6", // every event starts in the calendar's one default color
  toast: "#303134",
};
