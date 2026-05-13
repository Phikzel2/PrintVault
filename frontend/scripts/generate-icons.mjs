// Generates PNG icons for PWA from an SVG template.
// Run during Docker build via: node scripts/generate-icons.mjs
import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

// Stacked-layers icon on brand-purple rounded square, matching the app logo
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#4f46e5"/>
  <path d="M50 18 L18 34 L50 50 L82 34 Z"
        fill="none" stroke="white" stroke-width="4.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 50 L50 66 L82 50"
        fill="none" stroke="white" stroke-width="4.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M18 66 L50 82 L82 66"
        fill="none" stroke="white" stroke-width="4.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const icons = [
  { name: "apple-touch-icon.png", size: 180 },
  { name: "icon-192.png",         size: 192 },
  { name: "icon-512.png",         size: 512 },
];

for (const { name, size } of icons) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  writeFileSync(join(publicDir, name), png);
  console.log(`✓ ${name} (${size}×${size})`);
}
