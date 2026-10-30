// What the code of a picked container exposes (TASK-539.02). In the
// codebase-design skill, an interface is everything a caller must know. The
// board's entry points show only which parts callers reach (ADR 0044). The
// names its module exposes, and who outside uses each, show how wide the code's
// interface is without opening the code.
//
// The names come from the server's memory of the last code pass (TASK-539.01),
// read when the person picks the container out; a pane never starts a pass. The
// counts are exact. Names are listed most used first, and the names no file
// outside uses fold into one row. A chosen name lists its users as paths and
// the files that pass it on. Pointing at a user lights the part that holds it.
// The picture does not change: exposed names are facts about the code and never
// become cards.

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState, type JSX } from "react";

import type {
	RememberedExposureSchema,
	RememberedFindingsSchema,
} from "@archboard/code-intel/code-check";
import type { z } from "zod";
import type { SemanticNode, VariantContent } from "@archboard/board/content";
import {
	codeFindingsQuery,
	exposureQuery,
} from "#ui/clients/semantic-board-canvas/reads/queries.ts";
import {
	SidebarChoice,
	SidebarChoices,
	SidebarLabel,
	SidebarMeta,
	SidebarRegion,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import type { ReadingOnScreen } from "#ui/hooks/semantic-board-canvas/use-code-findings.ts";
import { usePaneVault } from "#ui/hooks/semantic-board-canvas/use-pane-vault.ts";
import { usePeekControl } from "#ui/hooks/semantic-board-canvas/use-peek.ts";
import {
	exposedNamesState,
	type ContainerCounts,
	type ExposedNamesState,
} from "#ui/rules/semantic-board-canvas/code/exposed-names.ts";
import { whenChecked } from "#ui/rules/semantic-board-canvas/code/when-checked.ts";

/** What the server remembers of every pass since it started. */
type RememberedFindings = z.infer<typeof RememberedFindingsSchema>;
/** What one container exposed in the last pass, with when it was read. */
type RememberedExposure = z.infer<typeof RememberedExposureSchema>;
/** One name the module exposes, as the server remembers it. */
type ExposedName = RememberedExposure["exposure"]["names"][number];

/** Inputs for the exposed names. */
interface ExposedNamesProps {
	/** The picked part. */
	readonly node: SemanticNode;
	/** The variant that holds it, whole. */
	readonly content: VariantContent;
	/** The board, variant and version on screen. */
	readonly on: Omit<ReadingOnScreen, "vault">;
}

/**
 * The exposed names of a picked container, or why there is no reading of them.
 * @param props The part, the variant that holds it, and what is on screen.
 * @returns The region, or nothing for a part with no module behind it.
 */
function ExposedNames(props: ExposedNamesProps): JSX.Element | null {
	const vault = usePaneVault();
	const { node, content, on } = props;
	const select = useCallback(
		(remembered: RememberedFindings): ExposedNamesState =>
			exposedNamesState(remembered, { ...on, node, content }),
		[on, node, content],
	);
	const { data: state } = useQuery({ ...codeFindingsQuery(vault), select });
	if (state === undefined || state.kind === "none") {
		return null;
	}
	return (
		<SidebarRegion slot="semantic-inspector-exposed">
			<SidebarSection title="Exposed names" slot="semantic-inspector-exposed-names" level={3}>
				{state.kind === "read" ? (
					<ReadNames
						vault={vault}
						board={on.board}
						variant={on.variant}
						version={on.version}
						container={node.id}
						counts={state.counts}
						checkedAt={state.checkedAt}
						content={content}
					/>
				) : (
					<NoReading state={state} />
				)}
			</SidebarSection>
		</SidebarRegion>
	);
}

/**
 * Why there is no reading of the names, and when the pass it speaks of ran.
 * @param props The state.
 * @param props.state Why.
 * @returns The words.
 */
function NoReading(props: {
	readonly state: Exclude<ExposedNamesState, { kind: "none" | "read" }>;
}): JSX.Element {
	const { state } = props;
	const words = {
		"no-pass": "No code pass has run since the server started.",
		"variant-unread": "The last code pass did not read this variant.",
		"board-changed": "The board changed after the last code pass.",
		skipped: "The last code pass skipped this container",
	}[state.kind];
	return (
		<div data-slot="semantic-exposed-none" data-state={state.kind} className="flex flex-col gap-1">
			<p className="text-muted-foreground text-body">
				{words}
				{state.kind === "skipped" && (
					<>
						:{" "}
						<span className="text-technical font-mono">
							{state.skip.detail ?? state.skip.reason}
						</span>
					</>
				)}
			</p>
			{state.kind !== "no-pass" && <PassTime checkedAt={state.checkedAt} />}
		</div>
	);
}

/**
 * When the pass ran.
 * @param props When.
 * @param props.checkedAt As the server wrote it.
 * @returns The line.
 */
function PassTime(props: { readonly checkedAt: string }): JSX.Element {
	return (
		<p className="text-muted-foreground text-body">
			Code pass at{" "}
			<time dateTime={props.checkedAt} className="text-technical font-mono">
				{whenChecked(props.checkedAt)}
			</time>
		</p>
	);
}

/** Inputs for a container the pass judged. */
interface ReadNamesProps {
	readonly vault: string;
	readonly board: string;
	/** The variant on screen, by id. */
	readonly variant: string;
	/** The board version on screen and in the polled reading. */
	readonly version: number;
	/** The container, by id. */
	readonly container: string;
	readonly counts: ContainerCounts;
	readonly checkedAt: string;
	readonly content: VariantContent;
}

/**
 * The counts of a container the pass judged, and its names once they are read.
 * @param props The container, its counts and when the pass ran.
 * @returns The section's body.
 */
function ReadNames(props: ReadNamesProps): JSX.Element {
	const { counts } = props;
	return (
		<>
			<p
				data-slot="semantic-exposed-counts"
				data-exposed={counts.exposed}
				data-used={counts.usedOutside}
				className="text-body"
			>
				{counts.exposed} exposed, {counts.usedOutside} used outside{" "}
				<span className="text-technical text-muted-foreground font-mono">{counts.module}</span>
			</p>
			<ExposureNames {...props} />
			<PassTime checkedAt={props.checkedAt} />
		</>
	);
}

/**
 * Read the names on demand, with progress and a retry when that read fails.
 * @param props The container and the pass whose counts are on screen.
 * @returns Its names, or the state of their read.
 */
function ExposureNames(props: ReadNamesProps): JSX.Element {
	const { vault, board, variant, container, checkedAt, counts } = props;
	const site = useMemo(() => ({ board, variant, container }), [board, variant, container]);
	const { data, isFetching, refetch } = useQuery(exposureQuery(vault, site, checkedAt));
	const again = useCallback((): void => {
		void refetch();
	}, [refetch]);
	if (isFetching) {
		return (
			<output
				data-slot="semantic-exposed-status"
				data-state="loading"
				className="text-muted-foreground text-body"
			>
				Reading exposed names.
			</output>
		);
	}
	if (!data) {
		return (
			<div data-slot="semantic-exposed-status" data-state="unavailable">
				<p className="text-muted-foreground text-body">
					{data === null
						? "The server no longer remembers these names."
						: "The request for exposed names failed."}
				</p>
				<SidebarChoice data-slot="semantic-exposed-retry" onClick={again}>
					<SidebarLabel>Read exposed names again</SidebarLabel>
				</SidebarChoice>
			</div>
		);
	}
	if (data.version !== props.version || data.checkedAt !== checkedAt) {
		return (
			<output
				data-slot="semantic-exposed-status"
				data-state="changed"
				className="text-muted-foreground text-body"
			>
				The code pass changed. Waiting for its reading.
			</output>
		);
	}
	return (
		<NameList
			names={data.exposure.names}
			unused={counts.exposed - counts.usedOutside}
			content={props.content}
		/>
	);
}

/** Inputs for the list of names. */
interface NameListProps {
	readonly names: readonly ExposedName[];
	/** How many names no file outside uses, exactly, however many are listed. */
	readonly unused: number;
	readonly content: VariantContent;
}

/**
 * The names, most used first, with the unused ones folded into one row.
 * @param props The names and the variant that holds the users' parts.
 * @returns The list.
 */
function NameList(props: NameListProps): JSX.Element {
	const [chosen, setChosen] = useState<string | null>(null);
	const [unfolded, setUnfolded] = useState(false);
	const { names } = props;
	const used = useMemo(() => names.filter((name) => name.users > 0), [names]);
	const unused = useMemo(() => names.filter((name) => name.users === 0), [names]);
	const toggleUnused = useCallback((): void => setUnfolded((was) => !was), []);
	const each = { chosen, onChoose: setChosen, content: props.content };
	return (
		<SidebarChoices label="Exposed names, most used first" slot="semantic-exposed-list">
			<NameRows names={used} {...each} />
			{props.unused > 0 && (
				<SidebarChoice
					data-slot="semantic-exposed-unused"
					data-count={props.unused}
					pressed={unfolded}
					aria-expanded={unfolded}
					onClick={toggleUnused}
				>
					<SidebarLabel>{props.unused} names no file outside uses</SidebarLabel>
				</SidebarChoice>
			)}
			{unfolded && <NameRows names={unused} {...each} />}
		</SidebarChoices>
	);
}

/** Inputs for some names. */
interface NameRowsProps extends Omit<NameRowProps, "name" | "open"> {
	readonly names: readonly ExposedName[];
	/** The name whose users are open, if any. */
	readonly chosen: string | null;
}

/**
 * Some names, each a row.
 * @param props The names, and which one is open.
 * @returns The rows.
 */
function NameRows(props: NameRowsProps): JSX.Element {
	const { names, chosen, ...each } = props;
	return (
		<>
			{names.map((name) => (
				<NameRow key={name.name} name={name} open={chosen === name.name} {...each} />
			))}
		</>
	);
}

/** Inputs for one name. */
interface NameRowProps {
	readonly name: ExposedName;
	readonly open: boolean;
	/**
	 * Choose a name, or let it go.
	 * @param name The name, or null.
	 */
	readonly onChoose: (name: string | null) => void;
	readonly content: VariantContent;
}

/**
 * One name: the choice that opens its users, and the users once it is open.
 * @param props The name, and whether it is open.
 * @returns The row.
 */
function NameRow(props: NameRowProps): JSX.Element {
	const { name, open, onChoose } = props;
	const choose = useCallback(
		(): void => onChoose(open ? null : name.name),
		[onChoose, open, name.name],
	);
	return (
		<>
			<SidebarChoice
				data-slot="semantic-exposed-name"
				data-name={name.name}
				data-users={name.users}
				pressed={open}
				aria-expanded={open}
				onClick={choose}
			>
				<SidebarLabel>
					<span className="text-technical font-mono">{name.name}</span>
				</SidebarLabel>
				<SidebarMeta technical>{name.users}</SidebarMeta>
			</SidebarChoice>
			{open && <NameUsers name={name} content={props.content} />}
		</>
	);
}

/**
 * Who uses one name, and the files that pass it on.
 * @param props The name, and the variant that holds the users' parts.
 * @param props.name The name.
 * @param props.content The variant.
 * @returns The users and the via lines.
 */
function NameUsers(props: {
	readonly name: ExposedName;
	readonly content: VariantContent;
}): JSX.Element {
	const { name, content } = props;
	const more = name.users - name.usedBy.length;
	return (
		<div data-slot="semantic-exposed-users" className="flex flex-col pl-6">
			{name.usedBy.map((user) => (
				<UserRow
					key={user.path}
					path={user.path}
					line={user.line}
					part={content.nodes.find((node) => user.parts.includes(node.id))}
				/>
			))}
			{more > 0 && <p className="text-muted-foreground text-body px-2">and {more} more</p>}
			{name.via.map((path) => (
				<p
					key={path}
					data-slot="semantic-exposed-via"
					className="text-muted-foreground text-body px-2"
				>
					via <span className="text-technical font-mono">{path}</span>
				</p>
			))}
		</div>
	);
}

/**
 * One file outside the module that uses the name: pointing at it lights the
 * part that holds it, and a file no part holds says so.
 * @param props The file, the line and the part that holds it.
 * @param props.path The file.
 * @param props.line The first line of its use.
 * @param props.part The part that holds that line, if the board draws one.
 * @returns The row.
 */
function UserRow(props: {
	readonly path: string;
	readonly line: number;
	readonly part: SemanticNode | undefined;
}): JSX.Element {
	const { part } = props;
	const { point } = usePeekControl();
	const aim = useCallback((): void => point(part?.id ?? null), [point, part]);
	const leave = useCallback((): void => point(null), [point]);
	return (
		<SidebarChoice
			data-slot="semantic-exposed-user"
			data-part={part?.id}
			onPointerEnter={aim}
			onPointerLeave={leave}
			onFocus={aim}
			onBlur={leave}
		>
			<SidebarLabel>
				<span className="text-technical font-mono">
					{props.path}:{props.line}
				</span>
				<SidebarMeta>{part === undefined ? "Not drawn" : part.name}</SidebarMeta>
			</SidebarLabel>
		</SidebarChoice>
	);
}

export { ExposedNames };
