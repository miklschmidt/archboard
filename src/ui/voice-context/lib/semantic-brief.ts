// Parses the exact canonical semantic_context JSON without importing its
// runtime owner: every key must be present and nothing else may be.

import type { VoiceContextCanonicalBrief } from "@/ui/voice-context/contract";
import {
	exactKeys,
	isNullableString,
	isRecord,
	isString,
	isStrings,
	isVersion,
	parseBoard,
	parseChild,
	parseClaim,
	parseCoordinator,
	parseCursor,
	parseFreshness,
	parsePane,
	parseStaleness,
	parseThreadLink,
	parseWorkhorse,
} from "@/ui/voice-context/lib/brief-sections";
import { parseArchitecture } from "@/ui/voice-context/lib/brief-architecture";
import type { JsonRecord } from "@/ui/voice-context/lib/brief-sections";

const TOP_LEVEL_KEYS = Object.freeze([
	"source",
	"feedId",
	"repository",
	"workhorse",
	"coordinator",
	"board",
	"pane",
	"version",
	"architecture",
	"claim",
	"doing",
	"cursor",
	"description",
	"freshness",
	"truncated",
	"ambiguity",
	"staleness",
	"child",
	"threadLink",
]);

/** The nested sections, each parsed or refused. */
interface Sections {
	readonly workhorse: VoiceContextCanonicalBrief["workhorse"] | null;
	readonly coordinator: VoiceContextCanonicalBrief["coordinator"] | null;
	readonly board: VoiceContextCanonicalBrief["board"] | null;
	readonly pane: VoiceContextCanonicalBrief["pane"] | null;
	readonly claim: VoiceContextCanonicalBrief["claim"] | null;
	readonly cursor: VoiceContextCanonicalBrief["cursor"] | undefined;
	readonly freshness: VoiceContextCanonicalBrief["freshness"] | null;
	readonly staleness: VoiceContextCanonicalBrief["staleness"] | null;
	readonly child: VoiceContextCanonicalBrief["child"] | null;
	readonly threadLink: VoiceContextCanonicalBrief["threadLink"] | null;
	readonly architecture: VoiceContextCanonicalBrief["architecture"] | null;
}

/** The nested sections, all parsed. */
interface ParsedSections {
	readonly workhorse: VoiceContextCanonicalBrief["workhorse"];
	readonly coordinator: VoiceContextCanonicalBrief["coordinator"];
	readonly board: VoiceContextCanonicalBrief["board"];
	readonly pane: VoiceContextCanonicalBrief["pane"];
	readonly claim: VoiceContextCanonicalBrief["claim"];
	readonly cursor: VoiceContextCanonicalBrief["cursor"];
	readonly freshness: VoiceContextCanonicalBrief["freshness"];
	readonly staleness: VoiceContextCanonicalBrief["staleness"];
	readonly child: VoiceContextCanonicalBrief["child"];
	readonly threadLink: VoiceContextCanonicalBrief["threadLink"];
	readonly architecture: VoiceContextCanonicalBrief["architecture"];
}

/** The top-level scalar fields, typed. */
interface Scalars {
	readonly feedId: string;
	readonly repository: string;
	readonly version: number | null;
	readonly doing: string | null;
	readonly description: string;
	readonly truncated: boolean;
	readonly ambiguity: readonly string[];
}

/**
 * Parses every nested section.
 * @param value The top-level record.
 * @returns The sections.
 */
function parseSections(value: JsonRecord): Sections {
	return {
		workhorse: parseWorkhorse(value["workhorse"]),
		coordinator: parseCoordinator(value["coordinator"]),
		board: parseBoard(value["board"]),
		pane: parsePane(value["pane"]),
		claim: parseClaim(value["claim"]),
		cursor: parseCursor(value["cursor"]),
		freshness: parseFreshness(value["freshness"]),
		staleness: parseStaleness(value["staleness"]),
		child: parseChild(value["child"]),
		threadLink: parseThreadLink(value["threadLink"]),
		architecture: parseArchitecture(value["architecture"]),
	};
}

/**
 * Whether every section parsed: null refuses every section but the cursor,
 * whose refusal is undefined.
 * @param sections The sections.
 * @returns True when none was refused.
 */
function complete(sections: Sections): sections is ParsedSections {
	if (sections.cursor === undefined) {
		return false;
	}
	return Object.entries(sections).every(([key, section]) => key === "cursor" || section !== null);
}

/**
 * The identity scalars, typed, or null when malformed.
 * @param value The top-level record.
 * @returns The feed, repository and version.
 */
function identityScalars(
	value: JsonRecord,
): Pick<Scalars, "feedId" | "repository" | "version"> | null {
	const feedId = value["feedId"];
	const repository = value["repository"];
	const version = value["version"];

	if (!isString(feedId) || !isString(repository) || !isVersion(version)) {
		return null;
	}
	return { feedId, repository, version };
}

/**
 * The text scalars, typed, or null when malformed.
 * @param value The top-level record.
 * @returns The doing, description, truncation and ambiguity.
 */
function textScalars(
	value: JsonRecord,
): Pick<Scalars, "doing" | "description" | "truncated" | "ambiguity"> | null {
	const doing = value["doing"];
	const description = value["description"];
	const truncated = value["truncated"];
	const ambiguity = value["ambiguity"];
	if (
		!isNullableString(doing) ||
		!isString(description) ||
		typeof truncated !== "boolean" ||
		!isStrings(ambiguity)
	) {
		return null;
	}
	return { doing, description, truncated, ambiguity };
}

/**
 * The top-level scalars, typed, or null when any is malformed.
 * @param value The top-level record.
 * @returns The scalars, or null.
 */
function scalars(value: JsonRecord): Scalars | null {
	const identity = identityScalars(value);
	const text = textScalars(value);
	if (value["source"] !== "semantic_context" || identity === null || text === null) {
		return null;
	}
	return { ...identity, ...text };
}

/**
 * Assembles the frozen brief from validated parts.
 * @param fields The typed scalars.
 * @param sections The parsed sections.
 * @returns The brief, or null when the version disagrees with the board.
 */
function assemble(fields: Scalars, sections: ParsedSections): VoiceContextCanonicalBrief | null {
	if (fields.version !== sections.board.version) {
		return null;
	}
	return Object.freeze({
		source: "semantic_context",
		feedId: fields.feedId,
		repository: fields.repository,
		workhorse: sections.workhorse,
		coordinator: sections.coordinator,
		board: sections.board,
		pane: sections.pane,
		version: fields.version,
		architecture: sections.architecture,
		claim: sections.claim,
		doing: fields.doing,
		cursor: sections.cursor,
		description: fields.description,
		freshness: sections.freshness,
		truncated: fields.truncated,
		ambiguity: Object.freeze([...fields.ambiguity]),
		staleness: sections.staleness,
		child: sections.child,
		threadLink: sections.threadLink,
	});
}

/**
 * Parses the exact canonical brief text.
 * @param text The brief bytes.
 * @returns The brief, or null when the bytes are not a canonical brief.
 */
function parseCanonicalBrief(text: string): VoiceContextCanonicalBrief | null {
	let unknown: unknown;
	try {
		unknown = JSON.parse(text);
	} catch {
		return null;
	}
	if (!isRecord(unknown) || !exactKeys(unknown, TOP_LEVEL_KEYS)) {
		return null;
	}
	const fields = scalars(unknown);
	const sections = parseSections(unknown);
	return fields !== null && complete(sections) ? assemble(fields, sections) : null;
}

export { parseCanonicalBrief };
