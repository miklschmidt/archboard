import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFileSync } from "node:child_process";
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
	"src/shared/semantic-board",
	"src/shared/semantic-policy",
	"src/shared/theme/theme.css",
	"node_modules/@archboard/elk-rs/package.json",
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
 * Serve the page what drawing needs from the build: the theme colours, parsed
 * by the one parser Bun also uses, and a digest of the renderer's sources, so
 * a picture kept by an older build is never shown.
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
			// Bun resolves the repository's `@/` imports; the config loader does not.
			const themeColors = execFileSync("bun", ["scripts/print-theme-colors.ts"], {
				cwd: repositoryRoot,
				encoding: "utf8",
			});
			const build = JSON.stringify(digest.digest("hex").slice(0, 16));
			return `export const themeColors = ${themeColors};\nexport const rendererBuild = ${build};\n`;
		},
	};
}

export default defineConfig({
	root: "frontend",
	plugins: [react(), tailwindcss(), rendererBuild()],
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
