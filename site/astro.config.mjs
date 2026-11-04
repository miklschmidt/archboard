// The site is static. GitHub Pages serves it under the repository's name, and the deploy
// workflow passes the origin and base path that configure-pages reports.
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
