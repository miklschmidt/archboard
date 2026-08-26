import React, { useCallback, useMemo } from "react";
import type { BoardIdentity, BoardListing } from "../types";
import { Icon } from "./Icons";

interface BoardNavigatorProps {
	listing: BoardListing | null;
	error: string | null;
	currentKey: string | null;
	busy: boolean;
	onSelect: (key: string) => void;
	onRefresh: () => void;
	onNew: () => void;
	needsName: boolean;
	onName: () => void;
}

interface BoardEntry {
	key: string;
	identity: BoardIdentity;
	onScreen: boolean;
	open: boolean;
	inVault: boolean;
}

export function BoardNavigator({
	listing,
	error,
	currentKey,
	busy,
	onSelect,
	onRefresh,
	onNew,
	needsName,
	onName,
}: BoardNavigatorProps): React.JSX.Element {
	const { groups, scratch } = useMemo(() => {
		if (!listing) return { groups: [], scratch: null };
		const inVault = new Set(listing.boards.map((entry) => entry.key));
		const open = new Set(listing.open.map((entry) => entry.key));
		const onScreen = new Set(listing.onScreen.map((entry) => entry.board));
		const entries = new Map<string, BoardEntry>();

		for (const entry of [...listing.boards, ...listing.open]) {
			entries.set(entry.key, {
				key: entry.key,
				identity: entry.identity,
				onScreen: onScreen.has(entry.key),
				open: open.has(entry.key),
				inVault: inVault.has(entry.key),
			});
		}

		const grouped = new Map<string, BoardEntry[]>();
		for (const entry of entries.values()) {
			const list = grouped.get(entry.identity.board) ?? [];
			list.push(entry);
			grouped.set(entry.identity.board, list);
		}

		const allGroups = [...grouped.entries()]
			.toSorted(([a], [b]) => a.localeCompare(b))
			.map(([board, variants]) => ({
				board,
				variants: variants.toSorted((a, b) => {
					if (a.identity.variant === "current") return -1;
					if (b.identity.variant === "current") return 1;
					return a.identity.variant.localeCompare(b.identity.variant);
				}),
			}));
		const scratchGroup = allGroups.find((group) => group.board === "scratch") ?? null;
		return {
			groups: allGroups.filter((group) => group.board !== "scratch"),
			scratch: scratchGroup?.variants[0] ?? null,
		};
	}, [listing]);
	const selectEntry = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>): void => {
			const key = event.currentTarget.dataset.boardKey;
			if (key) onSelect(key);
		},
		[onSelect],
	);
	const selectScratch = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>): void => {
			const key = event.currentTarget.dataset.boardKey;
			if (key) onSelect(key);
		},
		[onSelect],
	);

	return (
		<aside className="board-nav" aria-label="Boards and variants">
			<div className="board-nav-header">
				<div className="board-nav-title">
					<span>Board atlas</span>
					{listing && (
						<small>
							{groups.length} boards / {listing.boards.length} variants
						</small>
					)}
				</div>
				<div className="board-nav-tools">
					<button
						className="icon-btn"
						type="button"
						onClick={onRefresh}
						title="Refresh boards"
						aria-label="Refresh boards"
					>
						<Icon name="refresh" size={16} />
					</button>
					<button
						className="icon-btn"
						type="button"
						onClick={onNew}
						title="New board"
						aria-label="New board"
					>
						<Icon name="plus" size={17} />
					</button>
				</div>
			</div>

			<div className="board-nav-list">
				{!listing && !error && <div className="board-nav-empty">Reading the vault…</div>}
				{error && (
					<button className="board-nav-error" type="button" onClick={onRefresh}>
						Could not read the vault. Try again.
					</button>
				)}
				{listing && groups.length === 0 && (
					<div className="board-nav-empty">No named boards yet.</div>
				)}
				{groups.map((group) => (
					<section
						className={`board-group${group.variants.some((entry) => entry.key === currentKey) ? " active-group" : ""}`}
						key={group.board}
						aria-label={group.board}
					>
						<div className="board-group-name">
							<span className="board-glyph">{group.board.slice(0, 2).toUpperCase()}</span>
							<span className="board-group-copy">
								<strong>{group.board}</strong>
								<small>
									{group.variants[0]?.identity.level ?? "board"} / {group.variants.length} variant
									{group.variants.length === 1 ? "" : "s"}
								</small>
							</span>
						</div>
						<div className="board-variants">
							{group.variants.map((entry) => {
								const selected = entry.key === currentKey;
								const label =
									entry.identity.variant === "current" ? "Current" : entry.identity.variant;
								return (
									<button
										type="button"
										className={`board-nav-row${selected ? " board-nav-row-current" : ""}`}
										key={entry.key}
										disabled={busy}
										aria-current={selected ? "page" : undefined}
										onClick={selectEntry}
										data-board-key={entry.key}
										title={`${entry.key}${entry.onScreen ? " · on screen" : entry.open ? " · open" : ""}`}
									>
										<span className="board-nav-variant">{label}</span>
										{entry.onScreen && <span className="board-nav-level">on canvas</span>}
										{!entry.inVault && <span className="board-nav-state">draft</span>}
									</button>
								);
							})}
						</div>
					</section>
				))}
			</div>

			{(scratch || needsName) && (
				<section className="board-group scratch-section" aria-label="scratch">
					<span className="board-group-name board-group-name-hidden">scratch</span>
					<div className="scratch-card">
						<button
							type="button"
							className={`board-nav-row scratch-top${scratch?.key === currentKey ? " board-nav-row-current" : ""}`}
							disabled={busy || !scratch}
							aria-current={scratch?.key === currentKey ? "page" : undefined}
							onClick={selectScratch}
							data-board-key={scratch?.key}
						>
							<span className="board-glyph">SC</span>
							<span className="board-group-copy">
								<strong>Scratch board</strong>
								<small>Unfiled draft</small>
							</span>
						</button>
						{needsName && (
							<button className="name-button" type="button" onClick={onName} disabled={busy}>
								Name this board
							</button>
						)}
					</div>
				</section>
			)}
		</aside>
	);
}
