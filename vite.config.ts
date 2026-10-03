import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

/** The module a page imports to draw pictures itself (TASK-247). */
const RENDERER_MODULE = "virtual:archboard-renderer";

/** Everything a picture drawn in the browser depends on, besides the board. */
const RENDERER_SOURCES = [
	"src/transformers/semantic-renderer",
	"src/ui/browser-renderer",
	"src/runtime/semantic-renderer/lib/layout-worker.ts",
	"src/shared/semantic-board",
	"src/shared/semantic-policy",
	"node_modules/@viz-js/viz/package.json",
	"node_modules/libavoid-js/package.json",
	"node_modules/libavoid-js/dist/libavoid.wasm",
];

/**
 * Every file under a path, sorted so the digest does not depend on directory order.
 * @param path A file or directory, relative to the repository.
 * @returns The files.
 */
function filesUnder(path: string): string[] {
	const absolute = join(repositoryRoot, path);
	if (!statSync(absolute).isDirectory()) return [absolute];
	return readdirSync(absolute)
		.toSorted()
		.flatMap((name) => filesUnder(join(path, name)));
}

/**
 * Serve the page what drawing needs from the build: a digest of the renderer's
 * sources, so a picture kept by an older build is never shown. The theme's
 * colour values are not among them: a picture paints with the page's tokens.
 * @returns The plugin.
 */
function rendererBuild(): Plugin {
	const resolved = `\0${RENDERER_MODULE}`;
	return {
		name: "archboard-renderer",
		/**
		 * Claim the renderer module's name.
		 * @param id What an import asked for.
		 * @returns The module's internal id, or nothing for any other import.
		 */
		resolveId: (id) => (id === RENDERER_MODULE ? resolved : undefined),
		/**
		 * Write the renderer module.
		 * @param id The module being loaded.
		 * @returns Its source, or nothing for any other module.
		 */
		load(id) {
			if (id !== resolved) return undefined;
			const files = RENDERER_SOURCES.flatMap(filesUnder);
			for (const file of files) this.addWatchFile(file);
			const digest = createHash("sha256");
			for (const file of files) digest.update(file).update(readFileSync(file));
			const build = JSON.stringify(digest.digest("hex").slice(0, 16));
			return `export const rendererBuild = ${build};\n`;
		},
	};
}

/**
 * Let the dev server serve the stylesheet that index.html links one level above
 * its root. The build resolves that link, but the dev server stops a `..` at the
 * root and answers with the page itself, so a dev page would draw with no styles.
 * @returns The plugin.
 */
function stylesheetBeyondRoot(): Plugin {
	const link = 'href="../src/ui/theme/app.css"';
	const served = `href="/@fs${join(repositoryRoot, "src/ui/theme/app.css")}"`;
	return {
		name: "archboard-stylesheet-beyond-root",
		apply: "serve",
		transformIndexHtml: {
			order: "pre",
			/**
			 * Point the stylesheet link where the dev server can serve it from.
			 * @param html The page.
			 * @returns The page, with its stylesheet link rewritten.
			 */
			handler: (html) => html.replace(link, served),
		},
	};
}

export default defineConfig({
	root: "frontend",
	plugins: [react(), tailwindcss(), rendererBuild(), stylesheetBeyondRoot()],
	resolve: {
		alias: {
			"@": sourceRoot,
		},
	},
	build: {
		outDir: "../dist/frontend",
		emptyOutDir: true,
	},
	server: {
		fs: {
			// Preserve Vite's default secret-file denials.
			deny: [
				".env",
				".env.*",
				"*.{crt,pem,key,p12,pfx,cer,der}",
				".npmrc",
				".yarnrc.yml",
				"**/.git/**",
			],
		},
		port: 5173,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:3000",
				changeOrigin: true,
			},
			// The faces a picture drawn in the page links and measures with.
			"/assets/diagram-fonts": {
				target: "http://127.0.0.1:3000",
				changeOrigin: true,
			},
			"/health": {
				target: "http://127.0.0.1:3000",
				changeOrigin: true,
			},
		},
	},
});
