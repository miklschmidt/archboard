import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const frontendRoot = fileURLToPath(new URL("./frontend", import.meta.url));

export default defineConfig({
	root: "frontend",
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": sourceRoot,
		},
	},
	build: {
		outDir: "../dist/frontend",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				main: resolve(frontendRoot, "index.html"),
				renderer: resolve(frontendRoot, "renderer.html"),
			},
			output: {
				// Excalidraw's font subsetting worker looks for these files by their
				// original (unhashed) names. Preserve them so the 404 doesn't break export.
				chunkFileNames: (chunkInfo) => {
					if (chunkInfo.name.startsWith("subset-")) {
						return "assets/[name].js";
					}
					return "assets/[name]-[hash].js";
				},
			},
		},
	},
	server: {
		fs: {
			// Preserve Vite's default secret-file denials and deny the local UI archive.
			deny: [
				".env",
				".env.*",
				"*.{crt,pem,key,p12,pfx,cer,der}",
				".npmrc",
				".yarnrc.yml",
				"**/.git/**",
				"**/legacy/**",
			],
		},
		port: 5173,
		proxy: {
			"/api": {
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
