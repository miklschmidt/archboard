// The inspector's own small vocabulary: a heading, a definition row, a section,
// a title block, a description, and the one way names are joined for reading.
//
// These carry no knowledge of what a semantic board is. They are the shapes the
// panel is built out of, kept together so that a section looks the same
// whichever sort of subject is being explained — a node, a relationship, an
// exchange or one message of one — and so that the panel itself is about what
// the board says rather than about padding and type scales.

import { useCallback, type JSX, type ReactNode } from "react";

import { Button } from "@/ui/components/button";

import type { CodeBinding } from "@/shared/code-target";
import type { SemanticNode } from "@/shared/semantic-board/index";
import { Badge } from "@/ui/components/badge";

/** Inputs for a section heading. */
interface SectionLabelProps {
	/** The heading. */
	children: string;
}

/**
 * A section heading in the kicker role: small, uppercase, muted.
 * @param props The heading text.
 * @returns The heading.
 */
function SectionLabel(props: SectionLabelProps): JSX.Element {
	return <h3 className="text-kicker text-muted-foreground uppercase">{props.children}</h3>;
}

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
 * One section of the inspector, under a one-pixel rule.
 * @param props The heading and the body.
 * @returns The section.
 */
function Section(props: SectionProps): JSX.Element {
	return (
		<div className="border-border flex flex-col gap-3 border-t px-4 py-4">
			<SectionLabel>{props.title}</SectionLabel>
			{props.children}
		</div>
	);
}

/** Inputs for the binding rows. */
interface BindingProps {
	/** The node's primary code binding, when it has one. */
	binding: CodeBinding | undefined;
	/**
	 * Open the code this node is bound to, when the shell around the pane can.
	 *
	 * Optional because the pane is a picture of an architecture and knows
	 * nothing about opening an editor: whether code can be opened at all is the
	 * shell's business, and a control that did nothing would be worse than no
	 * control. Absent means no control is drawn.
	 */
	onOpenCode?: ((binding: CodeBinding) => void) | undefined;
}

/**
 * Where the selected node's code is.
 *
 * A node with no binding is not a node with an empty one. Architecture is
 * not bound to anything, which is a fact about the board and not about the
 * work: a part may be implemented and simply not bound yet, so this says what
 * is missing rather than guessing why. The repository is
 * shown on every bound node rather than only where it differs, because two
 * nodes side by side may name two different repositories and a reader has no
 * other way to tell.
 * @param props The binding, when there is one.
 * @returns The rows, or the sentence that says there are none.
 */
function BindingBody(props: BindingProps): JSX.Element {
	const { binding } = props;
	if (binding === undefined) {
		return (
			<p className="text-muted-foreground text-body" data-slot="semantic-inspector-unbound">
				No code binding.
			</p>
		);
	}
	return (
		<>
			<dl
				className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2.5"
				data-slot="semantic-inspector-binding"
			>
				<Row label="repo" value={binding.repo} />
				<Row label="path" value={binding.path} />
				{binding.branch !== undefined && <Row label="branch" value={binding.branch} />}
				{binding.commit !== undefined && <Row label="commit" value={binding.commit} />}
				{binding.confirmedAt !== undefined && <Row label="confirmed" value={binding.confirmedAt} />}
			</dl>
			{props.onOpenCode !== undefined && (
				<OpenCode binding={binding} onOpenCode={props.onOpenCode} />
			)}
		</>
	);
}

/** Inputs for the control that opens a node's code. */
interface OpenCodeProps {
	binding: CodeBinding;
	/**
	 * Open this binding.
	 * @param binding Where the code is.
	 */
	onOpenCode: (binding: CodeBinding) => void;
}

/**
 * The control that opens the code a node is bound to.
 * @param props The binding and what to do with it.
 * @returns The control.
 */
function OpenCode(props: OpenCodeProps): JSX.Element {
	const { binding, onOpenCode } = props;
	const open = useCallback((): void => {
		onOpenCode(binding);
	}, [binding, onOpenCode]);
	return (
		<Button
			type="button"
			variant="secondary"
			size="sm"
			// A path is as long as somebody's directories, and the panel is as wide
			// as the panel: the label says what it opens and gives way at the end,
			// the way the path row above it does. Unbounded, it ran out of the
			// button and out of the pane.
			className="mt-3 flex w-full min-w-0 justify-start"
			title={`Open ${binding.path}`}
			data-slot="semantic-inspector-open-code"
			onClick={open}
		>
			<span className="truncate">Open {binding.path}</span>
		</Button>
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
	/** What it belongs to, when the board says. */
	group?: string | undefined;
}

/**
 * The title block: the name, the kind beside it, the id under it, what it
 * belongs to when it belongs to anything, and the one line it is responsible
 * for.
 *
 * The group is words here because the picture says it in colour, and a colour
 * is not a name: a reader who can see that two cards are the same family still
 * cannot tell what the family is called, and two families can land on one hue.
 * @param props The name, kind, id, group and responsibility.
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
			{props.group !== undefined && (
				<p className="text-body text-muted-foreground pt-1" data-slot="semantic-inspector-group">
					Part of {props.group}
				</p>
			)}
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

/**
 * The names of some nodes, in the order the board holds them.
 * @param nodes The nodes.
 * @returns Their names, joined for reading.
 */
function namesOf(nodes: readonly SemanticNode[]): string {
	return nodes.map((node) => node.name).join(", ");
}

export { BindingBody, Described, OpenCode, Row, Section, SectionLabel, TitleBlock, namesOf };
