import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	FRONTEND_INPUTS_FILE,
	FRONTEND_INPUT_GLOBS,
	frontendInputsFingerprint,
	// oxlint-disable-next-line archboard/absolute-imports -- the build and its browser adapter share one input contract
} from "./tools/frontend-build-inputs.ts";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

// Git's tracked entries are stable across checkouts and also cover staged skill links.
const trackedInputsFingerprint = createHash("sha256")
	.update(
		execFileSync("git", ["ls-files", "--stage", "-z", "--", ".", ":(exclude)backlog/**"], {
			cwd: repositoryRoot,
			env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined },
		}),
	)
	.digest("hex");

/** The module a page imports to draw pictures itself (TASK-247). */
const RENDERER_MODULE = "virtual:archboard-renderer";

/** Everything a picture drawn in the browser depends on, besides the board. */
const RENDERER_SOURCES = [
	"packages/renderer/src/shared",
	"packages/renderer/src/ui",
	"packages/renderer/src/runtime/processes/layout-worker.ts",
	"packages/board/src/shared",
	"packages/code-binding/src/shared",
	"packages/timing/src",
	"node_modules/@chenglou/pretext/package.json",
	"node_modules/@remixicon/react/package.json",
	"node_modules/@viz-js/viz/package.json",
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
 * Record source content with the bundle so cached output needs no timestamp repair.
 * @returns The build-only plugin.
 */
function frontendInputs(): Plugin {
	let fingerprint = "";
	return {
		name: "archboard-frontend-inputs",
		apply: "build",
		/** Capture inputs before compilation starts. */
		buildStart() {
			fingerprint = frontendInputsFingerprint(repositoryRoot);
		},
		/** Keep the input record in the same cached output as the bundle. */
		generateBundle() {
			this.emitFile({ type: "asset", fileName: FRONTEND_INPUTS_FILE, source: fingerprint + "\n" });
		},
	};
}

// Declare Bun inputs explicitly: automatic tracking missed a changed script in TASK-515.
// Validation restores no fixture files. The build keeps automatic output restoration.
const analysisCache = {
	input: [
		"packages/**",
		"apps/**",
		"tests/**",
		"scripts/**",
		"tools/**",
		"docs/**/*.ts",
		"docs/**/*.tsx",
		"*.json",
		"*.jsonc",
		"*.toml",
		"vite.config.ts",
		".oxlintrc*.jsonc",
		".gitignore",
		"bun.lock",
	],
	output: [],
	env: ["PATH", "BUN_*", "!*_TOKEN", "!BUN_INTERNAL_CHECK_SCRIPTS", "NODE_OPTIONS"],
};
const testCache = {
	...analysisCache,
	input: [
		...analysisCache.input,
		".archboard/README.md",
		".archboard/vault/**",
		"bin/**",
		"docs/**",
		"examples/**",
		"skills/**",
		"evals/**",
		"patches/**",
		"*.md",
		".gitignore",
		".github/workflows/**",
		".agents/skills/*",
		".claude/skills/*",
		".claude/rules/**",
		// A test loads the core, which refuses a build of other sources than these.
		"crates/**",
		"Cargo.lock",
	],
	env: [
		...analysisCache.env,
		"NODE_ENV",
		"CI",
		"TZ",
		"ARCHBOARD_TEST_*",
		"ARCHBOARD_RENDERER_CHROMIUM",
	],
};
// The Rust checks read only the crates, the workspace manifest that holds their lint policy,
// clippy's thresholds, the lock file and the diagram fonts the text crate builds in.
const coreCache = {
	input: [
		"crates/**",
		"Cargo.toml",
		"clippy.toml",
		"Cargo.lock",
		"packages/renderer/assets/fonts/*.ttf",
	],
	output: [],
	env: analysisCache.env,
};
const browserTestCache = {
	...testCache,
	env: [...testCache.env, "AGENT_BROWSER_EXECUTABLE_PATH"],
};

const capacityTests = [
	"packages/workbench/tests/runtime/operations/dynamic-tools/wire-capacity.test.ts",
	"packages/codex-app-server/tests/runtime/clients/transport-write-capacity.test.ts",
	"packages/codex-app-server/tests/shared/constants/app-server-capacity.test.ts",
];

export default defineConfig({
	run: {
		tasks: {
			contracts: {
				command: "bun scripts/generate-codex-app-server-contract.ts --ensure",
				cache: { input: analysisCache.input, env: analysisCache.env },
			},
			// The renderer core, built to WebAssembly inside `nix develop` (ADR 0057). The build
			// script keeps a build that records the hash of this checkout's sources.
			core: {
				command: "bun scripts/build-core.ts",
				cache: false,
			},
			frontend: {
				dependsOn: ["core"],
				command: "vp build",
				cache: { input: [{ auto: true }, ...FRONTEND_INPUT_GLOBS] },
			},
			types: {
				dependsOn: ["contracts", "core"],
				command:
					'concurrently --names source,browser "tsc --noEmit" "tsc --noEmit -p tsconfig.frontend.json"',
				cache: analysisCache,
			},
			"format:check": {
				command: "vp fmt --config vite.config.ts --check",
				cache: {
					...analysisCache,
					input: [...testCache.input, ".prettierignore", ".vscode/**", ".impeccable/**/*.json"],
				},
			},
			"lint:tests": {
				command:
					"bun scripts/lint.ts --disable-nested-config --config .oxlintrc.tests.jsonc tests packages/*/tests apps/*/tests",
				cache: analysisCache,
			},
			"lint:policy": {
				command:
					"bun scripts/lint.ts --type-aware --threads 1 --deny-warnings --max-warnings 0 --report-unused-disable-directives-severity error --config .oxlintrc.jsonc packages apps scripts tools vite.config.ts",
				cache: analysisCache,
			},
			"lint:css": {
				command: "bun scripts/lint-css.ts",
				cache: analysisCache,
			},
			"lint:core": {
				command:
					"cargo clippy --locked --workspace --all-targets --target wasm32-unknown-unknown -- --deny warnings",
				cache: coreCache,
			},
			// rustdoc reads every doc, private ones too, and fails on any of its lints.
			"lint:core-docs": {
				command:
					"RUSTDOCFLAGS='-D warnings' cargo doc --locked --workspace --no-deps --document-private-items",
				cache: coreCache,
			},
			"format:core": {
				command: "cargo fmt --all --check",
				cache: coreCache,
			},
			"test:core": {
				command: "cargo test --locked --workspace",
				cache: coreCache,
			},
			"lint:all": {
				dependsOn: ["contracts", "core"],
				command: [
					"vp run lint:tests",
					"vp run lint:policy",
					"vp run lint:css",
					"vp run lint:core",
					"vp run lint:core-docs",
				],
				cache: false,
			},
			"fix:all": {
				dependsOn: ["contracts", "core"],
				command: [
					"vp run --no-cache lint:tests --fix",
					"vp run --no-cache lint:policy --fix",
					"vp run lint:css",
					"vp fmt --config vite.config.ts",
					"cargo fmt --all",
				],
				cache: false,
			},
			"test:all": {
				command: [
					"vp run types",
					"vp run frontend",
					"vp run test:core",
					"vp run test:modules",
					"vp run test:system",
					"vp run test:repository",
					"vp run test:serial-browser",
				],
				cache: false,
			},
			"check:all": {
				command: [
					"vp run lint:all",
					"vp run format:check",
					"vp run format:core",
					"vp run test:all",
				],
				cache: false,
			},
			"test:modules": {
				command: [
					"bun test --isolate",
					...capacityTests.map((file) => `--path-ignore-patterns ${file}`),
					"packages apps",
				].join(" "),
				cache: testCache,
			},
			"test:system": {
				command: [
					"bun test --isolate --max-concurrency=1",
					"--path-ignore-patterns",
					"tests/system/process-contracts/git-opener-sequence-watchdog.test.ts",
					"--path-ignore-patterns",
					"tests/system/process-contracts/cross-process-lock.test.ts",
					"tests/system/cli",
					"tests/system/server-state",
					"tests/system/process-contracts",
					"tests/system/code-targets",
					"tests/system/semantic-boards",
				].join(" "),
				cache: browserTestCache,
			},
			"test:repository": {
				command:
					"ARCHBOARD_TEST_TRACKED_INPUTS=" +
					trackedInputsFingerprint +
					" bun test --isolate tests/system/repository-policy",
				cache: { ...testCache, env: [...testCache.env, "GIT_INDEX_FILE"] },
			},
			"test:serial-browser": {
				command: "bun tests/system/browser/run-browser-lane.ts",
				cache: browserTestCache,
			},
			"test:macos": {
				command: [
					"bun test --isolate --max-concurrency=1",
					"packages/process/tests",
					"packages/codex-app-server/tests/runtime/processes",
					"packages/codex-app-server/tests/runtime/store",
					"packages/codex-app-server/tests/runtime/services/diagnostics.test.ts",
					"packages/codex-app-server/tests/runtime/services/executable.test.ts",
					"packages/workspace/tests/runtime/clients/git-async.test.ts",
					"packages/server-lifecycle/tests/runtime/store/pidfile.test.ts",
					"packages/renderer/tests/runtime/processes/headless-chromium/startup.test.ts",
					"packages/board/tests/runtime/store/policy.test.ts",
					"packages/board/tests/runtime/operations/rename/renaming.test.ts",
					"packages/code-binding/tests/runtime/operations/resolution.test.ts",
					"packages/workbench/tests/server/services/owner/production-initialization.test.ts",
					"packages/workbench/tests/server/services/actions/approval-sessions.test.ts",
					"apps/cli/tests/cli/operations/vault/language-server-configuration.test.ts",
					"tests/system/semantic-boards/lifecycle.test.ts",
					"tests/system/process-contracts/codex-workbench-storage.test.ts",
				].join(" "),
				cache: testCache,
			},
			"test:opt-in:capacity": {
				command: ["bun test --isolate", ...capacityTests].join(" "),
				cache: testCache,
			},
			"test:opt-in:tooling": {
				command: [
					"bun test --isolate --max-concurrency=1",
					"tests/system/support",
					"tests/system/process-contracts/git-opener-sequence-watchdog.test.ts",
					"tests/system/browser/browser-toolchain.test.ts",
				].join(" "),
				cache: browserTestCache,
			},
			"test:opt-in:topology": {
				command:
					"bun test --isolate --max-concurrency=1 tests/system/process-contracts/cross-process-lock.test.ts",
				cache: testCache,
			},
		},
	},
	// Board files retain their store serializer. Agent and generated files retain their owners.
	fmt: {
		ignorePatterns: [
			".archboard/vault/**/*.semantic.json",
			"examples/**/*.semantic.json",
			".agents/**",
			".claude/**",
			"dist/**",
			"node_modules/**",
			"backlog/**",
			"packages/codex-app-server/src/shared/protocol/generated/**",
			"packages/renderer/src/shared/protocol/generated/**",
		],
		useTabs: true,
		printWidth: 100,
		quoteStyle: "double",
		semicolons: "always",
		trailingComma: "all",
		endOfLine: "lf",
		sortTailwindcss: {
			functions: ["cn"],
			preserveDuplicates: true,
		},
	},
	root: join(repositoryRoot, "apps", "web"),
	plugins: [react(), tailwindcss(), rendererBuild(), frontendInputs()],
	build: {
		// The server serves SOURCE_CHECKOUT/dist/frontend. It lies outside the root, so it is emptied on purpose.
		outDir: join(repositoryRoot, "dist", "frontend"),
		emptyOutDir: true,
	},
	server: {
		fs: {
			// The workspace packages and their dependencies are served from outside the root.
			allow: [repositoryRoot],
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
				changeOrigin: false,
			},
			"/health": {
				target: "http://127.0.0.1:3000",
				changeOrigin: false,
			},
		},
	},
});
