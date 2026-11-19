import type { ArchitectureFeed } from "#ui/architecture-drawing/model-reader/access/clients/events.ts";

/** The fallback code for a read that received no machine-readable refusal. */
export const UNANSWERED_READ_CODE = "READ_FAILED";

/**
 * A cached reading stays on screen with its availability stated. An event that is being applied
 * and a stream that is opening are healthy, so only a failure counts.
 * @param query The selected read and its last coherent result.
 * @param query.data The result.
 * @param query.isError Whether its last read failed.
 * @param current Whether this reading follows live inputs.
 * @param feed The update stream's availability.
 * @returns Whether the visible cached model lacks fresh confirmation.
 */
function readingIsStale(
	query: { data: unknown; isError: boolean },
	current: boolean,
	feed: ArchitectureFeed,
): boolean {
	if (!current || query.data === undefined) return false;
	return query.isError || feed.connection === "unavailable" || feed.failure !== null;
}

/**
 * What is wrong with the reading on screen, in the words of the toast that the shell shows for
 * its pane. Retry reads the models again.
 */
interface ReadingTrouble {
	/** The refusal's code, for a failed read. */
	readonly code: string | null;
	readonly tone: "default" | "destructive";
	readonly title: string;
	readonly description: string;
	readonly retry: boolean;
}

/** A refusal of a read, as the server gave it. */
interface ReadProblem {
	readonly code: string;
	readonly title?: string | undefined;
	readonly message: string;
	readonly diagnostics?: readonly {
		readonly file?: string | undefined;
		readonly message: string;
		readonly recovery: string;
	}[];
}

/**
 * Whether a diagnostic names a particular file in the vault.
 * @param file The diagnostic's file, when present.
 * @returns Whether the file helps locate the problem.
 */
function namesDiagnosticFile(file: string | undefined): file is string {
	return file !== undefined && file !== "" && file !== ".";
}

/** What the trouble is made of. */
interface TroubleInputs {
	/** Whether the reading on screen lacks fresh confirmation. */
	readonly stale: boolean;
	/** Whether the update stream lost the server. */
	readonly lost: boolean;
	/** Whether a picture is on screen. Without one, the pane says the failure itself. */
	readonly shown: boolean;
	readonly problem: ReadProblem | null;
}

/**
 * A failed read under a kept picture, in the refusal's own words.
 * @param problem The refusal.
 * @returns The refusal, if the server gave one.
 */
function readRefusal(problem: ReadProblem | null): ReadingTrouble | null {
	if (problem === null || problem.code === UNANSWERED_READ_CODE) return null;
	const words = (problem.diagnostics ?? []).flatMap(({ file, message, recovery }) => [
		namesDiagnosticFile(file) ? `${message} (${file})` : message,
		recovery,
	]);
	return {
		code: problem.code,
		tone: "destructive",
		title: problem.title ?? "Architecture unavailable",
		description: [...new Set([problem.message, ...words])].join(" "),
		retry: true,
	};
}

/** The server stopped answering, so the picture is the last one it sent. */
const LOST: ReadingTrouble = {
	code: null,
	tone: "destructive",
	title: "The Archboard server is not answering",
	description:
		"This is the last reading it sent. Start the server, and the reading updates by itself.",
	retry: false,
};

/** The last coherent reading is still on screen and awaits confirmation. */
const UNCONFIRMED: ReadingTrouble = {
	code: null,
	tone: "default",
	title: "This reading is not confirmed",
	description: "This is the last coherent reading, and the server has not confirmed it.",
	retry: true,
};

/**
 * What is wrong with the reading on screen: a failed read under a kept picture, a lost server,
 * or a reading the server has not confirmed.
 * @param inputs The reading's state.
 * @returns The trouble, or null while the reading is sound.
 */
function readingTrouble(inputs: TroubleInputs): ReadingTrouble | null {
	if (!inputs.shown) return null;
	const refusal = readRefusal(inputs.problem);
	if (refusal !== null) return refusal;
	if (inputs.lost) return LOST;
	return inputs.stale || inputs.problem !== null ? UNCONFIRMED : null;
}

export { namesDiagnosticFile, readingIsStale, readingTrouble, type ReadingTrouble };
