// The language servers of one pass of the code check (ADR 0046).
//
// The pass asks where the name that a file uses on a line is defined. The
// session starts the server of the file's language in the file's checkout on
// the first question there, and asks it every later question. Answers are kept
// for the pass, since the boards of one vault ask about the same files, and
// never from one pass to the next: an answer depends on every file of the
// project.
//
// A server starts in the project of the file: the checkout, or for a language
// whose row names projects, such as a Swift package, the one that holds the
// file. One server runs for each language and project.
//
// A question the session cannot put gets no answer, and the use stays as code
// facts read it. The reason is said once: once for a language whose server is
// not installed, is turned off or cannot be configured (`missing`), once for
// each project where the server cannot answer yet, such as a package with no
// index (`unready`), and once for each checkout where a server did not start,
// did not answer in time or ended (`failed`). No server starts for a project
// that is not ready. A server that failed is stopped at once and never asked
// again in the pass, so a pass waits for a hung server at most once.
//
// `close` stops every server the session started, and returns only once each
// process has ended. It asks each to exit, unless the pass was cancelled:
// then it kills them at once, so a stop of the Archboard server never waits.

import fs from "node:fs/promises";
import path from "node:path";
import type { LanguageServerTable } from "@/runtime/language-servers/lib/configuration";
import { RequestFailure } from "@/runtime/language-servers/lib/connection";
import {
	LANGUAGES,
	languageOf,
	type Language,
	type Project,
} from "@/runtime/language-servers/lib/languages";
import {
	declarationAt,
	type Declaration,
	type OutlineSymbol,
} from "@/runtime/language-servers/lib/outline";
import { positionOf } from "@/runtime/language-servers/lib/position";
import {
	startServer,
	type DefinitionLocation,
	type Position,
	type Server,
	type ServerTimeouts,
} from "@/runtime/language-servers/lib/server";
import { LANGUAGE_SERVER_TIMEOUTS } from "@/shared/timing/timing";

/** Where a file uses a name: its checkout, the file in it, the line and the spelling. */
interface DefinitionQuestion {
	/** The checkout's root, absolute. */
	readonly root: string;
	/** The file, relative to the root. */
	readonly file: string;
	/** The line of the use, from 1. */
	readonly line: number;
	/** The use as the file spells it, its names joined by `.`. */
	readonly symbol: string;
}

/**
 * What a server said: every location of the definition, none when it knows
 * of none; or that no server was asked.
 */
type DefinitionAnswer =
	| { readonly status: "answered"; readonly locations: readonly DefinitionLocation[] }
	| { readonly status: "unasked" };

/** A language a pass could not ask about, and why. */
interface UnavailableServer {
	readonly language: Language;
	/**
	 * `missing`: no server on this machine; `unready`: a project the server
	 * cannot answer about yet; `failed`: a server that did not answer.
	 */
	readonly reason: "missing" | "unready" | "failed";
	/** The checkout where a project is not ready or a server failed. */
	readonly root?: string;
	readonly detail: string;
}

/** The servers of one pass. */
interface LanguageServerSession {
	/** Where the name a file uses on a line is defined. */
	readonly definition: (question: DefinitionQuestion) => Promise<DefinitionAnswer>;
	/**
	 * What a definition a server named declares: code that runs, data, a type,
	 * or unknown, as the outline of its file says. A file no server reads, or
	 * whose server cannot answer, is unknown.
	 */
	readonly declaration: (root: string, location: DefinitionLocation) => Promise<Declaration>;
	/** Each language the pass could not ask about, once for each reason and checkout. */
	readonly unavailable: () => readonly UnavailableServer[];
	/** Stop every server the session started, and return once each has ended. */
	readonly close: () => Promise<void>;
}

/** What opening a session needs. */
interface SessionOptions {
	/** The server of each language, as the pass read `language-servers.json`. */
	readonly servers: LanguageServerTable;
	/** The pass's signal: a cancelled pass asks nothing more and kills every server. */
	readonly signal: AbortSignal;
	readonly timeouts?: ServerTimeouts;
}

/** A started server: its language, its checkout, and the key it is kept under. */
interface Running {
	readonly language: Language;
	readonly root: string;
	readonly key: string;
	readonly server: Server;
}

/** The server to ask, the file as it knows it, and where the use stands. */
interface Target {
	readonly running: Running;
	readonly file: string;
	readonly position: Position;
}

/** The answer of a question no server was asked. */
const UNASKED: DefinitionAnswer = { status: "unasked" };

/** The servers, texts and answers of one pass. */
class Session {
	readonly #options: SessionOptions;
	readonly #timeouts: ServerTimeouts;
	readonly #projects = new Map<string, Promise<Project>>();
	readonly #starts = new Map<string, Promise<Server | undefined>>();
	readonly #started = new Set<Server>();
	readonly #texts = new Map<string, Promise<string | undefined>>();
	readonly #outlines = new Map<string, Promise<readonly OutlineSymbol[] | undefined>>();
	readonly #answers = new Map<string, Promise<DefinitionAnswer>>();
	readonly #unavailable = new Map<string, UnavailableServer>();
	#closed = false;

	/**
	 * A session that has started nothing yet.
	 * @param options The servers, the pass's signal and the bounds.
	 */
	constructor(options: SessionOptions) {
		this.#options = options;
		this.#timeouts = options.timeouts ?? LANGUAGE_SERVER_TIMEOUTS;
	}

	/**
	 * Where the name a file uses on a line is defined, asked once in the pass.
	 * @param question The question.
	 * @returns The answer.
	 */
	definition(question: DefinitionQuestion): Promise<DefinitionAnswer> {
		const key = [question.root, question.file, question.line, question.symbol].join("\0");
		let answer = this.#answers.get(key);
		if (answer === undefined) {
			answer = this.#ask(question);
			this.#answers.set(key, answer);
		}
		return answer;
	}

	/**
	 * What a definition a server named declares, from the outline of its file,
	 * asked once for each file in the pass.
	 * @param root The checkout whose server named it.
	 * @param location The definition.
	 * @returns What it declares.
	 */
	async declaration(root: string, location: DefinitionLocation): Promise<Declaration> {
		let outline = this.#outlines.get(location.path);
		if (outline === undefined) {
			outline = this.#outlineOf(root, location.path);
			this.#outlines.set(location.path, outline);
		}
		const symbols = await outline;
		return symbols === undefined ? "unknown" : declarationAt(symbols, location);
	}

	/**
	 * Each language the pass could not ask about.
	 * @returns Each, once for each reason and checkout.
	 */
	unavailable(): readonly UnavailableServer[] {
		return [...this.#unavailable.values()];
	}

	/**
	 * Stop every server the session started, killing them at once in a
	 * cancelled pass, and return once each has ended.
	 */
	async close(): Promise<void> {
		this.#closed = true;
		await Promise.all(this.#starts.values());
		const graceful = !this.#options.signal.aborted;
		await Promise.all([...this.#started].map((server) => server.stop(graceful)));
	}

	/**
	 * Ask the server of a question's language, if the session can.
	 * @param question The question.
	 * @returns The answer.
	 */
	async #ask(question: DefinitionQuestion): Promise<DefinitionAnswer> {
		const target = await this.#target(question);
		if (target === undefined) return UNASKED;
		try {
			const locations = await target.running.server.definition(target.file, target.position);
			return { status: "answered", locations };
		} catch (error) {
			this.#failed(target.running, error);
			return UNASKED;
		}
	}

	/**
	 * The server to ask a question, and where the use stands.
	 * @param question The question.
	 * @returns Both, or undefined when no server can be asked about the file or
	 * the line does not hold the use.
	 */
	async #target(question: DefinitionQuestion): Promise<Target | undefined> {
		const running = await this.#serverOf(question.root, question.file);
		if (running === undefined) return undefined;
		const file = path.join(question.root, question.file);
		const position = await this.#positionOf(file, question);
		return position === undefined ? undefined : { running, file, position };
	}

	/**
	 * Ask the server of a file's language for its outline.
	 * @param root The checkout.
	 * @param file The file, absolute.
	 * @returns The outline, or undefined when no server answered.
	 */
	async #outlineOf(root: string, file: string): Promise<readonly OutlineSymbol[] | undefined> {
		const running = await this.#serverOf(root, path.relative(root, file));
		if (running === undefined) return undefined;
		try {
			return await running.server.outline(file);
		} catch (error) {
			this.#failed(running, error);
			return undefined;
		}
	}

	/**
	 * Whether the pass still asks.
	 * @returns False once the session closed or the pass was cancelled.
	 */
	#open(): boolean {
		return !this.#closed && !this.#options.signal.aborted;
	}

	/**
	 * Where on its line a question's use stands.
	 * @param file The file, absolute.
	 * @param question The question.
	 * @returns The position, or undefined when the file or the line does not hold it.
	 */
	async #positionOf(file: string, question: DefinitionQuestion): Promise<Position | undefined> {
		let text = this.#texts.get(file);
		if (text === undefined) {
			text = fs.readFile(file, "utf8").catch(() => undefined);
			this.#texts.set(file, text);
		}
		const read = await text;
		return read === undefined ? undefined : positionOf(read, question.line, question.symbol);
	}

	/**
	 * The server of a file's language and project, started on the first
	 * question there.
	 * @param root The checkout.
	 * @param file The file, relative to the checkout.
	 * @returns The server, or undefined when no server reads the file, the pass
	 * is over, the language has no server, the project is not ready or the
	 * server failed.
	 */
	async #serverOf(root: string, file: string): Promise<Running | undefined> {
		const language = this.#open() ? languageOf(file)?.language : undefined;
		if (language === undefined) return undefined;
		const argv = this.#commandOf(language);
		if (argv === undefined) return undefined;
		const project = await this.#readyProject(language, root, file);
		return project === undefined ? undefined : this.#running(language, root, project, argv);
	}

	/**
	 * The server of a language in a project, started once.
	 * @param language The language.
	 * @param root The checkout.
	 * @param project The project, where it starts.
	 * @param argv Its command.
	 * @returns The server, or undefined when it failed.
	 */
	async #running(
		language: Language,
		root: string,
		project: string,
		argv: readonly [string, ...string[]],
	): Promise<Running | undefined> {
		const key = `${language}\0${project}`;
		let start = this.#starts.get(key);
		if (start === undefined) {
			start = this.#start(language, root, project, argv);
			this.#starts.set(key, start);
		}
		const server = await start;
		return server === undefined ? undefined : { language, root, key, server };
	}

	/**
	 * The project of a file, noting once that its server cannot answer there.
	 * @param language The file's language.
	 * @param root The checkout.
	 * @param file The file, relative to the checkout.
	 * @returns The project's root, or undefined when it is not ready.
	 */
	async #readyProject(language: Language, root: string, file: string): Promise<string | undefined> {
		const project = await this.#projectOf(language, root, file);
		if (project.unready === undefined) return project.root;
		this.#note({ language, reason: "unready", root, detail: project.unready }, project.root);
		return undefined;
	}

	/**
	 * The command of a language's server, noting once that it has none.
	 * @param language The language.
	 * @returns The command, or undefined when the language has no server.
	 */
	#commandOf(language: Language): readonly [string, ...string[]] | undefined {
		const configured = this.#options.servers.get(language);
		if (configured?.status === "command") return configured.argv;
		const detail = configured?.detail ?? `no server is configured for ${language}`;
		this.#note({ language, reason: "missing", detail });
		return undefined;
	}

	/**
	 * The project a file's server starts in, asked once for each directory.
	 * @param language The file's language.
	 * @param root The checkout.
	 * @param file The file, relative to the checkout.
	 * @returns The project: the checkout, unless the language's row names another.
	 */
	#projectOf(language: Language, root: string, file: string): Promise<Project> {
		const key = `${language}\0${root}\0${path.dirname(file)}`;
		let project = this.#projects.get(key);
		if (project === undefined) {
			project = LANGUAGES[language].project?.(root, file) ?? Promise.resolve({ root });
			this.#projects.set(key, project);
		}
		return project;
	}

	/**
	 * Start a server, noting it as failed if it does not start.
	 * @param language Its language.
	 * @param root Its checkout.
	 * @param project Its project, where it starts.
	 * @param argv Its command.
	 * @returns The server, or undefined when it failed.
	 */
	async #start(
		language: Language,
		root: string,
		project: string,
		argv: readonly [string, ...string[]],
	): Promise<Server | undefined> {
		const { signal } = this.#options;
		try {
			const start = { language, argv, root: project, signal, timeouts: this.#timeouts };
			const server = await startServer(start);
			this.#started.add(server);
			return server;
		} catch (error) {
			if (!signal.aborted)
				this.#note({ language, reason: "failed", root, detail: failure(argv, error) });
			return undefined;
		}
	}

	/**
	 * Note a server that stopped answering, stop it, and never ask it again.
	 * A server that only refused one question stays.
	 * @param running The server.
	 * @param error Why the request failed.
	 */
	#failed(running: Running, error: unknown): void {
		const refused = error instanceof RequestFailure && error.kind === "answered";
		if (refused || this.#options.signal.aborted) return;
		const { language, root } = running;
		const configured = this.#options.servers.get(language);
		const argv = configured?.status === "command" ? configured.argv : [language];
		this.#note({ language, reason: "failed", root, detail: failure(argv, error) });
		this.#starts.set(running.key, Promise.resolve(undefined));
		void running.server.stop(false);
	}

	/**
	 * Say once that a language could not be asked about: once for the
	 * language, the checkout, or the project that is not ready.
	 * @param entry Which, why and where.
	 * @param project The project, for a project that is not ready.
	 */
	#note(entry: UnavailableServer, project = ""): void {
		const key = `${entry.reason}\0${entry.language}\0${entry.root ?? ""}\0${project}`;
		if (!this.#unavailable.has(key)) this.#unavailable.set(key, entry);
	}
}

/**
 * Open the language servers of one pass. No server starts before its first question.
 * @param options The servers, the pass's signal and the bounds.
 * @returns The session.
 */
function openLanguageServers(options: SessionOptions): LanguageServerSession {
	return new Session(options);
}

/**
 * Why a server failed, naming its program.
 * @param argv Its command.
 * @param error What went wrong.
 * @returns The reason.
 */
function failure(argv: readonly string[], error: unknown): string {
	const what = error instanceof Error ? error.message : String(error);
	return `${path.basename(argv[0] ?? "the server")} ${what}`;
}

export {
	type DefinitionAnswer,
	type DefinitionQuestion,
	type LanguageServerSession,
	type SessionOptions,
	type UnavailableServer,
	openLanguageServers,
};
