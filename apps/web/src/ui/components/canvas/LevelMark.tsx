// A level's mark: the icon the vault's vocabulary gives the node kind of that
// level's name (ADR 0029), which is also what a card standing for a model of
// that level wears on the picture. So a level reads the same in the navigator,
// in a pane's breadcrumb and on a card. The vocabulary is read through the same
// cache the picture is drawn from. The icon's path data comes from the same
// server route the renderer fetches it from, but through this page's query
// cache: the renderer keeps its own copy in its chunk, which the page loads
// apart from the shell (apps/web/src/main.tsx). A level the vocabulary gives no icon,
// or an icon not yet read, shows the plain model mark.

import { RiFlowChart } from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";

import { cn } from "@archboard/ui-kit/components";
import { iconQuery, vaultCheckQuery } from "#ui/clients/canvas/reads/queries.ts";

/**
 * The icon the vocabulary gives the kind named for a level.
 * @param kinds The vocabulary's node kinds, once read.
 * @param level The level.
 * @returns The icon's name, or undefined when there is none.
 */
function iconOf(
	kinds: Readonly<Record<string, { readonly icon: string }>> | undefined,
	level: string | undefined,
): string | undefined {
	return level === undefined || kinds === undefined ? undefined : kinds[level]?.icon;
}

/** Inputs for a level's mark. */
interface LevelMarkProps {
	/** The level, as a model states it; undefined for a model that states none. */
	readonly level: string | undefined;
	/** The vault whose policy names the level's icon, or null for the plain mark. */
	readonly vault: string | null;
	/** Its size and colour; muted and 14 px unless said otherwise. */
	readonly className?: string | undefined;
}

/**
 * A level's mark.
 * @param props The level, and how to size and colour it.
 * @returns The icon.
 */
function LevelMark(props: LevelMarkProps): JSX.Element {
	const { level } = props;
	const kinds = useQuery({
		...vaultCheckQuery(props.vault ?? ""),
		enabled: props.vault !== null,
	}).data?.policy.nodeKinds;
	const name = iconOf(kinds, level);
	const paths = useQuery({ ...iconQuery(name ?? ""), enabled: name !== undefined }).data;
	const className = cn("text-muted-foreground size-3.5 shrink-0", props.className);
	if (name === undefined || paths === undefined) {
		return <RiFlowChart aria-hidden="true" data-level={level} className={className} />;
	}
	return (
		<svg
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
			data-level={level}
			className={className}
		>
			{paths.map((d) => (
				<path key={d} d={d} />
			))}
		</svg>
	);
}

export { LevelMark, type LevelMarkProps };
