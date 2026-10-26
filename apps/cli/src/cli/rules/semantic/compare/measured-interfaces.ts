// How `semantic compare` puts the interface measures of several variants side
// by side, for design it twice (ADR 0044): the schema of that section of the
// answer, the section built from the shared derivation, and what is said about
// it in words.
//
// Each count is read off one container on one variant by `inspectContainer`,
// the derivation every reader of an interface shares.
// The section marks no change and sets no comparison status: it puts the
// measures of each variant beside the others, combines them into no score and
// ranks no variant. What changed between two of them is `interfaceChanges`.

import { z } from "zod";
import { inspectContainer } from "@archboard/board/container-interface";
import { RenderedVariantSchema } from "@archboard/board/render-reply";
import {
	resolveVariant,
	type SemanticBoard,
	type SemanticVariant,
} from "@archboard/board/document";
import type { SemanticNode } from "@archboard/board/content";
import { CliUsageError } from "#cli/protocol/contract/contract.ts";
import {
	InterfacePartSchema,
	interfacePart,
} from "#cli/rules/semantic/compare/compared-interfaces.ts";
import { InterfaceMeasuresSchema } from "#cli/rules/semantic/inspect/container-inspection.ts";

/**
 * One container on one variant: its five counts with the entry points behind
 * the first and the pass-through entry points named, or the fact that the node
 * holds no parts there (absent, or with no children), which is not zero entry
 * points.
 */
const MeasuredOnSchema = z.discriminatedUnion("holdsParts", [
	z.object({ variant: z.string(), holdsParts: z.literal(false) }),
	z.object({
		variant: z.string(),
		holdsParts: z.literal(true),
		measures: InterfaceMeasuresSchema,
		entryPoints: z.array(InterfacePartSchema),
		/** A question for the reader about each, never a fault. */
		passThrough: z.array(InterfacePartSchema),
	}),
]);

/**
 * The interface measures of every container on every variant read, side by
 * side. `variants` is the order they were read in: the variant compared, the
 * one it is read against, then each `--beside`; each container lists them in
 * that order, by variant id.
 */
const InterfaceMeasuresSectionSchema = z.object({
	variants: z.array(RenderedVariantSchema),
	containers: z.array(
		z.object({ container: InterfacePartSchema, byVariant: z.array(MeasuredOnSchema) }),
	),
});

type MeasuredOn = z.infer<typeof MeasuredOnSchema>;
type InterfaceMeasuresSection = z.infer<typeof InterfaceMeasuresSectionSchema>;

/**
 * The variants `--beside` names, each once and none already read.
 * @param board The board as read.
 * @param named What `--beside` named, by id or name.
 * @param read The variants the comparison already reads.
 * @returns The variants to put beside them, in the order named.
 * @throws {CliUsageError} When a name is no variant of the board.
 */
function besideVariants(
	board: SemanticBoard,
	named: readonly string[],
	read: readonly SemanticVariant[],
): SemanticVariant[] {
	const beside: SemanticVariant[] = [];
	for (const name of named) {
		const found = resolveVariant(board, name);
		if (found === undefined) {
			throw new CliUsageError(
				`"${board.name}" has no variant "${name}" to put beside the others. ` +
					`Its variants: ${board.variants.map((one) => `"${one.name}"`).join(", ")}.`,
			);
		}
		if (![...read, ...beside].some((one) => one.id === found.id)) beside.push(found);
	}
	return beside;
}

/**
 * One node on one variant, measured.
 * @param variant The variant.
 * @param id The node's id.
 * @returns Its measures there, or the fact that it holds no parts there.
 */
function measuredOn(variant: SemanticVariant, id: string): MeasuredOn {
	const node = variant.content.nodes.find((one) => one.id === id);
	const inspection = node === undefined ? undefined : inspectContainer(variant.content, node);
	if (inspection?.holdsParts !== true) return { variant: variant.id, holdsParts: false };
	return {
		variant: variant.id,
		holdsParts: true,
		measures: inspection.measures,
		entryPoints: inspection.entryPoints.map((entry) => interfacePart(entry.node)),
		passThrough: inspection.passThrough.map(interfacePart),
	};
}

/**
 * The interface measures of every container on every variant, side by side.
 *
 * A container is a node that has children on any of them, by node identity,
 * named as the first variant that holds it names it. Containers come in the
 * document order of the first variant, then those only a later one has.
 * @param variants The variants, in the order the answer reads them.
 * @returns The section.
 */
function measuredInterfaces(variants: readonly SemanticVariant[]): InterfaceMeasuresSection {
	const containers = new Map<string, SemanticNode>();
	for (const variant of variants) {
		const parents = new Set(variant.content.nodes.map((node) => node.parent));
		for (const node of variant.content.nodes) {
			if (parents.has(node.id) && !containers.has(node.id)) containers.set(node.id, node);
		}
	}
	return {
		variants: variants.map(({ id, name, lifecycle }) => ({ id, name, lifecycle })),
		containers: [...containers.values()].map((container) => ({
			container: interfacePart(container),
			byVariant: variants.map((variant) => measuredOn(variant, container.id)),
		})),
	};
}

/**
 * What to say about the measures, for a person: one line per container, each
 * variant's five counts in the same order and nothing ranked. A variant that
 * draws no caller says so, so that its zero entry points do not read as the
 * deepest module there is (ADR 0044).
 * @param section The measures section of the answer.
 * @returns The lines; none when no variant has a container.
 */
function describedMeasures(section: InterfaceMeasuresSection): string[] {
	const names = new Map(section.variants.map((variant) => [variant.id, variant.name]));
	return section.containers.map(({ container, byVariant }) => {
		const sides = byVariant.map((on) => {
			const called = `"${names.get(on.variant) ?? on.variant}"`;
			if (!on.holdsParts) return `${called} holds no parts`;
			const { entryPoints, hiddenParts, callers, outgoing, passThrough } = on.measures;
			const counts = `${called} ${entryPoints}, ${hiddenParts}, ${callers}, ${outgoing}, ${passThrough}`;
			// With no caller there is no entry point, so no pass-through entry point either.
			if (callers === 0) return `${counts} (draws no caller)`;
			if (on.passThrough.length === 0) return counts;
			return `${counts} (pass-through: ${on.passThrough.map((part) => part.name).join(", ")})`;
		});
		return (
			`Interface measures of "${container.name}" ` +
			`(entry points, hidden parts, callers, outgoing, pass-through): ${sides.join("; ")}.`
		);
	});
}

export {
	InterfaceMeasuresSectionSchema,
	type InterfaceMeasuresSection,
	besideVariants,
	describedMeasures,
	measuredInterfaces,
};
