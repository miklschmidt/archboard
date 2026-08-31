import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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
	assertActive: () => void;
	dispose: () => Promise<void>;
	disposeSync: () => void;
};

export type FixtureLifecycle = {
	onAllocated?: (fixture: ViteTailwindFixture) => void;
	onAllocationRetired?: (fixture: ViteTailwindFixture) => void;
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
	let hasCleanupFailure = false;
	try {
		await cleanup();
	} catch (error) {
		cleanupFailure = error;
		hasCleanupFailure = true;
	}
	if (hasPrimary && hasCleanupFailure) {
		throw new AggregateError(
			[primary, cleanupFailure],
			"Primary operation and cleanup both failed.",
		);
	}
	if (hasPrimary) throw primary;
	if (hasCleanupFailure) throw cleanupFailure;
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

export async function captureFailure(action: () => Promise<unknown>): Promise<unknown> {
	try {
		await action();
	} catch (error) {
		return error;
	}
	return undefined;
}

export function toPosixSpecifier(value: string): string {
	return value.replaceAll("\\", "/");
}

export async function createViteTailwindFixture(
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
	lifecycle: Pick<FixtureLifecycle, "onAllocated" | "onAllocationRetired" | "onSetupStep"> = {},
	nextRoot: () => string = () => join(parent, `archboard-vite-tailwind-${randomUUID()}`),
): Promise<ViteTailwindFixture> {
	let fixture: ViteTailwindFixture | undefined;
	while (fixture === undefined) {
		const root = nextRoot();
		let created = false;
		let disposing = false;
		let disposal: Promise<void> | undefined;
		fixture = {
			root,
			projectRoot: join(root, "project"),
			sourceRoot: join(root, "source with spaces"),
			outputRoot: join(root, "output"),
			assertActive: () => {
				if (!created || disposing) throw new Error("Vite fixture owner stopped during setup.");
			},
			dispose: () => {
				if (disposal !== undefined) return disposal;
				disposing = true;
				disposal = (async () => {
					if (created) await rm(root, { recursive: true, force: true });
					created = false;
				})();
				return disposal;
			},
			disposeSync: () => {
				disposing = true;
				if (created) {
					rmSync(root, { recursive: true, force: true });
					created = false;
				}
			},
		};
		lifecycle.onAllocated?.(fixture);
		try {
			mkdirSync(root);
			created = true;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			lifecycle.onAllocationRetired?.(fixture);
			fixture = undefined;
		}
	}
	try {
		const allocatedFixture = fixture;
		allocatedFixture.assertActive();
		await symlink(
			join(dependenciesRoot, "node_modules"),
			join(allocatedFixture.root, "node_modules"),
			"dir",
		);
		allocatedFixture.assertActive();
		lifecycle.onSetupStep?.("dependency-link", allocatedFixture);
		allocatedFixture.assertActive();
		await mkdir(join(allocatedFixture.projectRoot, "frontend"), { recursive: true });
		allocatedFixture.assertActive();
		lifecycle.onSetupStep?.("project-directory", allocatedFixture);
		allocatedFixture.assertActive();
		await mkdir(join(allocatedFixture.sourceRoot, "nested"), { recursive: true });
		allocatedFixture.assertActive();
		lifecycle.onSetupStep?.("source-directory", allocatedFixture);
		return allocatedFixture;
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
	fixture.assertActive();
	await writeFile(
		join(fixture.projectRoot, "frontend/index.html"),
		'<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>',
	);
	fixture.assertActive();
	onSetupStep?.("index-file", fixture);
	fixture.assertActive();
	await writeFile(
		join(fixture.projectRoot, "frontend/main.ts"),
		`import "@/app.css";\nimport { fixtureClassName } from "@/nested/source.ts";\ndocument.body.className = fixtureClassName;\n`,
	);
	fixture.assertActive();
	onSetupStep?.("main-file", fixture);
	fixture.assertActive();
	await writeFile(
		join(fixture.sourceRoot, "nested/source.ts"),
		'export const fixtureClassName = "bg-red-500";\n',
	);
	fixture.assertActive();
	onSetupStep?.("source-file", fixture);
	fixture.assertActive();
	await writeFile(
		join(fixture.sourceRoot, "app.css"),
		`@import "tailwindcss";\n@source "./${toPosixSpecifier("nested/source.ts")}";\n`,
	);
	fixture.assertActive();
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

async function withOwnedViteTailwindLifecycle<T>(
	operation: (
		register: (fixture: ViteTailwindFixture) => void,
		retire: (fixture: ViteTailwindFixture) => void,
	) => Promise<T>,
): Promise<T> {
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
	const onSigint = (): void => stop(130);
	const onSigterm = (): void => stop(143);
	const onExit = (): void => {
		activeFixture?.disposeSync();
	};
	process.once("SIGINT", onSigint);
	process.once("SIGTERM", onSigterm);
	process.once("exit", onExit);
	const cleanup = async (): Promise<void> => {
		try {
			await activeFixture?.dispose();
		} finally {
			process.removeListener("SIGINT", onSigint);
			process.removeListener("SIGTERM", onSigterm);
			process.removeListener("exit", onExit);
		}
	};
	return await withPrimaryAndCleanup(
		() =>
			operation(
				(fixture) => {
					activeFixture = fixture;
				},
				(fixture) => {
					if (activeFixture?.root === fixture.root) activeFixture = undefined;
				},
			),
		cleanup,
	);
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
	const interrupt = (phase: FixturePhase): void => {
		if (options.interruptAt === phase) process.kill(process.pid, "SIGTERM");
	};
	await withOwnedViteTailwindLifecycle(async (register, retire) => {
		await buildViteTailwindFixture(config, options.parent, options.dependenciesRoot, {
			onAllocated: (fixture) => {
				register(fixture);
				interrupt("after-mkdtemp");
			},
			onAllocationRetired: retire,
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
	});
}

export async function runOwnedViteTailwindAllocationProbe(options: {
	parent: string;
	dependenciesRoot: string;
}): Promise<void> {
	await withOwnedViteTailwindLifecycle(async (register, retire) => {
		await createViteTailwindFixture(options.parent, options.dependenciesRoot, {
			onAllocated: (fixture) => {
				register(fixture);
				process.stdout.write(`ALLOCATED ${fixture.root}\n`);
			},
			onAllocationRetired: retire,
		});
		await Bun.stdin.stream().getReader().read();
	});
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
