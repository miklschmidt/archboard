import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));

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
			"/health": {
				target: "http://127.0.0.1:3000",
				changeOrigin: true,
			},
		},
	},
});
