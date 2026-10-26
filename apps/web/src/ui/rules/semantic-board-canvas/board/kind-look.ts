// How the vault's kinds look where the About page and the details panel name
// them: what a kind is called, the icon the picture draws it with, and the
// colour of a relationship's line.
//
// The names and colours come from the vault's policy. The icons come from the
// picture on screen, which already holds each drawn kind's icon as markup: the
// About page fetches no icon of its own, and a kind the picture does not draw
// has no icon here and is drawn with a plain mark.

import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@archboard/board/policy";
import type { AppliedAppearance } from "#ui/clients/semantic-board-canvas/reads/semantic-boards.ts";

/** How a relationship kind is drawn as a chip: its words, its line colour and its dash. */
interface RelationshipLook {
	readonly name: string;
	/** A CSS colour. */
	readonly color: string;
	readonly dash: "solid" | "dashed" | "dotted";
}

/** How the vault's kinds look. */
interface KindLook {
	/**
	 * What a part kind is called.
	 * @param kind The kind.
	 * @returns The vault's name for it, or the kind itself when the vault has none.
	 */
	readonly nodeName: (kind: string) => string;
	/**
	 * The icon the picture draws a part kind with.
	 * @param kind The kind.
	 * @returns Its markup, or undefined when the picture draws no part of that kind.
	 */
	readonly nodeIcon: (kind: string) => string | undefined;
	/**
	 * The colour of a part kind, as a CSS colour.
	 * @param kind The kind.
	 * @returns The colour; a neutral for a kind with none.
	 */
	readonly nodeColor: (kind: string) => string;
	/**
	 * How a relationship kind is drawn as a chip.
	 * @param kind The kind.
	 * @returns Its look.
	 */
	readonly relationship: (kind: string) => RelationshipLook;
}

/** The colour of a kind the vault gives none. */
const NEUTRAL = "var(--muted-foreground)";

/**
 * A palette name as a CSS colour.
 * @param name The palette name, when the kind has one.
 * @returns The colour.
 */
function paletteColor(name: string | undefined): string {
	return name === undefined ? NEUTRAL : `var(--semantic-${name})`;
}

/**
 * Sentence case for a kind the vault does not name.
 * @param kind The kind.
 * @returns The kind with a capital.
 */
function capital(kind: string): string {
	return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

/**
 * How the vault's kinds look.
 * @param policy The vault's policy.
 * @param appearances What the picture on screen draws each subject with.
 * @returns The look.
 */
function kindLookOf(
	policy: SemanticPolicy,
	appearances: ReadonlyMap<string, AppliedAppearance>,
): KindLook {
	const icons = new Map<string, string>();
	for (const appearance of appearances.values()) {
		if (
			appearance.depiction !== "" &&
			appearance.iconSvg !== "" &&
			!icons.has(appearance.typeKind)
		) {
			icons.set(appearance.typeKind, appearance.iconSvg);
		}
	}
	return {
		/**
		 * What a part kind is called.
		 * @param kind The kind.
		 * @returns The vault's name for it, or the kind itself when the vault has none.
		 */
		nodeName: (kind) => policy.nodeKinds[kind]?.name ?? capital(kind),
		/**
		 * The icon the picture draws a part kind with.
		 * @param kind The kind.
		 * @returns Its markup, or undefined when the picture draws no part of that kind.
		 */
		nodeIcon: (kind) => icons.get(kind),
		/**
		 * The colour of a part kind.
		 * @param kind The kind.
		 * @returns The colour; a neutral for a kind with none.
		 */
		nodeColor: (kind) => paletteColor(policy.nodeKinds[kind]?.color),
		/**
		 * How a relationship kind is drawn as a chip.
		 * @param kind The kind.
		 * @returns Its name, its line colour and its dash.
		 */
		relationship: (kind) => {
			const found = policy.relationshipKinds[kind];
			return {
				name: found?.name ?? capital(kind),
				color: paletteColor(found?.color),
				dash: found?.dash ?? "solid",
			};
		},
	};
}

/** The look before the vault's policy has arrived. */
const DEFAULT_LOOK_POLICY = DEFAULT_SEMANTIC_POLICY;

export { DEFAULT_LOOK_POLICY, kindLookOf, type KindLook, type RelationshipLook };
