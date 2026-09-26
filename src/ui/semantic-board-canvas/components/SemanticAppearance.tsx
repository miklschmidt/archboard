import type { JSX } from "react";

import { Section } from "@/ui/semantic-board-canvas/components/SemanticInspectorParts";
import type { AppliedAppearance } from "@/ui/semantic-board-canvas/lib/appearance";
import type { Subject } from "@/ui/semantic-board-canvas/lib/board-document";

/**
 * Explain the visual channels applied to this exact picture.
 * @param props The subject, its applied appearance and comparison standing.
 * @param props.subject The selected architectural subject.
 * @param props.appearance Facts emitted by the renderer.
 * @param props.standing The subject's comparison status.
 * @returns The appearance explanation, when the renderer supplied one.
 */
function SemanticAppearance(props: {
	readonly subject: Subject | undefined;
	readonly appearance: AppliedAppearance | undefined;
	readonly standing: string | undefined;
}): JSX.Element | null {
	const { subject, appearance, standing } = props;
	if (subject === undefined || appearance === undefined) return null;
	const compared = standing !== undefined && standing !== "unchanged";
	return (
		<Section title="Appearance">
			<div className="text-body space-y-2.5" data-slot="semantic-inspector-appearance">
				{appearanceSentences(subject, appearance).map((sentence) => (
					<p key={sentence}>{sentence}</p>
				))}
				{compared && (
					<p>
						The {standing} comparison treatment takes precedence over the semantic border or line
						color.
					</p>
				)}
				<p className="text-muted-foreground">The outer highlight marks selection.</p>
			</div>
		</Section>
	);
}

/**
 * Explain the semantic channels for the selected subject.
 * @param subject Selected subject.
 * @param appearance Applied renderer metadata.
 * @returns The relevant appearance sentences.
 */
function appearanceSentences(subject: Subject, appearance: AppliedAppearance): string[] {
	if (subject.kind === "node")
		return [
			bodyExplanation(appearance),
			`${appearance.typeName} uses a ${appearance.typeColor} type chip.`,
		];
	if (subject.kind !== "edge") return [];
	const head =
		appearance.arrowhead === "none" ? "no arrowhead" : `${appearance.arrowhead} arrowhead`;
	return [
		`${appearance.typeName}: ${appearance.lineColor} ${appearance.dash} line, ${head}.`,
		`${appearance.emphasis} emphasis controls line weight.`,
	];
}

/**
 * Describe the body color and what gives it: a card's group, a container's own kind.
 * @param appearance Its applied appearance.
 * @returns One sentence explaining its body.
 */
function bodyExplanation(appearance: AppliedAppearance): string {
	if (appearance.depiction === "container")
		return appearance.bodyColor === "neutral"
			? `Container body is neutral because ${appearance.typeName} has no colour.`
			: `Container border and tint use ${appearance.bodyColor} from its ${appearance.typeName} kind.`;
	if (appearance.group === "") return "Card body is neutral because no group places it.";
	return `Card border and tint use ${appearance.bodyColor} from the ${appearance.group} group.`;
}

export { SemanticAppearance };
