import React, { useCallback } from "react";

import type { PathFocusNoPathReason, PathFocusSnapshot } from "../path-focus/index.js";
import type { SelectionProjection } from "./index.js";

interface SelectionInspectorProps {
	readonly paneLabel: string;
	readonly boardKey: string | null;
	readonly selection: SelectionProjection;
	readonly pathFocus: PathFocusSnapshot;
	readonly onOpenCode: (board: string, element: string) => void;
	readonly onFocusPath: () => void;
	readonly onExitPathFocus: () => void;
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

function Row({
	label,
	value,
	technical = false,
}: {
	readonly label: string;
	readonly value: string;
	readonly technical?: boolean;
}): React.JSX.Element {
	return (
		<div className="selection-inspector-row">
			<dt>{label}</dt>
			<dd>
				{technical ? (
					<code className="selection-inspector-value selection-inspector-value-technical">
						{value || "."}
					</code>
				) : (
					<span className="selection-inspector-value selection-inspector-value-human">
						{value || "."}
					</span>
				)}
			</dd>
		</div>
	);
}

function selectionTitle(selection: SelectionProjection): string {
	if (
		selection.state === "bound" ||
		selection.state === "unbound" ||
		selection.state === "malformed"
	) {
		return (
			selection.element.metadata.name?.trim() ||
			selection.element.metadata.node?.trim() ||
			selection.element.id
		);
	}
	if (selection.state === "multiple") return `${selection.count} elements`;
	if (selection.state === "missing") return "Selection disappeared";
	return "No selection";
}

function status(selection: SelectionProjection): string {
	if (selection.state === "bound") return "Bound";
	if (selection.state === "unbound") return "Not bound";
	if (selection.state === "malformed") return "Binding unavailable";
	if (selection.state === "multiple") return `${selection.count} selected`;
	if (selection.state === "missing") return "Disappeared";
	return "No selection";
}

function noPathMessage(reason: PathFocusNoPathReason): string {
	if (reason === "broken") return "This arrow or bound label does not have two valid endpoints.";
	if (reason === "isolated") return "This element has no canonical arrow-bound path.";
	if (reason === "missing") return "The selected element is no longer on this board.";
	if (reason === "multiple") return "Select one element to focus its connected path.";
	return "Select one element to focus its connected path.";
}

function PathFocusSection({
	pathFocus,
	onFocus,
	onExit,
}: {
	readonly pathFocus: PathFocusSnapshot;
	readonly onFocus: () => void;
	readonly onExit: () => void;
}): React.JSX.Element {
	return (
		<section
			className="selection-inspector-section path-focus-section"
			aria-labelledby="path-focus"
		>
			<h2 id="path-focus">Architecture path</h2>
			{pathFocus.state === "inactive" ? (
				<>
					<p className="selection-inspector-copy">
						Dim everything outside this element's connected arrow path.
					</p>
					<button type="button" className="selection-inspector-focus" onClick={onFocus}>
						Focus path
					</button>
				</>
			) : pathFocus.state === "connected" ? (
				<output className="path-focus-state path-focus-connected" aria-live="polite">
					<strong>Path focused</strong>
					<span>
						{pathFocus.elementIds.length} connected element
						{pathFocus.elementIds.length === 1 ? "" : "s"} remain at full emphasis.
					</span>
					<button type="button" className="selection-inspector-exit" onClick={onExit}>
						Exit focus
					</button>
				</output>
			) : (
				<output
					className="path-focus-state path-focus-none"
					data-path-focus-reason={pathFocus.reason}
					aria-live="polite"
				>
					<strong>No connected path</strong>
					<span>{noPathMessage(pathFocus.reason)}</span>
					<button type="button" className="selection-inspector-exit" onClick={onExit}>
						Exit focus
					</button>
				</output>
			)}
		</section>
	);
}

export function SelectionInspector({
	paneLabel,
	boardKey,
	selection,
	pathFocus,
	onOpenCode,
	onFocusPath,
	onExitPathFocus,
}: SelectionInspectorProps): React.JSX.Element {
	const selected =
		selection.state === "bound" || selection.state === "unbound" || selection.state === "malformed"
			? selection
			: null;
	const openCode = useCallback((): void => {
		if (selection.state === "bound" && boardKey) onOpenCode(boardKey, selection.element.id);
	}, [boardKey, onOpenCode, selection]);

	return (
		<aside
			className="selection-inspector"
			aria-label={`${paneLabel} selection inspector`}
			data-selection-state={selection.state}
			data-path-focus-state={pathFocus.state}
		>
			<header className="selection-inspector-header">
				<div className="selection-inspector-summary">
					<div className="selection-inspector-context">
						<span className="selection-inspector-kicker">Selection</span>
						<span className="selection-inspector-pane">{paneLabel}</span>
					</div>
					<div className="selection-inspector-heading">
						<strong className="selection-inspector-title">{selectionTitle(selection)}</strong>
						{selected && (
							<span
								className={`selection-inspector-status selection-inspector-status-${selection.state}`}
							>
								{status(selection)}
							</span>
						)}
					</div>
				</div>
			</header>

			<div className="selection-inspector-body">
				{!selected ? (
					<>
						<EmptyState selection={selection} />
						{pathFocus.state !== "inactive" && (
							<PathFocusSection
								pathFocus={pathFocus}
								onFocus={onFocusPath}
								onExit={onExitPathFocus}
							/>
						)}
					</>
				) : (
					<>
						<PathFocusSection
							pathFocus={pathFocus}
							onFocus={onFocusPath}
							onExit={onExitPathFocus}
						/>

						<section className="selection-inspector-section" aria-labelledby="selection-binding">
							<h2 id="selection-binding">Code binding</h2>
							{selection.state === "bound" ? (
								<>
									<dl>
										<Row label="Repository" value={selection.binding.repo} technical />
										<Row label="Path" value={selection.binding.path} technical />
										{selection.binding.branch && (
											<Row label="Branch" value={selection.binding.branch} technical />
										)}
										{selection.binding.commit && (
											<Row label="Commit" value={selection.binding.commit} technical />
										)}
										{selection.binding.confirmedAt && (
											<Row label="Confirmed" value={selection.binding.confirmedAt} technical />
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

						<section className="selection-inspector-section" aria-labelledby="selection-identity">
							<h2 id="selection-identity">Element</h2>
							<dl>
								<Row label="ID" value={selected.element.id} technical />
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
					</>
				)}
			</div>
		</aside>
	);
}
