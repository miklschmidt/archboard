// Asking a board what one container's interface is (ADR 0044): which of its
// children relationships from outside reach, which they do not, who calls it
// and where it calls out.
//
// The derivation is the shared model's `inspectContainer`, the one function
// that ADR 0044 gives every reader of an interface. Everything here is the
// command's part: finding the node a person named, putting the derived facts
// into an answer with a schema, and saying them in words for a reader.

import { z } from "zod";
import { inspectContainer, interfaceMeasures } from "@archboard/board/container-interface";
import { RenderedVariantSchema } from "@archboard/board/render-reply";
import type { SemanticBoard, SemanticVariant } from "@archboard/board/document";
import type { SemanticEdge, SemanticNode } from "@archboard/board/content";
import { VaultDiagnosticSchema } from "@archboard/board/policy";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import {
	InspectedEdgeSchema,
	InspectedNodeSchema,
	inspectedEdge,
	inspectedNode,
} from "#cli/rules/semantic/inspect/inspected-subjects.ts";

type ContainerInspection = ReturnType<typeof inspectContainer>;
type InterfaceMeasures = ReturnType<typeof interfaceMeasures>;

/** A relationship with both its ends named, because one end is often outside the container. */
const NamedEdgeSchema = InspectedEdgeSchema.extend({ fromName: z.string(), toName: z.string() });

/**
 * The five interface measures (ADR 0044): counts, never combined into one
 * number. Held to the shared model's type, so a measure it adds cannot drop out
 * of the answer.
 */
const InterfaceMeasuresSchema = z.object({
	entryPoints: z.int(),
	hiddenParts: z.int(),
	callers: z.int(),
	outgoing: z.int(),
	passThrough: z.int(),
}) satisfies z.ZodType<InterfaceMeasures>;

/** What every answer about a container says first. */
const containerHead = {
	success: z.literal(true),
	board: z.string(),
	version: z.int(),
	variant: RenderedVariantSchema,
	container: InspectedNodeSchema,
	warnings: z.array(VaultDiagnosticSchema),
};

/**
 * What a container's interface is on one variant: the five interface measures
 * with the parts and relationships behind each, or the fact that the node holds
 * no parts. A node with no children has no interface, which is not an interface
 * of zero entry points.
 */
const ContainerInspectionResultSchema = z.discriminatedUnion("holdsParts", [
	z.object({ ...containerHead, holdsParts: z.literal(false) }),
	z.object({
		...containerHead,
		holdsParts: z.literal(true),
		/** The five counts: each is the length of the list of the same name below. */
		measures: InterfaceMeasuresSchema,
		/** The children that a relationship from outside reaches, with those relationships. */
		entryPoints: z.array(InspectedNodeSchema.extend({ reachedBy: z.array(NamedEdgeSchema) })),
		/** The children that none reaches. */
		hiddenParts: z.array(InspectedNodeSchema),
		/**
		 * The parts outside where a relationship into the container starts, once each.
		 * `reaches` is the entry points they reach; it is empty for a caller whose
		 * relationships all end on the container itself.
		 */
		callers: z.array(
			InspectedNodeSchema.extend({
				relationships: z.array(NamedEdgeSchema),
				reaches: z.array(z.string()),
			}),
		),
		/** Relationships that start inside the container and end outside it. */
		outgoing: z.array(NamedEdgeSchema),
		/** Relationships from outside that end on the container itself: a caller, no entry point. */
		onContainer: z.array(NamedEdgeSchema),
		/** The entry points that only pass a call through, a subset of `entryPoints`. */
		passThrough: z.array(InspectedNodeSchema),
	}),
]);
type ContainerInspectionResult = z.infer<typeof ContainerInspectionResultSchema>;

/**
 * The node a person named: its id first, then its name when exactly one node
 * answers to it.
 * @param variant The variant inspected.
 * @param reference The id or name typed.
 * @returns The node.
 * @throws {CliUsageError} When it names no node, or a name that fits several.
 */
function namedNode(variant: SemanticVariant, reference: string): SemanticNode {
	const { nodes } = variant.content;
	const byId = nodes.find((node) => node.id === reference);
	if (byId !== undefined) {
		return byId;
	}
	const byName = nodes.filter((node) => node.name === reference);
	const only = byName[0];
	if (only !== undefined && byName.length === 1) {
		return only;
	}
	if (byName.length > 1) {
		throw new CliUsageError(
			`"${reference}" is the name of ${byName.length} nodes of "${variant.name}"; ` +
				`name the one you mean by its id (${byName.map((node) => node.id).join(", ")}).`,
		);
	}
	const parents = new Set(nodes.map((node) => node.parent));
	const containers = nodes.filter((node) => parents.has(node.id)).map((node) => node.name);
	throw new CliUsageError(
		`"${reference}" is not a node of "${variant.name}". ` +
			`Containers on this variant: ${containers.join(", ") || "none"}.`,
	);
}

/**
 * What the node a person named is as a container, on one variant.
 * @param variant The variant inspected.
 * @param reference The id or name typed.
 * @returns Its interface, or the fact that it holds no parts.
 * @throws {CliUsageError} When the reference names no single node.
 */
function inspectedContainer(variant: SemanticVariant, reference: string): ContainerInspection {
	return inspectContainer(variant.content, namedNode(variant, reference));
}

/**
 * The answer, assembled from the derivation.
 * @param board The board as read.
 * @param variant The variant inspected, resolved.
 * @param inspection What the node is as a container on that variant.
 * @param warnings What the read warned about.
 * @returns The result.
 */
function containerAnswer(
	board: SemanticBoard,
	variant: SemanticVariant,
	inspection: ContainerInspection,
	warnings: ContainerInspectionResult["warnings"],
): ContainerInspectionResult {
	const head = {
		success: true as const,
		board: board.name,
		version: board.version,
		variant: { id: variant.id, name: variant.name, lifecycle: variant.lifecycle },
		container: inspectedNode(inspection.container),
		warnings,
	};
	if (!inspection.holdsParts) {
		return { ...head, holdsParts: false };
	}
	const names = new Map(variant.content.nodes.map((node) => [node.id, node.name]));
	/**
	 * One relationship with its ends named.
	 * @param edge The relationship.
	 * @returns The relationship as the answer carries it.
	 */
	const named = (edge: SemanticEdge): z.infer<typeof NamedEdgeSchema> => ({
		...inspectedEdge(edge),
		fromName: names.get(edge.from) ?? edge.from,
		toName: names.get(edge.to) ?? edge.to,
	});
	return {
		...head,
		holdsParts: true,
		measures: interfaceMeasures(inspection),
		entryPoints: inspection.entryPoints.map((entry) => ({
			...inspectedNode(entry.node),
			reachedBy: entry.reachedBy.map(named),
		})),
		hiddenParts: inspection.hiddenParts.map(inspectedNode),
		callers: inspection.callers.map((caller) => ({
			...inspectedNode(caller.node),
			relationships: caller.edges.map(named),
			reaches: [...caller.reaches],
		})),
		outgoing: inspection.outgoing.map(named),
		onContainer: inspection.onContainer.map(named),
		passThrough: inspection.passThrough.map(inspectedNode),
	};
}

/**
 * What to say about the answer on standard error, for a person.
 * @param result The answer.
 * @returns The lines.
 */
function describedContainer(result: ContainerInspectionResult): string[] {
	const where = `on "${result.board}" at "${result.variant.name}"`;
	const name = result.container.name;
	if (!result.holdsParts) {
		return [`"${name}" ${where} holds no parts, so it has no interface.`];
	}
	const { measures } = result;
	const lines = [
		`Container "${name}" ${where}: ${measures.entryPoints} entry point(s), ` +
			`${measures.hiddenParts} hidden part(s), ${measures.callers} caller(s), ` +
			`${measures.outgoing} outgoing relationship(s), ` +
			`${measures.passThrough} pass-through entry point(s).`,
	];
	/**
	 * Say who is on a list, when anybody is.
	 * @param label What the list is.
	 * @param nodes Who is on it.
	 */
	const list = (label: string, nodes: readonly { name: string }[]): void => {
		if (nodes.length > 0) lines.push(`${label}: ${nodes.map((node) => node.name).join(", ")}.`);
	};
	list("Entry points", result.entryPoints);
	list("Hidden parts", result.hiddenParts);
	list("Callers", result.callers);
	if (result.callers.length === 0) {
		lines.push(
			`The board draws no caller of "${name}", so no part is an entry point: ` +
				"every part is hidden because nothing outside reaches it.",
		);
	}
	list("Pass-through entry points (a question about each, not a fault)", result.passThrough);
	const wholeOnly = result.callers.filter((caller) => caller.reaches.length === 0);
	list(`Callers that reach "${name}" itself and no entry point`, wholeOnly);
	return lines;
}

export {
	ContainerInspectionResultSchema,
	type ContainerInspectionResult,
	InterfaceMeasuresSchema,
	containerAnswer,
	describedContainer,
	inspectedContainer,
};
