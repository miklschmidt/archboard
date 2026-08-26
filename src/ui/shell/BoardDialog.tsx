// Opening a board or a variant, and starting a new one.
//
// Addressing follows the vault's, not a UI of its own: `current` is the
// privileged variant and owns the bare name, so it is offered as the default
// and everything else is `name@variant`. Level is a controlled vocabulary that
// is allowed to grow, so the field suggests the tiers we have but does not
// refuse a new one.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { fetchBoards } from "../canvas/api";
import type { BoardIdentity, BoardListing } from "../types";

export type BoardDialogMode = "open" | "new" | "save-as";

const LEVELS = ["system", "service", "module"];

/** How the vault will address this board — `current` owns the bare name. */
const address = (name: string, variant: string): string => {
	const board = name.trim() || "board";
	const chosen = variant.trim();
	return !chosen || chosen === "current" ? board : `${board}@${chosen}`;
};

interface BoardDialogProps {
	mode: BoardDialogMode;
	/** The board in the pane being worked in, to seed "another variant of this". */
	current: BoardIdentity | null;
	/**
	 * The panes a board can be opened into. Offered as a choice only when there
	 * is more than one — with a split on screen, which half a board lands in is
	 * the human's call, and the canvas refuses to pick one for them.
	 */
	panes?: Array<{ clientId: string; label: string; board: string | null }>;
	/** The pane to offer first: the one being worked in. */
	defaultPane?: string | null;
	busy?: boolean;
	error?: string | null;
	onSubmit: (address: { board: string; variant?: string; level?: string; pane?: string }) => void;
	onCancel: () => void;
}

const TITLES: Record<BoardDialogMode, string> = {
	open: "Open a board",
	new: "New board",
	"save-as": "Save this board as",
};

export function BoardDialog({
	mode,
	current,
	panes = [],
	defaultPane,
	busy,
	error,
	onSubmit,
	onCancel,
}: BoardDialogProps): React.JSX.Element {
	const [listing, setListing] = useState<BoardListing | null>(null);
	const [listError, setListError] = useState<string | null>(null);
	const [filter, setFilter] = useState("");
	const [name, setName] = useState(mode === "open" ? "" : (current?.board ?? ""));
	const [variant, setVariant] = useState("current");
	const [level, setLevel] = useState(current?.level ?? "");
	// Only ever asked about when it could be wrong: one pane, no question.
	const asksForPane = mode !== "save-as" && panes.length > 1;
	const [pane, setPane] = useState(defaultPane ?? panes[0]?.clientId ?? "");

	useEffect(() => {
		if (mode !== "open") return;
		let live = true;
		fetchBoards()
			.then((result) => {
				if (live) setListing(result);
			})
			.catch((err: Error) => {
				if (live) setListError(err.message);
			});
		return () => {
			live = false;
		};
	}, [mode]);

	const entries = useMemo(() => {
		if (!listing) return [];
		const open = new Set(listing.open.map((entry) => entry.key));
		const keys = new Set<string>([
			...listing.boards.map((entry) => entry.key),
			...listing.open.map((entry) => entry.key),
		]);
		return [...keys]
			.toSorted()
			.filter((key) => key.toLowerCase().includes(filter.trim().toLowerCase()))
			.map((key) => ({
				key,
				open: open.has(key),
				onScreen: listing.onScreen.some((shown) => shown.board === key),
				inVault: listing.boards.some((entry) => entry.key === key),
			}));
	}, [listing, filter]);

	const intoPane = asksForPane && pane ? { pane } : {};

	const submitTyped = useCallback((): void => {
		const board = (mode === "open" ? filter : name).trim();
		if (!board) return;
		onSubmit(
			mode === "open"
				? { board, ...intoPane }
				: {
						board,
						variant: variant.trim() || "current",
						...(level.trim() ? { level: level.trim() } : {}),
						...intoPane,
					},
		);
	}, [filter, name, mode, onSubmit, pane, variant, level, intoPane]);
	const submitEntry = useCallback((event: React.MouseEvent<HTMLButtonElement>): void => {
		const board = event.currentTarget.dataset.boardKey;
		if (board) onSubmit({ board, ...intoPane });
	}, [intoPane, onSubmit]);
	const selectPane = useCallback((event: React.ChangeEvent<HTMLSelectElement>): void => setPane(event.target.value), []);
	const updateFilter = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => setFilter(event.target.value), []);
	const updateName = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => setName(event.target.value), []);
	const updateVariant = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => setVariant(event.target.value), []);
	const updateLevel = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => setLevel(event.target.value), []);
	const submitOnEnter = useCallback((event: React.KeyboardEvent<HTMLInputElement>): void => {
		if (event.key === "Enter") submitTyped();
	}, [submitTyped]);

	return (
		<Modal
			title={TITLES[mode]}
			onCancel={onCancel}
			wide={mode === "open"}
			footer={
				<>
					<button className="btn btn-quiet" onClick={onCancel} disabled={busy}>
						Cancel
					</button>
					<button className="btn btn-primary" onClick={submitTyped} disabled={busy}>
						{busy ? "Working…" : mode === "open" ? "Open" : mode === "new" ? "Create" : "Save"}
					</button>
				</>
			}
		>
			{error && <p className="notice notice-error">{error}</p>}

			{asksForPane && (
				<label className="field">
					<span>Into which pane</span>
					<select value={pane} onChange={selectPane}>
						{panes.map((entry) => (
							<option key={entry.clientId} value={entry.clientId}>
								{entry.label}
								{entry.board ? ` — showing ${entry.board}` : ""}
							</option>
						))}
					</select>
				</label>
			)}

			{mode === "open" ? (
				<>
					<label className="field">
						<span>Board address</span>
						<input
							data-autofocus
							value={filter}
							placeholder="payments, or payments@option-a"
							onChange={updateFilter}
							onKeyDown={submitOnEnter}
						/>
					</label>
					{listError && <p className="notice notice-error">{listError}</p>}
					{!listing && !listError && <p className="hint">Reading the vault…</p>}
					{listing && (
						<ul className="board-list">
							{entries.length === 0 && <li className="hint">Nothing in the vault matches.</li>}
							{entries.map((entry) => (
								<li key={entry.key}>
									<button
										className={`board-row${entry.onScreen ? " board-row-active" : ""}`}
										onClick={submitEntry}
										data-board-key={entry.key}
										disabled={busy}
									>
										<span className="board-row-key">{entry.key}</span>
										{entry.onScreen && <span className="chip chip-quiet">on screen</span>}
										{!entry.onScreen && entry.open && <span className="chip chip-quiet">open</span>}
										{!entry.inVault && <span className="chip chip-quiet">unsaved</span>}
									</button>
								</li>
							))}
						</ul>
					)}
					<p className="hint">Vault: {listing?.vault ?? "unknown"}</p>
				</>
			) : (
				<>
					<label className="field">
						<span>Name</span>
						<input
							data-autofocus
							value={name}
							placeholder="payments"
							onChange={updateName}
							onKeyDown={submitOnEnter}
						/>
					</label>
					<label className="field">
						<span>Variant</span>
						<input
							value={variant}
							placeholder="current"
							onChange={updateVariant}
							onKeyDown={submitOnEnter}
						/>
					</label>
					<label className="field">
						<span>Level</span>
						<input
							value={level}
							list="archboard-levels"
							placeholder="system, service, module…"
							onChange={updateLevel}
							onKeyDown={submitOnEnter}
						/>
						<datalist id="archboard-levels">
							{LEVELS.map((value) => (
								<option key={value} value={value} />
							))}
						</datalist>
					</label>
					<p className="hint">
						<code>current</code> is the architecture that exists and owns the bare name; every other
						variant is a proposal. This one is addressed <code>{address(name, variant)}</code>.
					</p>
				</>
			)}
		</Modal>
	);
}
