// The inspector's own small vocabulary: a definition row, a section, a title
// block, and a description. Its headings are the sidebar's
// (`SemanticSidebarParts`), so both tabs of one sidebar read alike.
//
// These carry no knowledge of what a semantic board is. They are the shapes the
// panel is built out of, kept together so that a section looks the same
// whichever sort of subject is being explained — a node, a relationship, an
// exchange or one message of one — and so that the panel itself is about what
// the board says rather than about padding and type scales.

import { useCallback, type JSX, type ReactNode } from "react";

import { Button } from "@/ui/components/button";
import { Badge } from "@/ui/components/badge";
import { SemanticGroupChip } from "@/ui/semantic-board-canvas/components/SemanticGroupChip";
import { SidebarHeading } from "@/ui/semantic-board-canvas/components/SemanticSidebarParts";
import { groupLabel, type GroupNames } from "@/ui/semantic-board-canvas/lib/groups";

/** Inputs for one definition row. */
interface RowProps {
	/** What the value is. */
	label: string;
	/** The value. */
	value: string;
	/** The contract's name for the field, when a reader may want to select on it. */
	field?: string | undefined;
}

/**
 * One row of the definition grid: a muted label, then the value in the mono
 * face, carrying its full text as a title so a truncated path is still readable.
 * @param props The row.
 * @returns A definition pair.
 */
function Row(props: RowProps): JSX.Element {
	return (
		<>
			<dt className="text-muted-foreground text-body truncate">{props.label}</dt>
			<dd
				title={props.value}
				data-field={props.field}
				className="text-technical truncate text-right font-mono"
			>
				{props.value}
			</dd>
		</>
	);
}

/** Inputs for a section wrapper. */
interface SectionProps {
	/** Its heading. */
	title: string;
	/** Its body. */
	children: ReactNode;
}

/**
 * One section of the inspector, under a one-pixel rule, headed the way every
 * section of the sidebar is.
 * @param props The heading and the body.
 * @returns The section.
 */
function Section(props: SectionProps): JSX.Element {
	return (
		<div className="border-border flex flex-col gap-2 border-t px-4 py-4">
			<SidebarHeading level={3}>{props.title}</SidebarHeading>
			{props.children}
		</div>
	);
}

/** Inputs for the title block. */
interface TitleProps {
	/** What the subject is called. */
	name: string;
	/** Its kind, as the badge says it. */
	kind: string;
	/** Its stable id. */
	id: string;
	/** The one line it is responsible for, when it has one. */
	responsibility?: string | undefined;
}

/**
 * The title block: the name, the kind beside it, the id under it, and the one
 * line it is responsible for.
 * @param props The name, kind, id and responsibility.
 * @returns The title block.
 */
function TitleBlock(props: TitleProps): JSX.Element {
	return (
		<div className="flex flex-col gap-1 px-4 py-4">
			<div className="flex items-center justify-between gap-2">
				<h2 className="text-title truncate" title={props.name}>
					{props.name}
				</h2>
				<Badge variant="outline" size="technical" className="shrink-0 uppercase">
					{props.kind}
				</Badge>
			</div>
			<p className="text-technical text-muted-foreground truncate font-mono" title={props.id}>
				{props.id}
			</p>
			{props.responsibility !== undefined && (
				<p className="text-body pt-1">{props.responsibility}</p>
			)}
		</div>
	);
}

/** Inputs for the description body. */
interface DescribedProps {
	/** The longer explanation, when one was written. */
	text: string | undefined;
}

/**
 * The longer explanation, which is deliberately not drawn on the card.
 *
 * Nothing at all when nobody wrote one — its own heading included, which is why
 * the section is in here rather than around each call. A line reporting the
 * absence of a description is a line a reader has to read to learn that there is
 * nothing to read, and a heading over it is the same line twice.
 * @param props The description, when there is one.
 * @returns The section, or nothing.
 */
function Described(props: DescribedProps): JSX.Element | null {
	if (props.text === undefined) {
		return null;
	}
	return (
		<Section title="Description">
			<p className="text-body whitespace-pre-line" data-slot="semantic-inspector-description">
				{props.text}
			</p>
		</Section>
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
 * One group the node belongs to, as the control that selects its members.
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
			size="sm"
			disabled={controls.onChoose === undefined}
			data-slot="semantic-inspector-group"
			data-group={group}
			data-configured={configured}
			title={
				configured
					? `Select every part in ${groupLabel(group, controls.names)}`
					: `${group} is not configured`
			}
			className="gap-2"
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

/** Inputs for the memberships section. */
interface MembershipsProps {
	/** The groups the node belongs to, as the board spells them. */
	groups: readonly string[] | undefined;
	/** The controls the panel was given. */
	controls: GroupControls;
}

/**
 * What the node belongs to, each membership as a control that selects the
 * group's members: how a reader sees the rest of it across whatever contains
 * each part.
 * @param props The memberships and the controls.
 * @returns The section, or nothing for a node in no group.
 */
function Memberships(props: MembershipsProps): JSX.Element | null {
	const groups = props.groups ?? [];
	if (groups.length === 0) {
		return null;
	}
	return (
		<Section title="Belongs to">
			<div className="flex flex-wrap gap-1.5" data-slot="semantic-inspector-groups">
				{groups.map((group) => (
					<Membership key={group} group={group} controls={props.controls} />
				))}
			</div>
		</Section>
	);
}

export { Described, Memberships, Row, Section, TitleBlock, type GroupControls };
