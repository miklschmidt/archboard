// GitHub Pages serves the static site under /archboard. Environment variables can
// override the origin and base path for another host.
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";
import { coreSourceHash } from "../packages/renderer/src/runtime/store/core-sources.ts";

const repository = fileURLToPath(new URL("..", import.meta.url));
// The voice orb is the product's own code, which imports the durations package by name. The site
// does not install the repository's workspaces, so the name points at the package's source.
const timing = fileURLToPath(
	new URL("../packages/timing/src/shared/constants/timing.ts", import.meta.url),
);

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
		resolve: { alias: { "@archboard/timing": timing } },
		// The product's painter refuses a build of other sources than the checkout holds.
		define: { ARCHBOARD_CORE_SOURCE_HASH: JSON.stringify(coreSourceHash()) },
	},
});
