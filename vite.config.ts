import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { coreSourceHash } from "@archboard/renderer/core";

import {
	FRONTEND_INPUTS_FILE,
	FRONTEND_INPUT_GLOBS,
	frontendInputsFingerprint,
	// oxlint-disable-next-line archboard/absolute-imports -- the build and its browser adapter share one input contract
} from "./tools/frontend-build-inputs.ts";
// oxlint-disable-next-line archboard/absolute-imports -- the build check of the snapshot page lives beside the build's tools
import { snapshotPageBoundary } from "./tools/snapshot-page-boundary.ts";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

// Git's tracked entries are stable across checkouts and also cover staged skill links. The
// flake's release build runs in a source tree without Git, and runs no repository tests.
const trackedInputsFingerprint = existsSync(join(repositoryRoot, ".git"))
	? createHash("sha256")
			.update(
				execFileSync("git", ["ls-files", "--stage", "-z", "--", ".", ":(exclude)backlog/**"], {
					cwd: repositoryRoot,
					env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined },
				}),
			)
			.digest("hex")
	: "no-git";

/** The module a page imports to draw pictures itself (TASK-247). */
const RENDERER_MODULE = "virtual:archboard-renderer";

/** Everything a picture drawn in the browser depends on, besides the model. */
const RENDERER_SOURCES = [
	"packages/renderer/src/shared",
	"packages/renderer/src/ui",
	"packages/renderer/src/runtime/bun-renderer/processes/layout-worker.ts",
	"packages/model/src/shared",
	"packages/code-binding/src/shared",
	"packages/timing/src",
	"node_modules/@chenglou/pretext/package.json",
	"node_modules/@remixicon/react/package.json",
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
		"actions/**",
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
		"flake.nix",
		"flake.lock",
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
		".cargo/config.toml",
		"Cargo.toml",
		"clippy.toml",
		"Cargo.lock",
		"flake.nix",
		"flake.lock",
		"packages/renderer/assets/fonts/*.ttf",
		"packages/renderer/assets/theme.css",
	],
	output: [],
	env: analysisCache.env,
};
const browserTestCache = {
	...testCache,
	env: [...testCache.env, "AGENT_BROWSER_EXECUTABLE_PATH"],
};

// Corpus rendering and speed gates run only through the uncached benchmark task.
const benchmarkTests = ["packages/renderer/tests/runtime/blocks/operations/wide-pictures.test.ts"];

const capacityTests = [
	"packages/workbench/tests/runtime/dynamic-tools/operations/wire-capacity.test.ts",
	"packages/codex-app-server/tests/runtime/transport/clients/transport-write-capacity.test.ts",
	"packages/codex-app-server/tests/shared/constants/app-server-capacity.test.ts",
];

// A contended machine changes what these real programs answer: Chromium's exact bytes, and
// whether rust-analyzer answers at all. They run after the parallel lanes, alone.
const soloTests = [
	"packages/renderer/tests/runtime/rasterizer/services/rasterizer.test.ts",
	"packages/code-intel/tests/runtime/language-servers/processes/rust-server.test.ts",
];

// These prove the test harness, not the product, so the normal gate leaves them out.
const harnessTests = [
	"tests/system/process-contracts/git-opener-sequence-watchdog.test.ts",
	"tests/system/process-contracts/resource-cleanup.test.ts",
	"tests/system/cli/resource-cleanup.test.ts",
];

const topologyTests = ["tests/system/process-contracts/cross-process-model-claims.test.ts"];

// Thirteen is every stage of `check:first`, so no stage waits for a slot.
const stageOptions = "--concurrency-limit 13 --log labeled";
// `vp` requires a command of a task that only gathers others.
const stageGroup = { command: "true", cache: false };

export default defineConfig({
	// Both the page and its workers refuse a core from another source build.
	define: { ARCHBOARD_CORE_SOURCE_HASH: JSON.stringify(coreSourceHash()) },
	run: {
		tasks: {
			contracts: {
				command: "bun scripts/generate-codex-app-server-contract.ts --ensure",
				cache: { input: analysisCache.input, env: analysisCache.env },
			},
			// The renderer core, built to WebAssembly inside `nix develop` (ADR 0059). The build
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
			"workbench-example": {
				command: "bun scripts/build-workbench-example.ts",
				cache: {
					input: analysisCache.input,
					env: analysisCache.env,
					output: ["dist/workbench-example/**"],
				},
			},
			"voice-package": {
				dependsOn: ["contracts"],
				command: "bun scripts/pack-codex-realtime-voice.ts",
				cache: {
					input: analysisCache.input,
					env: analysisCache.env,
					output: ["dist/codex-realtime-voice/**"],
				},
			},
			// The npm packages of a release (ADR 0076), from the frontend and the core of this
			// checkout. It compiles for every platform, so it is never cached.
			"release-packages": {
				dependsOn: ["contracts", "frontend"],
				command: "bun scripts/release/build.ts",
				cache: false,
			},
			// The flake's release build installs the npm packages of bun.nix, which bun2nix writes
			// from bun.lock (docs/agents/releasing.md).
			"bun-nix": {
				command:
					'test "$(bun2nix)" = "$(cat bun.nix)" || { echo "bun.nix does not match bun.lock. Run bun2nix > bun.nix inside nix develop." >&2; exit 1; }',
				cache: { input: ["bun.lock", "bun.nix", "flake.lock"] },
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
					input: [
						...testCache.input,
						".vscode/**",
						".impeccable/**/*.json",
						// The marketing site is its own project, but the format check reads its sources.
						"site/**",
						"!site/node_modules/**",
						"!site/dist/**",
						"!site/.astro/**",
					],
				},
			},
			"lint:tests": {
				dependsOn: ["contracts", "core"],
				command:
					"bun scripts/lint.ts --disable-nested-config --config .oxlintrc.tests.jsonc tests packages/*/tests apps/*/tests",
				cache: analysisCache,
			},
			"lint:policy": {
				dependsOn: ["contracts", "core"],
				command:
					"bun scripts/lint.ts --type-aware --threads 1 --deny-warnings --max-warnings 0 --report-unused-disable-directives-severity error --config .oxlintrc.jsonc packages apps scripts tools actions vite.config.ts",
				cache: analysisCache,
			},
			"lint:css": {
				dependsOn: ["contracts", "core"],
				command: "bun scripts/lint-css.ts",
				cache: analysisCache,
			},
			"lint:core": {
				command:
					"cargo clippy --locked --workspace --all-targets --target wasm32-unknown-unknown -- --deny warnings",
				cache: coreCache,
			},
			// actionlint checks each workflow's syntax, expressions and action inputs, and shellcheck
			// checks its run scripts.
			"lint:workflows": {
				command: "actionlint",
				cache: { input: [".github/workflows/**"] },
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
			// The architecture linter: `archboard check` on this checkout's vault, on a
			// server of this checkout's source. Any warning fails it.
			"check:model": {
				dependsOn: ["contracts", "core"],
				command: "bun scripts/check-model.ts",
				cache: false,
			},
			"lint:all": {
				dependsOn: [
					"lint:tests",
					"lint:policy",
					"lint:css",
					"lint:core",
					"lint:core-docs",
					"lint:workflows",
				],
				...stageGroup,
			},
			"fix:all": {
				dependsOn: ["contracts", "core"],
				command: [
					"vp run --no-cache lint:tests --fix",
					"vp run --no-cache lint:policy --fix",
					"vp run lint:css",
					"vp fmt --config vite.config.ts",
					"cargo fmt --all",
					// Formatting the Rust sources or the build script invalidates the first core build.
					"vp run core",
				],
				cache: false,
			},
			// The stages that wait on no shared timing: `vp` runs them at once, and the first
			// failure ends the run. Each test lane fills the machine, so those run after them,
			// one at a time, and the browser lane shares the machine with nothing (TASK-097).
			// The model check starts a server that must answer within the CLI's start window,
			// so it runs alone after these stages too: beside them, a runner of four threads
			// starts that server too slowly.
			"test:first": {
				dependsOn: ["types", "frontend", "workbench-example", "test:core", "test:repository"],
				...stageGroup,
			},
			"check:first": {
				dependsOn: ["lint:all", "format:check", "format:core", "bun-nix", "test:first"],
				...stageGroup,
			},
			"test:all": {
				command: [
					`vp run ${stageOptions} test:first`,
					"vp run test:modules",
					"vp run test:system",
					"vp run test:solo",
					"vp run test:serial-browser",
				],
				cache: false,
			},
			"check:all": {
				command: [
					`vp run ${stageOptions} check:first`,
					"vp run check:model",
					"vp run test:modules",
					"vp run test:system",
					"vp run test:solo",
					"vp run test:serial-browser",
				],
				cache: false,
			},
			"test:modules": {
				command: [
					"bun test --parallel",
					...[...capacityTests, ...benchmarkTests, ...soloTests].map(
						(file) => `--path-ignore-patterns ${file}`,
					),
					"packages apps",
				].join(" "),
				cache: testCache,
			},
			"test:solo": {
				command: ["bun test --isolate --max-concurrency=1", ...soloTests].join(" "),
				cache: testCache,
			},
			"test:system": {
				command: [
					"bun test --parallel",
					...[...harnessTests, ...topologyTests].map((file) => `--path-ignore-patterns ${file}`),
					"tests/system/cli",
					"tests/system/server-state",
					"tests/system/process-contracts",
					"tests/system/code-targets",
					"tests/system/models",
					"tests/system/actions",
				].join(" "),
				cache: browserTestCache,
			},
			"test:repository": {
				command:
					"ARCHBOARD_TEST_TRACKED_INPUTS=" +
					trackedInputsFingerprint +
					" bun test --parallel tests/system/repository-policy",
				cache: { ...testCache, env: [...testCache.env, "GIT_INDEX_FILE"] },
			},
			"test:serial-browser": {
				command: "bun tests/system/browser/run-browser-lane.ts",
				cache: browserTestCache,
			},
			"test:macos": {
				dependsOn: ["core"],
				command: [
					"bun test --isolate --max-concurrency=1",
					"packages/process/tests",
					"packages/codex-app-server/tests/runtime/processes",
					"packages/codex-app-server/tests/runtime/store",
					"packages/codex-app-server/tests/runtime/session/store",
					"packages/codex-app-server/tests/runtime/services/diagnostics.test.ts",
					"packages/codex-app-server/tests/runtime/services/executable.test.ts",
					"packages/server-lifecycle/tests/runtime/store/pidfile.test.ts",
					"packages/renderer/tests/runtime/headless-chromium/processes/startup.test.ts",
					"packages/model/tests/runtime/canonical/read/operations/model-read.test.ts",
					"packages/model/tests/runtime/canonical/edit/operations/structure.test.ts",
					"packages/code-binding/tests/runtime/operations/resolution.test.ts",
					"packages/workbench/tests/server/workbench-host/services/production-initialization.test.ts",
					"packages/workbench/tests/server/actions/services/dynamic-approval-sessions.test.ts",
					"apps/cli/tests/cli/commands/vault/operations/language-server-configuration.test.ts",
					"tests/system/models/model-proposals.test.ts",
					"tests/system/models/model-corrections.test.ts",
					"tests/system/process-contracts/codex-workbench-storage.test.ts",
				].join(" "),
				cache: testCache,
			},
			"benchmark:all": {
				command: ["bun test --isolate --max-concurrency=1", ...benchmarkTests].join(" "),
				cache: false,
			},
			"test:opt-in:capacity": {
				command: ["bun test --isolate", ...capacityTests].join(" "),
				cache: testCache,
			},
			"test:opt-in:tooling": {
				command: [
					"bun test --isolate --max-concurrency=1",
					"tests/system/support",
					...harnessTests,
					"tests/system/browser/browser-toolchain.test.ts",
				].join(" "),
				cache: browserTestCache,
			},
			"test:opt-in:topology": {
				command: ["bun test --isolate --max-concurrency=1", ...topologyTests].join(" "),
				cache: testCache,
			},
		},
	},
	// Architecture inputs retain their store serializer and exact portable fingerprints.
	fmt: {
		ignorePatterns: [
			".archboard/vault/**",
			"site/model/**",
			"examples/**/*.semantic.json",
			"examples/web-shop/**/*.json",
			"examples/web-shop/.archboard/config.yaml",
			// Third-party agent skills keep their upstream formatting, so they diff cleanly
			// against a later upstream version: those in .agents/skills here, and those in
			// .claude/skills through .claude/**. The skills this repository distributes are
			// authored in skills/, which is formatted.
			".claude/**",
			".agents/skills/**",
			// Vendored third-party crates keep upstream's files for the same reason
			// (crates/vendor/README.md).
			"crates/vendor/*/**",
			// release-please writes CHANGELOG.md in its own style on every release
			// (docs/agents/releasing.md).
			"/CHANGELOG.md",
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
	// A relative base resolves every asset, worker and core against the page, so a copy of the
	// build works under any path of a static host, as well as at the root of the Archboard server.
	base: "./",
	plugins: [react(), tailwindcss(), rendererBuild(), frontendInputs(), snapshotPageBoundary()],
	build: {
		// The server serves the frontend directory of the installation (dist/frontend of the checkout). It lies outside the root, so it is emptied on purpose.
		outDir: join(repositoryRoot, "dist", "frontend"),
		emptyOutDir: true,
		rolldownOptions: {
			// The application, and the snapshot page, which reads no server.
			input: {
				index: join(repositoryRoot, "apps", "web", "index.html"),
				snapshot: join(repositoryRoot, "apps", "web", "snapshot.html"),
			},
			output: {
				// Application edits preserve cached framework, controls, and agent code.
				// Entry-aware groups retain the renderer and replay's lazy boundaries.
				codeSplitting: {
					groups: [
						{
							name: "react-platform",
							test: /node_modules[\\/](react(?:-dom)?|scheduler|@tanstack)[\\/]/,
							entriesAware: true,
						},
						{
							name: "controls",
							test: /(?:node_modules[\\/](?:@base-ui|@floating-ui|@remixicon)|packages[\\/](?:ui-kit|cn))[\\/]/,
							entriesAware: true,
						},
						{
							name: "conversation-runtime",
							test: /node_modules[\\/](?:@assistant-ui|assistant-stream)[\\/]/,
							entriesAware: true,
						},
						{
							name: "agent",
							test: /packages[\\/](?:workbench|codex-realtime-voice)[\\/]/,
							entriesAware: true,
						},
					],
				},
			},
		},
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
