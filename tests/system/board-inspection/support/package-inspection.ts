import {
	chmodSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderBoardNote } from "../../../../src/runtime/engine/board.js";

export interface ProcessResult {
	status: number;
	stdout: string;
	stderr: string;
}

export interface VaultEntry {
	path: string;
	bytes: string;
	mtimeMs: number;
}

interface Sentinel {
	url: string;
	contacts: () => string;
	child: ReturnType<typeof Bun.spawn>;
	log: string;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
	bin: { archboard: string };
};
export const shippedBinary = join(root, manifest.bin.archboard);
const tempRoot = realpathSync(tmpdir());
const vaultPrefix = `${tempRoot}/archboard-task-130-05-package-`;

function assertOwnedVault(vault: string): string {
	const resolved = realpathSync(vault);
	if (!resolved.startsWith(vaultPrefix))
		throw new Error(`Refusing unsafe package vault: ${resolved}`);
	return resolved;
}

export function snapshotVault(vault: string): VaultEntry[] {
	if (!existsSync(vault)) return [];
	const rootInfo = lstatSync(vault);
	if (!rootInfo.isDirectory())
		return [
			{
				path: ".",
				bytes: readFileSync(vault).toString("base64"),
				mtimeMs: statSync(vault).mtimeMs,
			},
		];
	const visit = (directory: string): VaultEntry[] =>
		readdirSync(directory).flatMap((name) => {
			const full = join(directory, name);
			const info = lstatSync(full);
			if (info.isDirectory()) return visit(full);
			return [
				{
					path: relative(vault, full),
					bytes: readFileSync(full).toString("base64"),
					mtimeMs: statSync(full).mtimeMs,
				},
			];
		});
	return visit(vault).toSorted((a, b) => a.path.localeCompare(b.path));
}

function snapshotGuardedVault(vault: string): VaultEntry[] {
	const info = lstatSync(vault);
	const mode = info.mode & 0o777;
	if (info.isDirectory() || (mode & 0o400) !== 0) return snapshotVault(vault);
	chmodSync(vault, mode | 0o600);
	try {
		return snapshotVault(vault);
	} finally {
		chmodSync(vault, mode);
	}
}

function readOnlyRun(vault: string, command: readonly string[], env: Record<string, string>) {
	const before = snapshotGuardedVault(vault);
	const result = Bun.spawnSync([...command], {
		cwd: root,
		env: {
			...process.env,
			...env,
			ARCHBOARD_VAULT: vault,
			EXCALIDRAW_NO_AUTOSTART: "1",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const after = snapshotGuardedVault(vault);
	if (JSON.stringify(after) !== JSON.stringify(before))
		throw new Error(
			`Package inspection mutated its vault: ${JSON.stringify({ before, after }, null, 2)}`,
		);
	return {
		status: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

async function startSentinel(): Promise<Sentinel> {
	const log = join(
		tempRoot,
		`archboard-task-130-05-http-${process.pid}-${crypto.randomUUID()}.log`,
	);
	writeFileSync(log, "");
	const code =
		"const fs=require('node:fs');const s=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){fs.appendFileSync(process.env.SENTINEL_LOG,'contact\\n');return new Response('unexpected')}});console.log(s.port)";
	const child = Bun.spawn([process.execPath, "-e", code], {
		env: { ...process.env, SENTINEL_LOG: log },
		stdout: "pipe",
		stderr: "pipe",
	});
	try {
		const reader = child.stdout.getReader();
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("HTTP sentinel startup timed out")), 5_000),
		);
		const first = await Promise.race([reader.read(), timeout]);
		reader.releaseLock();
		const port = Number(new TextDecoder().decode(first.value).trim());
		if (!Number.isInteger(port) || port <= 0)
			throw new Error("HTTP sentinel did not publish a valid port");
		return {
			url: `http://127.0.0.1:${port}`,
			contacts: () => readFileSync(log, "utf8"),
			child,
			log,
		};
	} catch (error) {
		child.kill();
		await child.exited;
		rmSync(log, { force: true });
		throw error;
	}
}

export function createPackageInspectionOwner() {
	let vault: string | null = null;
	let sentinel: Sentinel | null = null;
	const requireVault = () => {
		if (!vault) throw new Error("Package inspection owner has not started its vault");
		return vault;
	};
	return {
		startVault(): string {
			if (vault) throw new Error("Package inspection owner already started its vault");
			vault = assertOwnedVault(mkdtempSync(join(tempRoot, "archboard-task-130-05-package-")));
			return vault;
		},
		startVaultFile(): string {
			if (vault) throw new Error("Package inspection owner already started its vault");
			const target = join(
				tempRoot,
				`archboard-task-130-05-package-policy-${process.pid}-${crypto.randomUUID()}`,
			);
			writeFileSync(target, "not a vault");
			chmodSync(target, 0);
			vault = assertOwnedVault(target);
			return vault;
		},
		writeBoard(board: string, elements: readonly unknown[]): string {
			const owned = requireVault();
			const note = renderBoardNote(
				{
					type: "excalidraw",
					version: 2,
					source: "archboard",
					elements,
					appState: {},
					files: {},
				},
				null,
				{ board, variant: "current" },
			);
			const target = join(owned, `${board}.excalidraw.md`);
			writeFileSync(target, note);
			return target;
		},
		runInspection(
			board: string,
			args: readonly string[] = [],
			env: Record<string, string> = {},
		): ProcessResult {
			return readOnlyRun(requireVault(), [shippedBinary, "check", "--board", board, ...args], env);
		},
		runBinary(args: readonly string[]): ProcessResult {
			return readOnlyRun(requireVault(), [shippedBinary, ...args], {});
		},
		snapshot(): VaultEntry[] {
			return snapshotVault(requireVault());
		},
		async startHttpSentinel(): Promise<{
			url: string;
			contacts: () => string;
		}> {
			if (sentinel) throw new Error("Package inspection owner already started its sentinel");
			sentinel = await startSentinel();
			return { url: sentinel.url, contacts: sentinel.contacts };
		},
		async dispose(): Promise<void> {
			if (sentinel) {
				sentinel.child.kill();
				await sentinel.child.exited;
				rmSync(sentinel.log, { force: true });
				sentinel = null;
			}
			if (vault) {
				const owned = assertOwnedVault(vault);
				if (!lstatSync(owned).isDirectory()) chmodSync(owned, 0o600);
				rmSync(owned, { recursive: true });
				vault = null;
			}
		},
	};
}
