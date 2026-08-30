import React, { useCallback, useId, useState } from "react";

import type { SelectionProjection } from "./index.js";

interface SelectionInspectorProps {
	readonly paneLabel: string;
	readonly boardKey: string | null;
	readonly selection: SelectionProjection;
	readonly onOpenCode: (board: string, element: string) => void;
}

const METADATA_LABELS = {
	node: "Node",
	kind: "Kind",
	name: "Name",
	variant: "Variant",
	level: "Level",
} as const;

function EmptyState({ selection }: { selection: SelectionProjection }): React.JSX.Element {
	if (selection.state === "multiple") {
		return (
			<div className="selection-inspector-empty" data-selection-state="multiple">
				<strong>{selection.count} elements selected</strong>
				<span>Select one element to inspect it.</span>
			</div>
		);
	}
	if (selection.state === "missing") {
		return (
			<div className="selection-inspector-empty" data-selection-state="missing">
				<strong>Selection disappeared</strong>
				<span>The selected element is no longer on this board.</span>
			</div>
		);
	}
	return (
		<div className="selection-inspector-empty" data-selection-state="empty">
			<strong>No selection</strong>
			<span>Select one element to inspect its architecture metadata and code binding.</span>
		</div>
	);
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
	return (
		<div className="selection-inspector-row">
			<dt>{label}</dt>
			<dd>
				<code>{value || "."}</code>
			</dd>
		</div>
	);
}

function status(selection: SelectionProjection): string {
	if (selection.state === "bound") return "Bound";
	if (selection.state === "unbound") return "Not bound";
	if (selection.state === "malformed") return "Binding unavailable";
	if (selection.state === "multiple") return `${selection.count} selected`;
	if (selection.state === "missing") return "Disappeared";
	return "No selection";
}

export function SelectionInspector({
	paneLabel,
	boardKey,
	selection,
	onOpenCode,
}: SelectionInspectorProps): React.JSX.Element {
	const [expanded, setExpanded] = useState(false);
	const bodyId = useId();
	const selected =
		selection.state === "bound" || selection.state === "unbound" || selection.state === "malformed"
			? selection
			: null;
	const openCode = useCallback((): void => {
		if (selection.state === "bound" && boardKey) onOpenCode(boardKey, selection.element.id);
	}, [boardKey, onOpenCode, selection]);
	const toggleExpanded = useCallback((): void => {
		setExpanded((value) => !value);
	}, []);

	return (
		<aside
			className={`selection-inspector${expanded ? " selection-inspector-expanded" : ""}`}
			aria-label={`${paneLabel} selection inspector`}
			data-selection-state={selection.state}
		>
			<header className="selection-inspector-header">
				<div>
					<span className="selection-inspector-kicker">Selection</span>
					<span
						className={`selection-inspector-status selection-inspector-status-${selection.state}`}
					>
						{status(selection)}
					</span>
				</div>
				<span className="selection-inspector-pane">{paneLabel}</span>
				<button
					type="button"
					className="selection-inspector-disclosure"
					aria-expanded={expanded}
					aria-controls={bodyId}
					onClick={toggleExpanded}
				>
					{expanded ? "Hide details" : "Show details"}
				</button>
			</header>

			<div className="selection-inspector-body" id={bodyId}>
				{!selected ? (
					<EmptyState selection={selection} />
				) : (
					<>
						<section className="selection-inspector-section" aria-labelledby="selection-identity">
							<h2 id="selection-identity">Element</h2>
							<dl>
								<Row label="ID" value={selected.element.id} />
								<Row label="Type" value={selected.element.type} />
							</dl>
						</section>

						<section className="selection-inspector-section" aria-labelledby="selection-metadata">
							<h2 id="selection-metadata">Archboard metadata</h2>
							{Object.keys(selected.element.metadata).length > 0 ? (
								<dl>
									{Object.entries(METADATA_LABELS).map(([key, label]) => {
										const value = selected.element.metadata[key as keyof typeof METADATA_LABELS];
										return value === undefined ? null : (
											<Row key={key} label={label} value={value} />
										);
									})}
								</dl>
							) : (
								<p className="selection-inspector-copy">No Archboard metadata.</p>
							)}
						</section>

						<section className="selection-inspector-section" aria-labelledby="selection-binding">
							<h2 id="selection-binding">Code binding</h2>
							{selection.state === "bound" ? (
								<>
									<dl>
										<Row label="Repository" value={selection.binding.repo} />
										<Row label="Path" value={selection.binding.path} />
										{selection.binding.branch && (
											<Row label="Branch" value={selection.binding.branch} />
										)}
										{selection.binding.commit && (
											<Row label="Commit" value={selection.binding.commit} />
										)}
										{selection.binding.confirmedAt && (
											<Row label="Confirmed" value={selection.binding.confirmedAt} />
										)}
									</dl>
									<button
										type="button"
										className="selection-inspector-open"
										onClick={openCode}
										disabled={!boardKey}
									>
										Open code
									</button>
								</>
							) : (
								<div
									className={`selection-inspector-binding-state selection-inspector-binding-${selection.state}`}
								>
									<strong>
										{selection.state === "unbound" ? "Not bound" : "Binding unavailable"}
									</strong>
									<span>
										{selection.state === "unbound"
											? "This element has no code address."
											: "The stored binding is not a valid portable code address."}
									</span>
								</div>
							)}
						</section>
					</>
				)}
			</div>
		</aside>
	);
}
