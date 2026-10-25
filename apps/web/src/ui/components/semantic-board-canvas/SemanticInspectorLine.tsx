// What the inspector says about a line of the overview that joins several
// relationships (ADR 0052).
//
// The line keeps the id of the first relationship it joins, so a comparison
// marks it. Read by that id alone, the panel would describe one relationship,
// with ends the picture does not draw, as the line on screen. The line is its
// drawn ends, its title, and every relationship it joins.

import type { JSX, ReactNode } from "react";

import { RelationshipChip } from "#ui/components/semantic-board-canvas/KindMarks.tsx";
import { SubjectTitle } from "#ui/components/semantic-board-canvas/SemanticInspectorParts.tsx";
import {
	SidebarLabel,
	SidebarMeta,
	SidebarRegion,
	SidebarRow,
	SidebarSection,
} from "#ui/components/semantic-board-canvas/SemanticSidebarParts.tsx";
import type { EdgeSubject } from "#ui/rules/semantic-board-canvas/board/board-document.ts";
import { endsOf, type LineSubject } from "#ui/rules/semantic-board-canvas/board/overview-line.ts";
import type { KindLook } from "#ui/rules/semantic-board-canvas/board/kind-look.ts";

/** Inputs for the line body. */
interface LineBodyProps {
	/** The joined line, with its drawn ends and what it joins. */
	subject: LineSubject;
	/** How the vault's kinds look, for each kind. */
	look: KindLook;
	/** Where it stands, set between what it is and what it joins. */
	children: ReactNode;
}

/**
 * Everything the board says about one joined line.
 * @param props The line.
 * @returns The body.
 */
function LineBody(props: LineBodyProps): JSX.Element {
	const { line, from, to, joins } = props.subject;
	return (
		<>
			<SidebarRegion slot="semantic-inspector-about">
				<SubjectTitle name={endsOf(from, to, line)}>
					<RelationshipChip look={props.look} kind={line.kind} />
				</SubjectTitle>
			</SidebarRegion>
			{props.children}
			<SidebarRegion slot="semantic-inspector-wiring">
				<SidebarSection title="Joins" slot="semantic-inspector-joins" level={3}>
					<ul className="flex flex-col">
						{joins.map((joined) => (
							<Joined key={joined.edge.id} joined={joined} look={props.look} />
						))}
					</ul>
				</SidebarSection>
			</SidebarRegion>
		</>
	);
}

/**
 * One relationship a line joins: what it carries, the ends it was stated
 * between, and its kind.
 * @param props The relationship and how kinds look.
 * @param props.joined The relationship, with the nodes at its ends.
 * @param props.look How the vault's kinds look.
 * @returns The row.
 */
function Joined(props: { readonly joined: EdgeSubject; readonly look: KindLook }): JSX.Element {
	const { edge, from, to } = props.joined;
	const ends = endsOf(from, to, edge);
	return (
		<SidebarRow as="li" data-slot="semantic-inspector-joined" data-edge={edge.id}>
			<SidebarLabel>
				{edge.label ?? ends}
				{edge.label !== undefined && <SidebarMeta>{ends}</SidebarMeta>}
			</SidebarLabel>
			<span className="flex h-[18px] shrink-0 items-center">
				<RelationshipChip look={props.look} kind={edge.kind} />
			</span>
		</SidebarRow>
	);
}

export { LineBody };
