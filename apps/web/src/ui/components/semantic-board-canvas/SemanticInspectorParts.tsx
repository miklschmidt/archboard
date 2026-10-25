// The inspector's own small vocabulary: the title every subject opens under,
// the words it says of itself, a group the part belongs to, and a list of facts.
// Its regions and sections are the sidebar's (`SemanticSidebarParts`), so both
// tabs of one sidebar read alike.
//
// These carry no knowledge of what a semantic board is. They are the shapes the
// panel is built out of, kept together so that a title looks the same whichever
// sort of subject is being explained — a part, a relationship, an exchange or one
// message of one — and so that the panel itself is about what the board says
// rather than about padding and type scales.

import { useCallback, type JSX, type ReactNode } from "react";

import { Button, cn } from "@archboard/ui-kit/components";
import { KindIcon } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import { SemanticGroupChip } from "#ui/components/semantic-board-canvas/SemanticGroupChip.tsx";
import { groupLabel, type GroupNames } from "#ui/rules/semantic-board-canvas/board/groups.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** Inputs for one fact. */
interface RowProps {
	/** What the value is. */
	label: string;
	/** The value. */
	value: string;
	/** The contract's name for the field, when a reader may want to select on it. */
	field?: string | undefined;
}

/**
 * One fact of a list: a muted label, then its value beside it. A long value
 * wraps rather than being cut off.
 * @param props The fact.
 * @returns A definition pair.
 */
function Row(props: RowProps): JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground text-body">{props.label}</dt>
			<dd data-field={props.field} className="text-body min-w-0 [overflow-wrap:anywhere]">
				{props.value}
			</dd>
		</>
	);
}

/**
 * A list of facts, each a `Row`.
 * @param props The rows.
 * @param props.children The rows.
 * @returns The list.
 */
function Facts(props: { readonly children: ReactNode }): JSX.Element {
	return (
		<dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2">{props.children}</dl>
	);
}

/** Inputs for the title. */
interface SubjectTitleProps {
	/** What the subject is called. */
	name: string;
	/** The vault's kinds, for the icon in the ring; with `kind`, for a part. */
	look?: KindLook | undefined;
	/** The kind of part whose icon stands in the ring. Left out for a subject that is not a part. */
	kind?: string | undefined;
	/** What it is, in one line: its kind and, for a part, the groups it belongs to. */
	children: ReactNode;
}

/**
 * The title every subject opens under: its name in the display face, wrapped
 * and never cut, and one line saying what it is. A part wears its kind's icon
 * in a gold ring, the ring the picture draws round what is picked out.
 * @param props The name, the kind of part and the line.
 * @returns The title.
 */
function SubjectTitle(props: SubjectTitleProps): JSX.Element {
	const { look, kind } = props;
	return (
		<div className="flex items-center gap-3">
			{look !== undefined && kind !== undefined && (
				<span
					aria-hidden="true"
					className="border-primary-mark bg-primary-subtle text-primary-text shadow-raised flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px]"
				>
					<KindIcon look={look} kind={kind} className="size-5" />
				</span>
			)}
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<h2 className="title-name [overflow-wrap:anywhere]">{props.name}</h2>
				<div className="text-body text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
					{props.children}
				</div>
			</div>
		</div>
	);
}

/** Inputs for one passage of what a subject says of itself. */
interface SaidProps {
	/** Where tests and styles find it. */
	slot: string;
	/** The words, when the board has some. */
	text: string | undefined;
	/** Whether it is the second passage, set quieter than the first. */
	muted?: boolean | undefined;
}

/**
 * One passage of what a subject says of itself, or nothing when the board
 * wrote none: a line reporting that there is nothing to read is a line a reader
 * has to read to learn it.
 * @param props The words.
 * @returns The passage, or nothing.
 */
function Said(props: SaidProps): JSX.Element | null {
	if (props.text === undefined) {
		return null;
	}
	return (
		<p
			data-slot={props.slot}
			className={cn(
				"text-body whitespace-pre-line",
				props.muted === true && "text-muted-foreground",
			)}
		>
			{props.text}
		</p>
	);
}

/**
 * What a subject says of itself, under its title: the line it is responsible
 * for, then the longer account, which is deliberately not drawn on the card
 * (ADR 0023). A subject with only an account has it in the foreground.
 * @param props The two passages, either of which the board may not have written.
 * @param props.lead The one line it is responsible for.
 * @param props.detail The longer account.
 * @returns The passages, or nothing.
 */
function Account(props: {
	readonly lead?: string | undefined;
	readonly detail?: string | undefined;
}): JSX.Element | null {
	const { lead, detail } = props;
	if (lead === undefined && detail === undefined) {
		return null;
	}
	return (
		<div className="flex flex-col gap-2">
			<Said slot="semantic-inspector-purpose" text={lead} />
			<Said slot="semantic-inspector-description" text={detail} muted={lead !== undefined} />
		</div>
	);
}

/** How the panel names groups, and how to select one. */
interface GroupControls {
	/** What the vault calls each group, by id. */
	readonly names: GroupNames;
	/**
	 * Select a group's members, when the pane around the panel can.
	 * @param group The group's id.
	 */
	readonly onChoose?: ((group: string) => void) | undefined;
}

/** Inputs for one membership. */
interface MembershipProps {
	/** The group's id. */
	group: string;
	/** The controls the panel was given. */
	controls: GroupControls;
}

/**
 * One group the part belongs to, as the control that selects its members: how a
 * reader sees the rest of it across whatever contains each part.
 *
 * Named by what the vault calls it and marked when the vault no longer does:
 * a membership in a group nobody defines is the board saying something the
 * configuration has stopped saying, and the reader is the one who repairs that.
 * @param props The group and the controls.
 * @returns The control.
 */
function Membership(props: MembershipProps): JSX.Element {
	const { group, controls } = props;
	const choose = useCallback((): void => {
		controls.onChoose?.(group);
	}, [controls, group]);
	const configured = Object.hasOwn(controls.names, group);
	return (
		<Button
			type="button"
			variant="outline"
			size="xs"
			disabled={controls.onChoose === undefined}
			data-slot="semantic-inspector-group"
			data-group={group}
			data-configured={configured}
			title={
				configured
					? `Select every part in ${groupLabel(group, controls.names)}`
					: `${group} is not configured`
			}
			className="gap-1.5"
			onClick={choose}
		>
			<SemanticGroupChip
				color={configured ? controls.names[group]?.color : undefined}
				selected={false}
			/>
			{groupLabel(group, controls.names)}
			{!configured && <span className="text-muted-foreground"> (not configured)</span>}
		</Button>
	);
}

export { Account, Facts, Membership, Row, SubjectTitle, type GroupControls };
