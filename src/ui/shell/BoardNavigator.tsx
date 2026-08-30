import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { MountedBoardPreviewScene, PreviewTheme } from "../board-preview";
import type { BoardIdentity, BoardListing } from "../types";
import { BoardPreviewCard, type BoardPreviewTarget } from "./BoardPreviewCard";
import { Icon } from "./Icons";

interface BoardNavigatorProps {
	listing: BoardListing | null;
	error: string | null;
	currentKey: string | null;
	theme: PreviewTheme;
	readMountedPreview: (board: string) => MountedBoardPreviewScene | null;
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

interface PreviewDisclosure extends BoardPreviewTarget {
	pinned: boolean;
}

interface FocusScrollProtection {
	key: string;
	expiresAfterFrame: number;
}

const entryLabel = (entry: BoardEntry): string =>
	entry.identity.board === "scratch"
		? "Scratch board"
		: `${entry.identity.board} · ${entry.identity.variant === "current" ? "Current" : entry.identity.variant}`;

const scrollsList = (key: string): boolean =>
	key === "ArrowDown" ||
	key === "ArrowUp" ||
	key === "PageDown" ||
	key === "PageUp" ||
	key === "Home" ||
	key === "End" ||
	key === " ";

export function BoardNavigator({
	listing,
	error,
	currentKey,
	theme,
	readMountedPreview,
	busy,
	onSelect,
	onRefresh,
	onNew,
	needsName,
	onName,
}: BoardNavigatorProps): React.JSX.Element {
	const navRef = useRef<HTMLElement | null>(null);
	const focusScrollProtectionRef = useRef<FocusScrollProtection | null>(null);
	const [preview, setPreview] = useState<PreviewDisclosure | null>(null);
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

		const groupPriority = (variants: BoardEntry[]): number => {
			if (variants.some((entry) => entry.key === currentKey)) return 0;
			if (variants.some((entry) => entry.onScreen)) return 1;
			return 2;
		};
		const allGroups = [...grouped.entries()]
			.toSorted(([a, aVariants], [b, bVariants]) => {
				const priority = groupPriority(aVariants) - groupPriority(bVariants);
				return priority || a.localeCompare(b);
			})
			.map(([board, variants]) => ({
				board,
				variants: variants.toSorted((a, b) => {
					if (a.key === currentKey) return -1;
					if (b.key === currentKey) return 1;
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
	}, [listing, currentKey]);

	const variantCount = groups.reduce((count, group) => count + group.variants.length, 0);
	const renderedCurrentKey = groups.some((group) =>
		group.variants.some((entry) => entry.key === currentKey),
	)
		? currentKey
		: scratch?.key === currentKey
			? currentKey
			: null;
	const currentRowRef = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		const row = currentRowRef.current;
		if (row?.dataset.boardKey === renderedCurrentKey) {
			row.scrollIntoView({ block: "nearest", inline: "nearest" });
		}
	}, [renderedCurrentKey]);
	const entriesByKey = useMemo(
		() =>
			new Map(
				[...groups.flatMap((group) => group.variants), ...(scratch ? [scratch] : [])].map(
					(entry) => [entry.key, entry],
				),
			),
		[groups, scratch],
	);
	const visiblePreview = preview && entriesByKey.has(preview.key) ? preview : null;
	useEffect(() => {
		if (!preview) return;
		const close = (event: KeyboardEvent): void => {
			if (event.key === "Escape") setPreview(null);
		};
		window.addEventListener("keydown", close);
		return () => window.removeEventListener("keydown", close);
	}, [preview]);

	const disclosure = useCallback((entry: BoardEntry, anchor: HTMLElement): PreviewDisclosure => {
		const navRect = navRef.current?.getBoundingClientRect();
		const anchorRect = anchor.getBoundingClientRect();
		const top = navRect
			? Math.max(8, Math.min(anchorRect.top - navRect.top - 8, navRect.height - 230))
			: 8;
		return { key: entry.key, label: entryLabel(entry), top, pinned: false };
	}, []);
	const reveal = useCallback(
		(entry: BoardEntry, anchor: HTMLElement): void => {
			const next = disclosure(entry, anchor);
			setPreview((previous) =>
				previous?.key === next.key && previous.top === next.top ? previous : next,
			);
		},
		[disclosure],
	);
	const conceal = useCallback((key: string): void => {
		setPreview((previous) => (previous?.key === key && !previous.pinned ? null : previous));
	}, []);
	const togglePinned = useCallback(
		(entry: BoardEntry, anchor: HTMLElement): void => {
			const next = disclosure(entry, anchor);
			setPreview((previous) =>
				previous?.key === next.key && previous.pinned ? null : { ...next, pinned: true },
			);
		},
		[disclosure],
	);
	const selectEntry = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>): void => {
			const key = event.currentTarget.dataset.boardKey;
			if (!key) return;
			setPreview(null);
			onSelect(key);
		},
		[onSelect],
	);
	const handlePreviewControlClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>): void => {
			const key = event.currentTarget.dataset.previewKey;
			const entry = key ? entriesByKey.get(key) : null;
			if (entry) togglePinned(entry, event.currentTarget);
		},
		[entriesByKey, togglePinned],
	);
	const cancelFocusScrollProtection = useCallback(() => {
		const protection = focusScrollProtectionRef.current;
		if (protection) cancelAnimationFrame(protection.expiresAfterFrame);
		focusScrollProtectionRef.current = null;
	}, []);
	const protectFocusScroll = useCallback((key: string) => {
		const previous = focusScrollProtectionRef.current;
		if (previous) cancelAnimationFrame(previous.expiresAfterFrame);
		const protection: FocusScrollProtection = { key, expiresAfterFrame: 0 };
		focusScrollProtectionRef.current = protection;
		protection.expiresAfterFrame = requestAnimationFrame(() => {
			if (focusScrollProtectionRef.current === protection) {
				focusScrollProtectionRef.current = null;
			}
		});
	}, []);
	useEffect(() => cancelFocusScrollProtection, [cancelFocusScrollProtection]);
	const handleListKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (scrollsList(event.key)) cancelFocusScrollProtection();
		},
		[cancelFocusScrollProtection],
	);
	const handleListScroll = useCallback(() => {
		const followsFocus = focusScrollProtectionRef.current?.key !== undefined;
		setPreview((previous) => (followsFocus || previous?.pinned ? previous : null));
	}, []);

	const previewEvents = (entry: BoardEntry) => ({
		onPointerEnter: (event: React.PointerEvent<HTMLElement>) => reveal(entry, event.currentTarget),
		onPointerLeave: () => conceal(entry.key),
		onFocus: (event: React.FocusEvent<HTMLElement>) => {
			protectFocusScroll(entry.key);
			reveal(entry, event.currentTarget);
		},
		onBlur: () => conceal(entry.key),
	});
	const previewControl = (entry: BoardEntry): React.JSX.Element => (
		<button
			className="board-preview-control"
			type="button"
			aria-label={`Preview ${entryLabel(entry)}`}
			aria-expanded={visiblePreview?.key === entry.key}
			data-preview-key={entry.key}
			onClick={handlePreviewControlClick}
			{...previewEvents(entry)}
		>
			<Icon name="preview" size={18} />
		</button>
	);

	return (
		<aside className="board-nav" aria-label="Boards and variants" ref={navRef}>
			<div className="board-nav-header">
				<div className="board-nav-title">
					<span>Boards</span>
					{listing && (
						<small
							aria-label={`${groups.length} board${groups.length === 1 ? "" : "s"}, ${variantCount} variant${variantCount === 1 ? "" : "s"}`}
						>
							{groups.length}B / {variantCount}V
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
						disabled={busy}
					>
						<Icon name="refresh" size={16} />
					</button>
					<button
						className="icon-btn"
						type="button"
						onClick={onNew}
						title="New board"
						aria-label="New board"
						disabled={busy}
					>
						<Icon name="plus" size={17} />
					</button>
				</div>
			</div>

			<div
				className="board-nav-list"
				onKeyDownCapture={handleListKeyDown}
				onPointerDownCapture={cancelFocusScrollProtection}
				onScroll={handleListScroll}
				onWheelCapture={cancelFocusScrollProtection}
			>
				{!listing && !error && <div className="board-nav-empty">Reading the vault…</div>}
				{error && (
					<button
						className="board-nav-error"
						type="button"
						onClick={onRefresh}
						aria-label="Retry board listing"
						disabled={busy}
					>
						Could not read the vault. Try again.
					</button>
				)}
				{listing && groups.length === 0 && (
					<div className="board-nav-empty">No named boards yet.</div>
				)}
				{groups.map((group) => {
					const defaultEntry = group.variants[0];
					return (
						<section
							className={`board-group${group.variants.some((entry) => entry.key === currentKey) ? " active-group" : ""}`}
							key={group.board}
							aria-label={group.board}
						>
							<div className="board-group-name" title={group.board}>
								{defaultEntry && previewControl(defaultEntry)}
								<span className="board-group-copy">
									<strong>{group.board}</strong>
									<small>
										{group.variants[0]?.identity.level ?? "board"} · {group.variants.length} variant
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
											ref={selected ? currentRowRef : undefined}
											onClick={selectEntry}
											data-board-key={entry.key}
											title={`${entry.key}${entry.onScreen ? " · on canvas" : entry.open ? " · open" : ""}`}
											{...previewEvents(entry)}
										>
											<span className="board-nav-variant">{label}</span>
											<span className="board-nav-markers">
												{entry.onScreen ? (
													<span className="board-nav-level board-nav-on-screen">on canvas</span>
												) : (
													entry.open && <span className="board-nav-level board-nav-open">open</span>
												)}
												{!entry.inVault && <span className="board-nav-state">draft</span>}
											</span>
										</button>
									);
								})}
							</div>
						</section>
					);
				})}
			</div>

			{(scratch || needsName) && (
				<section className="board-group scratch-section" aria-label="scratch">
					<span className="board-group-name board-group-name-hidden">scratch</span>
					<div className="scratch-card">
						<div className="scratch-entry">
							<button
								type="button"
								className={`board-nav-row scratch-top${scratch?.key === currentKey ? " board-nav-row-current" : ""}`}
								disabled={busy || !scratch}
								aria-current={scratch?.key === currentKey ? "page" : undefined}
								ref={scratch?.key === currentKey ? currentRowRef : undefined}
								onClick={selectEntry}
								data-board-key={scratch?.key}
								{...(scratch ? previewEvents(scratch) : {})}
							>
								<span className="board-group-copy">
									<strong>Scratch board</strong>
									<small>Unfiled draft</small>
								</span>
							</button>
							{scratch && previewControl(scratch)}
						</div>
						{needsName && (
							<button className="name-button" type="button" onClick={onName} disabled={busy}>
								Name this board
							</button>
						)}
					</div>
				</section>
			)}
			<BoardPreviewCard
				target={visiblePreview}
				theme={theme}
				readMountedPreview={readMountedPreview}
			/>
		</aside>
	);
}
