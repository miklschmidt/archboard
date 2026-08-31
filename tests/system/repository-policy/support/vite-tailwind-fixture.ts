import { readdirSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type InlineConfig } from "vite";

export type FixtureSetupStep =
	| "dependency-link"
	| "project-directory"
	| "source-directory"
	| "index-file"
	| "main-file"
	| "source-file"
	| "stylesheet-file";

export type FixturePhase =
	| FixtureSetupStep
	| "after-mkdtemp"
	| "before-ready"
	| "after-ready"
	| "callback"
	| "during-build";

export type ViteTailwindFixture = {
	root: string;
	projectRoot: string;
	sourceRoot: string;
	outputRoot: string;
	dispose: () => Promise<void>;
	disposeSync: () => void;
};

export type FixtureLifecycle = {
	onAllocated?: (fixture: ViteTailwindFixture) => void;
	onSetupStep?: (step: FixtureSetupStep, fixture: ViteTailwindFixture) => void;
	onBeforeReady?: (fixture: ViteTailwindFixture) => void;
	onReady?: (fixture: ViteTailwindFixture) => void | Promise<void>;
	onBuildStart?: (fixture: ViteTailwindFixture) => void;
};

export type ViteAliasEntry = { find: string | RegExp; replacement?: string };

export function normalizeViteAliasEntries(
	aliases: NonNullable<InlineConfig["resolve"]>["alias"] | null | undefined,
): ViteAliasEntry[] | undefined {
	if (aliases === undefined || aliases === null) return undefined;
	if (Array.isArray(aliases)) return aliases as ViteAliasEntry[];
	if (typeof aliases !== "object") return undefined;
	return Object.entries(aliases).map(([find, replacement]) => ({
		find,
		replacement: typeof replacement === "string" ? replacement : undefined,
	}));
}

export async function withPrimaryAndCleanup<T>(
	action: () => Promise<T>,
	cleanup: () => Promise<void> | void,
): Promise<T> {
	let result: T | undefined;
	let primary: unknown;
	let hasPrimary = false;
	try {
		result = await action();
	} catch (error) {
		primary = error;
		hasPrimary = true;
	}
	let cleanupFailure: unknown;
	try {
		await cleanup();
	} catch (error) {
		cleanupFailure = error;
	}
	if (hasPrimary && cleanupFailure !== undefined) {
		throw new AggregateError(
			[primary, cleanupFailure],
			"Primary operation and cleanup both failed.",
		);
	}
	if (hasPrimary) throw primary;
	if (cleanupFailure !== undefined) throw cleanupFailure;
	return result as T;
}

export async function runCleanupSteps(cleanups: Array<() => Promise<void> | void>): Promise<void> {
	const failures: unknown[] = [];
	for (const cleanup of cleanups) {
		try {
			await cleanup();
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1)
		throw new AggregateError(failures, "Multiple cleanup operations failed.");
}

export function toPosixSpecifier(value: string): string {
	return value.replaceAll("\\", "/");
}

export async function createViteTailwindFixture(
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
	lifecycle: Pick<FixtureLifecycle, "onAllocated" | "onSetupStep"> = {},
): Promise<ViteTailwindFixture> {
	const root = await mkdtemp(join(parent, "archboard-vite-tailwind-"));
	const fixture: ViteTailwindFixture = {
		root,
		projectRoot: join(root, "project"),
		sourceRoot: join(root, "source with spaces"),
		outputRoot: join(root, "output"),
		dispose: async () => rm(root, { recursive: true, force: true }),
		disposeSync: () => rmSync(root, { recursive: true, force: true }),
	};
	try {
		lifecycle.onAllocated?.(fixture);
		await symlink(join(dependenciesRoot, "node_modules"), join(root, "node_modules"), "dir");
		lifecycle.onSetupStep?.("dependency-link", fixture);
		await mkdir(join(fixture.projectRoot, "frontend"), { recursive: true });
		lifecycle.onSetupStep?.("project-directory", fixture);
		await mkdir(join(fixture.sourceRoot, "nested"), { recursive: true });
		lifecycle.onSetupStep?.("source-directory", fixture);
		return fixture;
	} catch (error) {
		return await withPrimaryAndCleanup(async () => {
			throw error;
		}, fixture.dispose);
	}
}

export async function writeViteTailwindFixture(
	fixture: ViteTailwindFixture,
	onSetupStep?: FixtureLifecycle["onSetupStep"],
): Promise<void> {
	await writeFile(
		join(fixture.projectRoot, "frontend/index.html"),
		'<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>',
	);
	onSetupStep?.("index-file", fixture);
	await writeFile(
		join(fixture.projectRoot, "frontend/main.ts"),
		`import "@/app.css";\nimport { fixtureClassName } from "@/nested/source.ts";\ndocument.body.className = fixtureClassName;\n`,
	);
	onSetupStep?.("main-file", fixture);
	await writeFile(
		join(fixture.sourceRoot, "nested/source.ts"),
		'export const fixtureClassName = "bg-red-500";\n',
	);
	onSetupStep?.("source-file", fixture);
	await writeFile(
		join(fixture.sourceRoot, "app.css"),
		`@import "tailwindcss";\n@source "./${toPosixSpecifier("nested/source.ts")}";\n`,
	);
	onSetupStep?.("stylesheet-file", fixture);
}

export async function buildViteTailwindFixture(
	config: InlineConfig,
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
	lifecycle: FixtureLifecycle = {},
): Promise<string> {
	const fixture = await createViteTailwindFixture(parent, dependenciesRoot, lifecycle);
	return await withPrimaryAndCleanup(async () => {
		await writeViteTailwindFixture(fixture, lifecycle.onSetupStep);
		lifecycle.onBeforeReady?.(fixture);
		await lifecycle.onReady?.(fixture);
		const plugins = lifecycle.onBuildStart
			? [
					...(config.plugins ?? []),
					{
						name: "fixture-build-start-hook",
						buildStart: () => lifecycle.onBuildStart?.(fixture),
					},
				]
			: config.plugins;
		await build({
			...config,
			plugins,
			configFile: false,
			root: fixture.projectRoot,
			logLevel: "silent",
			resolve: { ...config.resolve, alias: { "@": fixture.sourceRoot } },
			build: {
				...config.build,
				outDir: fixture.outputRoot,
				emptyOutDir: true,
				rollupOptions: {
					...config.build?.rollupOptions,
					input: join(fixture.projectRoot, "frontend/index.html"),
				},
			},
		});

		const cssFiles = (await readdir(join(fixture.outputRoot, "assets"))).filter((file) =>
			file.endsWith(".css"),
		);
		if (cssFiles.length !== 1)
			throw new Error(`Vite fixture emitted ${cssFiles.length} CSS files.`);
		return await readFile(join(fixture.outputRoot, "assets", cssFiles[0]!), "utf8");
	}, fixture.dispose);
}

export async function withViteTailwindFixture<T>(
	callback: (fixture: ViteTailwindFixture) => Promise<T>,
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
): Promise<T> {
	const fixture = await createViteTailwindFixture(parent, dependenciesRoot);
	return await withPrimaryAndCleanup(() => callback(fixture), fixture.dispose);
}

export async function runOwnedViteTailwindFixture(
	config: InlineConfig,
	options: {
		parent: string;
		dependenciesRoot: string;
		failAfterReady?: boolean;
		holdAfterReady?: boolean;
		interruptAt?: FixturePhase;
	},
): Promise<void> {
	let activeFixture: ViteTailwindFixture | undefined;
	let stopping = false;
	const stop = (exitCode: number): void => {
		if (stopping) return;
		stopping = true;
		void (async () => {
			try {
				await activeFixture?.dispose();
			} finally {
				process.exit(exitCode);
			}
		})();
	};
	const onInterrupt = (): void => stop(143);
	const onExit = (): void => activeFixture?.disposeSync();
	const interrupt = (phase: FixturePhase): void => {
		if (options.interruptAt === phase) process.kill(process.pid, "SIGTERM");
	};
	process.once("SIGINT", onInterrupt);
	process.once("SIGTERM", onInterrupt);
	process.once("exit", onExit);
	const cleanup = async (): Promise<void> => {
		try {
			await activeFixture?.dispose();
		} finally {
			process.removeListener("SIGINT", onInterrupt);
			process.removeListener("SIGTERM", onInterrupt);
			process.removeListener("exit", onExit);
		}
	};
	await withPrimaryAndCleanup(async () => {
		await buildViteTailwindFixture(config, options.parent, options.dependenciesRoot, {
			onAllocated: (fixture) => {
				activeFixture = fixture;
				interrupt("after-mkdtemp");
			},
			onSetupStep: (step) => interrupt(step),
			onBeforeReady: () => interrupt("before-ready"),
			onReady: async (fixture) => {
				process.stdout.write(`READY ${fixture.root}\n`);
				interrupt("after-ready");
				interrupt("callback");
				if (options.failAfterReady) throw new Error("fixture child failure");
				if (options.holdAfterReady) await Bun.stdin.stream().getReader().read();
			},
			onBuildStart: () => interrupt("during-build"),
		});
	}, cleanup);
}

export type FixtureChild = ReturnType<typeof Bun.spawn>;

export function childStdout(child: FixtureChild): ReadableStream<Uint8Array> {
	if (child.stdout === undefined || typeof child.stdout === "number") {
		throw new Error("Fixture owner stdout must be piped.");
	}
	return child.stdout;
}

export function childLineReader(stream: ReadableStream<Uint8Array>): () => Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	return async () => {
		while (true) {
			const newline = buffer.indexOf("\n");
			if (newline >= 0) {
				const line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				return line;
			}
			const chunk = await reader.read();
			if (chunk.done) throw new Error("Fixture owner exited before readiness.");
			buffer += decoder.decode(chunk.value, { stream: true });
		}
	};
}

export async function reapChild(child: FixtureChild | undefined): Promise<void> {
	if (child === undefined) return;
	await runCleanupSteps([
		() => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
		},
		() => child.exited,
	]);
}

export async function withReapedChild<T>(
	child: FixtureChild,
	action: (child: FixtureChild) => Promise<T>,
): Promise<T> {
	return await withPrimaryAndCleanup(
		() => action(child),
		() => reapChild(child),
	);
}

export function prefixedFixtureRoots(parent: string): string[] {
	return readdirSync(parent).filter((name) => name.startsWith("archboard-vite-tailwind-"));
}
