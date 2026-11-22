// The vocabulary every vault starts from: the built-in relationship kinds and
// lenses of the current format, those of the call era before sync and async
// replaced call, and the rules that read a reader's hidden kinds and effects in
// them (TASK-663).

import type { z } from "zod";
import type {
	EvidenceKindSchema,
	LensSchema,
	LineEffectSchema,
	RelationshipEffectSchema,
	RelationshipLookSchema,
	SemanticPolicy,
} from "#shared/schemas/semantic-policy.ts";

type EvidenceKind = z.infer<typeof EvidenceKindSchema>;
type RelationshipLook = z.infer<typeof RelationshipLookSchema>;
type Lens = z.infer<typeof LensSchema>;

/**
 * The one kind whose relationships may state no effect: a declared
 * requirement, of which nothing runs at run time. Every other kind, a vault's
 * own included, states one.
 */
const EFFECTLESS_KIND = "dependency";
/**
 * What proves a relationship across a network, an event bus, a queue, a
 * process boundary or a store: a use in code, a trigger or a route in
 * infrastructure, or configuration that points one part at the other (ADR 0046).
 */
const NETWORK: EvidenceKind[] = ["call", "configured-path"];
/** The retired in-process kind, and what replaces it. */
const RETIRED_CALL = "call";
const CALL_REPLACEMENT =
	"use sync where the caller has the answer when the call returns, or async where the call returns before the work is done";
/**
 * The relationship kinds every vault has, by how a relationship travels. Every
 * kind draws in an ink of its own, so the kind is the colour of its lines
 * (TASK-663). A vault's own entry replaces the built-in of its id whole, and a
 * vault adds a kind with an id of its own, which is where a relationship that
 * fits no built-in kind goes. Every built-in kind names the evidence kinds that
 * prove it to the code check (ADR 0046).
 */
const BUILT_IN_RELATIONSHIP_KINDS: Record<string, RelationshipLook> = {
	sync: { name: "Sync", color: "slate", evidence: ["call"] },
	async: { name: "Async", color: "amber", evidence: ["call"] },
	http: { name: "HTTP", color: "sky", evidence: NETWORK },
	rpc: { name: "RPC", color: "blue", evidence: NETWORK },
	event: { name: "Event", color: "violet", evidence: NETWORK },
	queue: { name: "Queue", color: "purple", evidence: NETWORK },
	stream: { name: "Stream", color: "cyan", evidence: NETWORK },
	spawn: { name: "Spawn", color: "fuchsia", evidence: NETWORK },
	render: { name: "Render", color: "pink", evidence: ["call"] },
	storage: { name: "Storage", color: "emerald", evidence: NETWORK },
	dependency: {
		name: "Dependency",
		color: "indigo",
		evidence: ["call", "configured-path", "import", "build-dependency"],
	},
};
/** The in-process kinds, which the default lens trims to what changes state. */
const IN_PROCESS = ["sync", "async"] as const;
/**
 * The lens of every relationship. A vault may rename it but not narrow it, so
 * Show all means one thing in every vault.
 */
const ALL_LENS_ID = "all";
const ALL_LENS: Lens = { name: "All relationships", hide: [] };
const NETWORK_LENS: Lens = {
	name: "Network",
	question: "How does traffic flow between processes?",
	show: ["http", "rpc", "queue", "event", "stream"].map((kind) => ({ kind })),
};
const READS_LENS: Lens = {
	name: "Reads",
	question: "Where is held or fetched state read?",
	show: [{ effect: "query" }],
};
const DEPENDENCIES_LENS: Lens = {
	name: "Declared dependencies",
	show: [{ kind: EFFECTLESS_KIND }],
};
/**
 * The lenses every vault has, in the order a reader is offered them. A
 * vault's own lens replaces the built-in of its id whole; `all` keeps showing
 * everything. `main` is the default: it leaves out declared dependencies and
 * in-process queries and computes, and shows every mutation and all traffic
 * between processes.
 */
const BUILT_IN_LENSES: Record<string, Lens> = {
	main: {
		name: "Main lines",
		hide: [
			{ kind: EFFECTLESS_KIND },
			...IN_PROCESS.flatMap((kind) => [
				{ kind, effect: "query" as const },
				{ kind, effect: "compute" as const },
			]),
		],
	},
	effects: {
		name: "Side effects",
		question: "Where does state change?",
		show: [{ effect: "mutation" }],
	},
	"sync-compute": {
		name: "Sync compute",
		question: "Where does the caller wait while another part works out an answer?",
		show: [{ kind: "sync", effect: "compute" }],
	},
	network: NETWORK_LENS,
	reads: READS_LENS,
	dependencies: DEPENDENCIES_LENS,
	[ALL_LENS_ID]: ALL_LENS,
};
/**
 * The built-in kinds of a vault written before sync and async replaced call,
 * exactly as it read them, so a reading of one keeps its vocabulary and its digest.
 */
const CALL_ERA_RELATIONSHIP_KINDS: Record<string, RelationshipLook> = {
	call: { name: "Call", arrowhead: "filled", evidence: ["call"] },
	http: { name: "HTTP", color: "sky", arrowhead: "filled", evidence: NETWORK },
	rpc: { name: "RPC", color: "blue", arrowhead: "filled", evidence: NETWORK },
	event: { name: "Event", color: "violet", arrowhead: "open", evidence: NETWORK },
	queue: { name: "Queue", color: "amber", arrowhead: "open", evidence: NETWORK },
	stream: { name: "Stream", color: "teal", arrowhead: "filled", evidence: NETWORK },
	spawn: { name: "Spawn", color: "fuchsia", arrowhead: "filled", evidence: NETWORK },
	render: { name: "Render", color: "pink", arrowhead: "filled", evidence: ["call"] },
	storage: { name: "Storage", color: "emerald", arrowhead: "filled", evidence: NETWORK },
	dependency: {
		name: "Dependency",
		color: "indigo",
		arrowhead: "open",
		evidence: ["call", "configured-path", "import", "build-dependency"],
	},
};
/** The built-in lenses of a vault written before sync and async replaced call. */
const CALL_ERA_LENSES: Record<string, Lens> = {
	main: {
		name: "Main lines",
		hide: [
			{ kind: EFFECTLESS_KIND },
			{ kind: RETIRED_CALL, effect: "query" },
			{ kind: RETIRED_CALL, effect: "compute" },
		],
	},
	effects: {
		name: "Effects",
		question: "Where does state change?",
		show: [{ effect: "mutation" }],
	},
	reads: READS_LENS,
	network: NETWORK_LENS,
	dependencies: DEPENDENCIES_LENS,
	[ALL_LENS_ID]: ALL_LENS,
};
/** The built-ins a vault's configuration sits over, in the current format or the call era. */
interface PolicyFormat {
	readonly kinds: Readonly<Record<string, RelationshipLook>>;
	readonly lenses: Readonly<Record<string, Lens>>;
}
const CURRENT_FORMAT: PolicyFormat = {
	kinds: BUILT_IN_RELATIONSHIP_KINDS,
	lenses: BUILT_IN_LENSES,
};
const CALL_ERA_FORMAT: PolicyFormat = {
	kinds: CALL_ERA_RELATIONSHIP_KINDS,
	lenses: CALL_ERA_LENSES,
};
const DEFAULT_LENS_ID = "main";

/**
 * The kinds a reader hides, read in the policy's vocabulary: an address or a
 * recipe from before sync and async that hides call hides both, unless the
 * policy is of that era and still has call.
 * @param kinds The kinds the reading names.
 * @param policy The policy in effect.
 * @returns The kinds hidden.
 */
function hiddenKinds(
	kinds: readonly string[] | undefined,
	policy: Pick<SemanticPolicy, "relationshipKinds">,
): string[] {
	if (Object.hasOwn(policy.relationshipKinds, RETIRED_CALL)) return [...(kinds ?? [])];
	return [
		...new Set((kinds ?? []).flatMap((kind) => (kind === RETIRED_CALL ? IN_PROCESS : [kind]))),
	];
}

/**
 * The token by which a reader hides a relationship's effect: the effect it
 * states, or `declared` for a dependency that states none.
 * @param edge The relationship's kind and effect.
 * @param edge.kind Its kind.
 * @param edge.effect Its effect, if it states one.
 * @returns The token, or undefined for a relationship of an old reading that states none.
 */
function lineEffect(edge: {
	readonly kind: string;
	readonly effect?: z.infer<typeof RelationshipEffectSchema> | undefined;
}): z.infer<typeof LineEffectSchema> | undefined {
	return edge.effect ?? (edge.kind === EFFECTLESS_KIND ? "declared" : undefined);
}

/**
 * Why the kind call is refused, and what replaces it, for a caller that names it.
 * @param kind A kind a caller names.
 * @returns The refusal's words, or undefined for any other kind.
 */
function retiredCallAdvice(kind: string): string | undefined {
	return kind === RETIRED_CALL ? `The kind call is gone: ${CALL_REPLACEMENT}` : undefined;
}

/**
 * Whether a relationship kind is the declared requirement, the one kind that
 * may state no effect, because nothing of its target runs at run time.
 * @param kind The relationship's kind.
 * @returns True for that kind.
 */
function isEffectlessKind(kind: string): boolean {
	return kind === EFFECTLESS_KIND;
}

/**
 * What a line's dash says it does under a policy, as the renderer core draws
 * it (`line_appearance` in `crates/archboard-render`): the effect the line
 * states, `declared` for a dependency that states none, and nothing on a
 * reading whose kinds record their dash, which keeps its recorded look (ADR 0065).
 * @param line The line's kind and effect.
 * @param line.kind Its kind.
 * @param line.effect Its effect, if it states one.
 * @param policy The policy in effect.
 * @returns The effect its dash says, or undefined.
 */
function drawnEffect(
	line: {
		readonly kind: string;
		readonly effect?: z.infer<typeof RelationshipEffectSchema> | undefined;
	},
	policy: SemanticPolicy,
): z.infer<typeof LineEffectSchema> | undefined {
	if (Object.values(policy.relationshipKinds).some((kind) => kind.dash !== undefined))
		return undefined;
	return lineEffect(line);
}

export {
	ALL_LENS,
	ALL_LENS_ID,
	BUILT_IN_LENSES,
	BUILT_IN_RELATIONSHIP_KINDS,
	CALL_ERA_FORMAT,
	CALL_REPLACEMENT,
	CURRENT_FORMAT,
	DEFAULT_LENS_ID,
	EFFECTLESS_KIND,
	IN_PROCESS,
	RETIRED_CALL,
	drawnEffect,
	hiddenKinds,
	isEffectlessKind,
	lineEffect,
	retiredCallAdvice,
	type PolicyFormat,
};
