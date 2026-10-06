// What this owner's tests share: a checkout and a state directory of their
// own, a table that runs the stand-in server, and whether a process still runs.

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Language, LanguageServer } from "@/runtime/language-servers/index";

/** The stand-in server. */
const FAKE_SERVER = join(import.meta.dir, "fake-language-server.ts");

/** A checkout and the stand-in server's state directory. */
interface Workspace {
	readonly root: string;
	readonly state: string;
	/** The servers of a session: the stand-in, in a mode, for one language (TypeScript by default). */
	readonly table: (mode?: string, language?: Language) => (language: Language) => LanguageServer;
	/** The pids of every stand-in that started. */
	readonly pids: () => number[];
	/** Where each stand-in started, and the options it was given. */
	readonly starts: () => { cwd: string; options: unknown }[];
	/** The methods the stand-ins received, in order. */
	readonly methods: () => string[];
	/** What the client answered each stand-in that asked for its configuration. */
	readonly configurations: () => unknown[];
	/** The arguments each stand-in started with after its mode. */
	readonly argvs: () => string[][];
	/** The variable `CLANGD_FLAGS` each stand-in started with, or null. */
	readonly environments: () => Record<string, string | null>[];
	readonly remove: () => void;
}

/**
 * Write a checkout and a state directory for the stand-in.
 * @param files Each file of the checkout and its text.
 * @param answers The stand-in's answers, by `<file>:<line>:<word>`.
 * @returns The workspace.
 */
function workspace(
	files: Readonly<Record<string, string>>,
	answers: Readonly<Record<string, unknown>> = {},
): Workspace {
	const base = realpathSync(mkdtempSync(join(tmpdir(), "archboard-language-servers-")));
	const root = join(base, "checkout");
	const state = join(base, "state");
	mkdirSync(state, { recursive: true });
	for (const [relative, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, relative)), { recursive: true });
		writeFileSync(join(root, relative), text);
	}
	writeFileSync(join(state, "answers.json"), JSON.stringify(answers));
	/**
	 * The lines of a file the stand-in appends to.
	 * @param name The file.
	 * @returns Its lines.
	 */
	const lines = (name: string): string[] =>
		existsSync(join(state, name))
			? readFileSync(join(state, name), "utf8").split("\n").filter(Boolean)
			: [];
	return {
		root,
		state,
		table:
			(mode = "normal", only: Language = "typescript") =>
			(language) =>
				language === only
					? { status: "command", argv: [process.execPath, FAKE_SERVER, state, mode] }
					: { status: "missing", detail: `no ${language} server` },
		pids: () => lines("pids").map(Number),
		starts: () =>
			lines("starts").map((line) => JSON.parse(line) as { cwd: string; options: unknown }),
		methods: () => lines("methods"),
		configurations: () => lines("configuration").map((line): unknown => JSON.parse(line)),
		argvs: () => lines("argvs").map((line) => JSON.parse(line) as string[]),
		environments: () =>
			lines("environments").map((line) => JSON.parse(line) as Record<string, string | null>),
		remove: () => {
			rmSync(base, { recursive: true, force: true });
		},
	};
}

/**
 * Whether a process still runs.
 * @param pid Its pid.
 * @returns True while it does.
 */
function running(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export { type Workspace, running, workspace };
