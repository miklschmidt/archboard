import { readdirSync, rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, type InlineConfig } from "vite";

export type ViteTailwindFixture = {
	root: string;
	projectRoot: string;
	sourceRoot: string;
	outputRoot: string;
	dispose: () => Promise<void>;
	disposeSync: () => void;
};

export type FixtureLifecycle = {
	onCreated?: (fixture: ViteTailwindFixture) => void | Promise<void>;
	onReady?: (fixture: ViteTailwindFixture) => void | Promise<void>;
	beforeBuild?: (fixture: ViteTailwindFixture) => void | Promise<void>;
};

export function toPosixSpecifier(value: string): string {
	return value.replaceAll("\\", "/");
}

export async function createViteTailwindFixture(
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
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
		await symlink(join(dependenciesRoot, "node_modules"), join(root, "node_modules"), "dir");
		await mkdir(join(fixture.projectRoot, "frontend"), { recursive: true });
		await mkdir(join(fixture.sourceRoot, "nested"), { recursive: true });
		return fixture;
	} catch (error) {
		await fixture.dispose();
		throw error;
	}
}

export async function writeViteTailwindFixture(fixture: ViteTailwindFixture): Promise<void> {
	await writeFile(
		join(fixture.projectRoot, "frontend/index.html"),
		'<!doctype html><html><body><script type="module" src="./main.ts"></script></body></html>',
	);
	await writeFile(
		join(fixture.projectRoot, "frontend/main.ts"),
		`import "@/app.css";\nimport { fixtureClassName } from "@/nested/source.ts";\ndocument.body.className = fixtureClassName;\n`,
	);
	await writeFile(
		join(fixture.sourceRoot, "nested/source.ts"),
		'export const fixtureClassName = "bg-red-500";\n',
	);
	await writeFile(
		join(fixture.sourceRoot, "app.css"),
		`@import "tailwindcss";\n@source "./${toPosixSpecifier("nested/source.ts")}";\n`,
	);
}

export async function buildViteTailwindFixture(
	config: InlineConfig,
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
	lifecycle: FixtureLifecycle = {},
): Promise<string> {
	const fixture = await createViteTailwindFixture(parent, dependenciesRoot);
	try {
		await lifecycle.onCreated?.(fixture);
		await writeViteTailwindFixture(fixture);
		await lifecycle.onReady?.(fixture);
		await lifecycle.beforeBuild?.(fixture);
		await build({
			...config,
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
	} finally {
		await fixture.dispose();
	}
}

export async function withViteTailwindFixture<T>(
	callback: (fixture: ViteTailwindFixture) => Promise<T>,
	parent = tmpdir(),
	dependenciesRoot = process.cwd(),
): Promise<T> {
	const fixture = await createViteTailwindFixture(parent, dependenciesRoot);
	try {
		return await callback(fixture);
	} finally {
		await fixture.dispose();
	}
}

export async function runOwnedViteTailwindFixture(
	config: InlineConfig,
	options: {
		parent: string;
		dependenciesRoot: string;
		failAfterReady?: boolean;
		holdAfterReady?: boolean;
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
	process.once("SIGINT", onInterrupt);
	process.once("SIGTERM", onInterrupt);
	process.once("exit", onExit);
	try {
		await buildViteTailwindFixture(config, options.parent, options.dependenciesRoot, {
			onCreated: (fixture) => {
				activeFixture = fixture;
			},
			onReady: async (fixture) => {
				process.stdout.write(`READY ${fixture.root}\n`);
				if (options.failAfterReady) throw new Error("fixture child failure");
				if (options.holdAfterReady) await Bun.stdin.stream().getReader().read();
			},
		});
	} finally {
		process.removeListener("SIGINT", onInterrupt);
		process.removeListener("SIGTERM", onInterrupt);
		try {
			await activeFixture?.dispose();
		} finally {
			process.removeListener("exit", onExit);
		}
	}
}

export type FixtureChild = ReturnType<typeof Bun.spawn>;

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
	if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	await child.exited;
}

export async function withReapedChild<T>(
	child: FixtureChild,
	action: (child: FixtureChild) => Promise<T>,
): Promise<T> {
	let result: T | undefined;
	let failure: unknown;
	try {
		result = await action(child);
	} catch (error) {
		failure = error;
	}
	try {
		await reapChild(child);
	} catch (error) {
		failure = failure === undefined ? error : new AggregateError([failure, error]);
	}
	if (failure !== undefined) throw failure;
	return result as T;
}

export function prefixedFixtureRoots(parent: string): string[] {
	return readdirSync(parent).filter((name) => name.startsWith("archboard-vite-tailwind-"));
}
