// Which of the curated pairs one label is drawn in.
//
// Apart from the palette itself on purpose: what the colours ARE is a design
// decision somebody retunes, and which colour a given label LANDS ON is an
// arithmetic property that must not change when they do. Keeping them in one
// file would make every retune a change to both.
//
// The mapping is a hash, so it needs no registry, no group ids and nothing
// persisted: the same label draws the same colour on every board, in every
// variant, in both themes and in every process, because the label is the whole
// input. Two labels can land on the same pair, and that is accepted rather than
// resolved — a scheme that avoided collisions would have to know every label on
// the board, which makes a node's colour depend on its neighbours, and then a
// part of the architecture changes colour when something unrelated to it is
// renamed.
//
// Normalized first, because "Payments", "payments" and " payments " are one
// group as far as anybody reading a picture is concerned.

import type { DiagramTheme, NodeKind } from "@/shared/semantic-board/index";
import { GROUP_COLOURS } from "@/runtime/semantic-renderer/lib/group-palette";

/**
 * One label as it is compared and hashed: trimmed, folded to lower case, and
 * with every run of whitespace squeezed to one space.
 * @param label What somebody wrote.
 * @returns The normalized form.
 */
function normalizedGroup(label: string): string {
	return label.trim().toLowerCase().replace(/\s+/gu, " ");
}

/**
 * A small, stable hash of a normalized label.
 *
 * FNV-1a, 32-bit, written out rather than imported: it is four lines, it must
 * never change its answers, and a dependency that retuned its hash would
 * recolour every board in the repository.
 * @param text The normalized label.
 * @returns The hash.
 */
function hashOf(text: string): number {
	let hash = 0x81_1c_9d_c5;
	for (let at = 0; at < text.length; at += 1) {
		hash ^= text.charCodeAt(at);
		hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
	}
	return hash;
}

/**
 * The colour one group label is drawn in.
 * @param label The group, as written on the node.
 * @param theme Which ground the picture is drawn on.
 * @returns The colour.
 */
function groupColour(label: string, theme: DiagramTheme): string {
	const pair = GROUP_COLOURS[hashOf(normalizedGroup(label)) % GROUP_COLOURS.length]!;
	return theme === "dark" ? pair.dark : pair.light;
}

/**
 * The colour a node with no group is drawn in.
 *
 * What it IS, when nobody has said what it is PART OF: the kind goes through the
 * same mapping, so every icon on a board is coloured one way or the other and a
 * board that groups nothing still reads as more than a page of grey chips. The
 * kind is spelled the way the schema spells it, so the answer is the same
 * everywhere the same kind is drawn.
 * @param kind What sort of thing the node is.
 * @param theme Which ground the picture is drawn on.
 * @returns The colour.
 */
function kindColour(kind: NodeKind, theme: DiagramTheme): string {
	return groupColour(kind, theme);
}

/**
 * The colour one node's icon is drawn in: its group's, or its kind's.
 * @param node What the board says, as far as this question is concerned.
 * @param node.kind What sort of thing it is.
 * @param node.group What it belongs to, when it belongs to anything.
 * @param theme Which ground the picture is drawn on.
 * @returns The colour.
 */
function iconColour(
	node: { readonly kind: NodeKind; readonly group?: string | undefined },
	theme: DiagramTheme,
): string {
	return node.group === undefined ? kindColour(node.kind, theme) : groupColour(node.group, theme);
}

export { groupColour, iconColour, kindColour, normalizedGroup };
