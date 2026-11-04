// GitHub Pages serves the static site under /archboard. Environment variables can
// override the origin and base path for another host.
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

const repository = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
	site: process.env.SITE_ORIGIN ?? "https://miklschmidt.github.io",
	base: process.env.SITE_BASE ?? "/archboard",
	trailingSlash: "ignore",
	// Compression drops the space between a line of text and an element on the next line.
	compressHTML: false,
	devToolbar: { enabled: false },
	build: { assets: "assets" },
	vite: {
		// The fonts and the README's drawings live in the repository, outside the site.
		server: { fs: { allow: [repository] } },
	},
});
