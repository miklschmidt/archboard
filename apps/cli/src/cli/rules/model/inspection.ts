// How `model inspect` states one module's interface (ADR 0044) or one group's
// boundary.
//
// The derivation is the shared `inspectContainer` and `inspectGroup`, which the
// reader and the comparison also use. Everything here is the command's part:
// putting the derived facts into an answer with a schema, and saying them in
// words. The answer holds counts and lists. It never combines the counts and it
// gives no verdict, because a model does not hold behavior.

import { z } from "zod";
import { inspectContainer, interfaceMeasures } from "@archboard/model/container-interface";
import {
	inspectGroup,
	modelContent,
	type Model,
	type SemanticEdge,
	type SemanticNode,
	type VariantContent,
} from "@archboard/model/content";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";

/** One module as an answer names it: enough to find it in the model. */
const InspectedModuleSchema = z.strictObject({
	id: z.string(),
	name: z.string(),
	kind: z.string(),
	parent: z.string().nullable(),
	groups: z.array(z.string()),
});

/** One relationship with both ends named, because one end is often outside. */
const InspectedRelationshipSchema = z.strictObject({
	id: z.string(),
	from: z.string(),
	fromName: z.string(),
	to: z.string(),
	toName: z.string(),
	kind: z.string(),
	label: z.string().nullable(),
});

/** The five interface measures, held to the shared type so that none can drop out. */
const InterfaceMeasuresSchema = z.strictObject({
	entryPoints: z.int(),
	hiddenParts: z.int(),
	callers: z.int(),
	outgoing: z.int(),
	passThrough: z.int(),
}) satisfies z.ZodType<ReturnType<typeof interfaceMeasures>>;

/** What every answer says first: which exact reading it was derived from. */
const readingHead = {
	success: z.literal(true),
	model: z.strictObject({ id: z.string(), name: z.string() }),
	/** Null for a checkpoint or a planning model that selects no state. */
	state: z.strictObject({ id: z.string(), name: z.string(), lifecycle: z.string() }).nullable(),
	checkpoint: z.string().optional(),
	revision: z.string(),
};

/**
 * One module's interface, or the fact that it holds no parts. A module with no
 * parts has no interface, which is not an interface of zero entry points.
 */
const ModuleInspectionSchema = z.discriminatedUnion("holdsParts", [
	z.strictObject({ ...readingHead, module: InspectedModuleSchema, holdsParts: z.literal(false) }),
	z.strictObject({
		...readingHead,
		module: InspectedModuleSchema,
		holdsParts: z.literal(true),
		/** The five counts: each is the length of the list of the same name below. */
		measures: InterfaceMeasuresSchema,
		/** The parts that a relationship from outside reaches, with those relationships. */
		entryPoints: z.array(
			InspectedModuleSchema.extend({ reachedBy: z.array(InspectedRelationshipSchema) }),
		),
		/** The parts that none reaches. */
		hiddenParts: z.array(InspectedModuleSchema),
		/**
		 * The modules outside where a relationship into this one starts, once each.
		 * `reaches` is empty for a caller whose relationships all end on the module itself.
		 */
		callers: z.array(
			InspectedModuleSchema.extend({
				relationships: z.array(InspectedRelationshipSchema),
				reaches: z.array(z.string()),
			}),
		),
		/** Relationships that start inside the module and end outside it. */
		outgoing: z.array(InspectedRelationshipSchema),
		/** Relationships from outside that end on the module itself: a caller, no entry point. */
		onContainer: z.array(InspectedRelationshipSchema),
		/** The entry points that only pass one call on: a question about each, never a fault. */
		passThrough: z.array(InspectedModuleSchema),
	}),
]);
type ModuleInspection = z.infer<typeof ModuleInspectionSchema>;

/** One group in one reading, read before any reading narrows it. */
const GroupInspectionSchema = z.strictObject({
	...readingHead,
	group: z.strictObject({ id: z.string(), name: z.string() }),
	members: z.array(InspectedModuleSchema),
	/** Relationships with a member at both ends. */
	internal: z.array(InspectedRelationshipSchema),
	/** Relationships with a member at exactly one end. */
	boundary: z.array(
		InspectedRelationshipSchema.extend({
			direction: z.enum(["incoming", "outgoing"]),
			member: z.string(),
			neighbor: z.string(),
		}),
	),
	/** The modules at the far end of a boundary relationship, once each. */
	neighbors: z.array(InspectedModuleSchema),
});
type GroupInspection = z.infer<typeof GroupInspectionSchema>;

/**
 * What a reading is called in words.
 * @param reading The reading.
 * @param reading.state Its state, when it selects one.
 * @param reading.checkpoint Its checkpoint, when it is retained.
 * @returns The state's name, its checkpoint, or the fact that it selects neither.
 */
function readingName(reading: {
	readonly state: { readonly name: string } | null;
	readonly checkpoint?: string | undefined;
}): string {
	return reading.state?.name ?? reading.checkpoint ?? "no state";
}

/**
 * The head of an answer.
 * @param model The reading.
 * @returns What identifies it.
 */
function headOf(model: Model) {
	const { selectedState: state, checkpoint, manifest, revision } = model;
	return {
		success: true as const,
		model: { id: manifest.id, name: manifest.name },
		state: state === null ? null : { id: state.id, name: state.name, lifecycle: state.lifecycle },
		...(checkpoint === undefined ? {} : { checkpoint: checkpoint.id }),
		revision: revision.digest,
	};
}

/**
 * One module, as an answer carries it.
 * @param node The module.
 * @returns Its identity, kind, container and groups.
 */
function inspectedModule(node: SemanticNode): z.infer<typeof InspectedModuleSchema> {
	return {
		id: node.id,
		name: node.name,
		kind: node.kind,
		parent: node.parent ?? null,
		groups: node.groups ?? [],
	};
}

/**
 * What names the ends of a relationship in one reading.
 * @param content The reading's whole content.
 * @returns The function that carries one relationship.
 */
function relationshipNamer(content: VariantContent) {
	const names = new Map(content.nodes.map((node) => [node.id, node.name]));
	return (edge: SemanticEdge): z.infer<typeof InspectedRelationshipSchema> => ({
		id: edge.id,
		from: edge.from,
		fromName: names.get(edge.from) ?? edge.from,
		to: edge.to,
		toName: names.get(edge.to) ?? edge.to,
		kind: edge.kind,
		label: edge.label ?? null,
	});
}

/**
 * One module's interface in one reading.
 * @param model The reading, with the module selected.
 * @returns The answer.
 */
function moduleInspection(model: Model): ModuleInspection {
	const content = modelContent(model);
	const inspection = inspectContainer(
		content,
		content.nodes.find((node) => node.id === model.selectedModule)!,
	);
	const head = { ...headOf(model), module: inspectedModule(inspection.container) };
	if (!inspection.holdsParts) return { ...head, holdsParts: false };
	const named = relationshipNamer(content);
	return {
		...head,
		holdsParts: true,
		measures: interfaceMeasures(inspection),
		entryPoints: inspection.entryPoints.map((entry) => ({
			...inspectedModule(entry.node),
			reachedBy: entry.reachedBy.map(named),
		})),
		hiddenParts: inspection.hiddenParts.map(inspectedModule),
		callers: inspection.callers.map((caller) => ({
			...inspectedModule(caller.node),
			relationships: caller.edges.map(named),
			reaches: [...caller.reaches],
		})),
		outgoing: inspection.outgoing.map(named),
		onContainer: inspection.onContainer.map(named),
		passThrough: inspection.passThrough.map(inspectedModule),
	};
}

/**
 * One group's boundary in one reading.
 * @param model The reading.
 * @param id The group's id.
 * @returns The answer. A configured group with no members answers empty.
 * @throws {CliUsageError} When the vault configures no such group.
 */
function groupInspection(model: Model, id: string): GroupInspection {
	const defined = Object.hasOwn(model.policy.groups, id) ? model.policy.groups[id] : undefined;
	if (defined === undefined) {
		const configured = Object.keys(model.policy.groups).join(", ") || "none";
		throw new CliUsageError(`"${id}" is not a configured group. Configured: ${configured}.`);
	}
	const content = modelContent(model);
	const inspection = inspectGroup(content, id);
	const named = relationshipNamer(content);
	return {
		...headOf(model),
		group: { id, name: defined.name },
		members: inspection.members.map(inspectedModule),
		internal: inspection.internalEdges.map(named),
		boundary: inspection.boundaryEdges.map((boundary) => ({
			...named(boundary.edge),
			direction: boundary.direction,
			member: boundary.member,
			neighbor: boundary.neighbor,
		})),
		neighbors: inspection.neighbors.map(inspectedModule),
	};
}

/**
 * Some names, in a list that a line can hold.
 * @param named What to name.
 * @returns The names.
 */
function namesOf(named: readonly { readonly name: string }[]): string {
	return named.map((one) => one.name).join(", ");
}

/**
 * Some relationships, in a list that a line can hold.
 * @param relationships What to name.
 * @returns Each one by its ends.
 */
function endsOf(relationships: z.infer<typeof InspectedRelationshipSchema>[]): string {
	return relationships.map((one) => `${one.fromName} -> ${one.toName}`).join(", ");
}

/**
 * What to say about one module's interface on standard error.
 * @param result The answer.
 * @returns The lines.
 */
function describedModule(result: ModuleInspection): string[] {
	const name = result.module.name;
	const where = `in "${result.model.name}" at "${readingName(result)}"`;
	if (!result.holdsParts) return [`"${name}" ${where} holds no parts, so it has no interface.`];
	const { measures } = result;
	const entries = result.entryPoints.map((entry) => {
		const callers = new Set(entry.reachedBy.map((one) => one.fromName));
		return `${entry.name} (from ${[...callers].join(", ")})`;
	});
	const lists: (readonly [string, string])[] = [
		["Entry points", entries.join(", ")],
		["Hidden parts", namesOf(result.hiddenParts)],
		["Callers", namesOf(result.callers)],
		["Outgoing", endsOf(result.outgoing)],
		[`Relationships that end on "${name}" itself`, endsOf(result.onContainer)],
		["Pass-through entry points (a question about each, not a fault)", namesOf(result.passThrough)],
	];
	return [
		`Module "${name}" ${where}: ${measures.entryPoints} entry point(s), ` +
			`${measures.hiddenParts} hidden part(s), ${measures.callers} caller(s), ` +
			`${measures.outgoing} outgoing relationship(s), ` +
			`${measures.passThrough} pass-through entry point(s).`,
		...lists.filter(([, listed]) => listed !== "").map(([label, listed]) => `${label}: ${listed}.`),
		...(result.callers.length === 0
			? [`The model draws no caller of "${name}", so nothing outside reaches any part.`]
			: []),
	];
}

/**
 * What to say about one group's boundary on standard error.
 * @param result The answer.
 * @returns The lines.
 */
function describedGroup(result: GroupInspection): string[] {
	const { group, members, internal, boundary, neighbors } = result;
	return [
		`Group ${group.name} (${group.id}) in "${result.model.name}" at "${readingName(result)}": ` +
			`${members.length} member(s), ${internal.length} internal, ` +
			`${boundary.length} boundary relationship(s), ${neighbors.length} neighbor(s).`,
		...(members.length === 0 ? ["No module belongs to it in this reading."] : []),
	];
}

export {
	GroupInspectionSchema,
	ModuleInspectionSchema,
	describedGroup,
	describedModule,
	groupInspection,
	moduleInspection,
	readingName,
};
