// The small marks the About page and the details panel share: a part kind's
// icon and a relationship kind's chip.

import { RiPuzzleLine } from "@remixicon/react";
import { useMemo, type CSSProperties, type JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/**
 * The markup of an icon the picture drew, without the colour it drew it in: the
 * page sets the colour.
 * @param markup The icon as the picture holds it.
 * @returns The same icon with no inline style.
 */
function uncoloured(markup: string): string {
	return markup.replace(/ style="[^"]*"/u, "");
}

/** Inputs for a kind's icon. */
interface KindIconProps {
	readonly look: KindLook;
	readonly kind: string;
	/** Its size and colour classes. */
	readonly className?: string | undefined;
	/** Its colour, when it is not the text's. */
	readonly style?: CSSProperties | undefined;
}

/**
 * The icon the picture draws a part kind with, or a plain mark for a kind the
 * picture does not draw.
 * @param props The kind and how to size it.
 * @returns The icon.
 */
function KindIcon(props: KindIconProps): JSX.Element {
	const { look, kind } = props;
	const icon = look.nodeIcon(kind);
	const markup = useMemo(
		() => (icon === undefined ? undefined : { __html: uncoloured(icon) }),
		[icon],
	);
	if (markup === undefined) {
		return (
			<RiPuzzleLine
				aria-hidden="true"
				className={cn("size-5 shrink-0", props.className)}
				style={props.style}
			/>
		);
	}
	return (
		<span
			aria-hidden="true"
			data-slot="kind-icon"
			className={cn(
				"inline-flex size-5 shrink-0 [&_svg]:size-full [&_svg]:fill-current",
				props.className,
			)}
			style={props.style}
			// The markup is the renderer's own, from icon path data the Archboard server serves.
			dangerouslySetInnerHTML={markup}
		/>
	);
}

/** The line sample before a relationship kind's name: its colour and its dash. */
const DASHES: Readonly<Record<"solid" | "dashed" | "dotted", string>> = {
	solid: "border-solid",
	dashed: "border-dashed",
	dotted: "border-dotted",
};

/** Inputs for a relationship kind's chip. */
interface RelationshipChipProps {
	readonly look: KindLook;
	readonly kind: string;
}

/**
 * A relationship kind: a short sample of its line, then its name.
 * @param props The kind.
 * @returns The chip.
 */
function RelationshipChip(props: RelationshipChipProps): JSX.Element {
	const { dash, color, name } = props.look.relationship(props.kind);
	const sample = useMemo<CSSProperties>(() => ({ borderColor: color }), [color]);
	return (
		<span
			data-slot="relationship-chip"
			className="text-body text-foreground/80 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
		>
			<span aria-hidden="true" className={cn("w-3 border-t-2", DASHES[dash])} style={sample} />
			{name}
		</span>
	);
}

export { KindIcon, RelationshipChip };
