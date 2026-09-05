import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type { MountedBoardPreviewScene, PreviewTheme } from "../board-preview";
import type { BoardIdentity, BoardListing } from "../types";
import { BoardPreviewCard, type BoardPreviewTarget } from "./BoardPreviewCard";
import { Button } from "../button";
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

type PreviewDisclosure = BoardPreviewTarget;

interface FocusScrollProtection {
	key: string;
	expiresAfterFrame: number;
}

const entryLabel = (entry: BoardEntry): string =>
	entry.identity.board === "scratch"
		? "Scratch board"
		: `${entry.identity.board} · ${entry.identity.variant === "current" ? "Current" : entry.identity.variant}`;

function entryDescription(entry: BoardEntry, selected: boolean): string {
	const location = entry.onScreen
		? selected
			? "Visible in the focused pane."
			: "Visible in another pane."
		: entry.open
			? "Open board."
			: "Saved board.";
	return entry.inVault ? location : `${location} Unfiled draft.`;
}

function EntryMarkers({
	entry,
	selected,
}: {
	entry: BoardEntry;
	selected: boolean;
}): React.JSX.Element | null {
	const elsewhere = entry.onScreen && !selected;
	if (!elsewhere && entry.inVault) return null;
	return (
		<span className="board-nav-markers" aria-hidden="true">
			{elsewhere && (
				<span className="board-nav-on-screen" title="Visible in another pane">
					<Icon name="split" size={14} />
				</span>
			)}
			{!entry.inVault && <span className="board-nav-state">Draft</span>}
		</span>
	);
}

const NAV_ROW_CLASSES =
	"board-nav-row w-full justify-between rounded-none border-0 px-region py-control text-left !text-title whitespace-normal";

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
	const descriptionPrefix = useId();
	const descriptionId = (key: string): string => `${descriptionPrefix}-${encodeURIComponent(key)}`;
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
			const group = row.closest("details");
			if (group) group.open = true;
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
		return { key: entry.key, label: entryLabel(entry), top };
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
		setPreview((previous) => (previous?.key === key ? null : previous));
	}, []);
	const selectEntry = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>): void => {
			const key = event.currentTarget.dataset.boardKey;
			if (!key) return;
			setPreview(null);
			onSelect(key);
		},
		[onSelect],
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
		if (!followsFocus) setPreview(null);
	}, []);

	const previewEvents = (entry: BoardEntry) => ({
		onPointerMove: (event: React.PointerEvent<HTMLElement>) => reveal(entry, event.currentTarget),
		onPointerLeave: () => conceal(entry.key),
		onFocus: (event: React.FocusEvent<HTMLElement>) => {
			protectFocusScroll(entry.key);
			reveal(entry, event.currentTarget);
		},
		onBlur: () => conceal(entry.key),
	});
	return (
		<aside className="board-nav" aria-label="Boards and variants" ref={navRef}>
			<div className="board-nav-header">
				<div className="board-nav-title">
					<span>Boards</span>
				</div>
				<div className="board-nav-tools">
					<Button
						tone="secondary"
						size="icon"
						className="text-muted-foreground"
						type="button"
						onClick={onRefresh}
						title="Refresh boards"
						aria-label="Refresh boards"
						disabled={busy}
					>
						<Icon name="refresh" size={16} />
					</Button>
					<Button
						tone="secondary"
						size="icon"
						className="text-muted-foreground"
						type="button"
						onClick={onNew}
						title="New board"
						aria-label="New board"
						disabled={busy}
					>
						<Icon name="plus" size={17} />
					</Button>
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
					<Button
						tone="quiet"
						className="board-nav-error"
						type="button"
						onClick={onRefresh}
						aria-label="Retry board listing"
						disabled={busy}
					>
						Could not read the vault. Try again.
					</Button>
				)}
				{listing && groups.length === 0 && (
					<div className="board-nav-empty">No named boards yet.</div>
				)}
				{groups.map((group) => {
					const only = group.variants.length === 1 ? group.variants[0] : null;
					if (only?.identity.variant === "current") {
						const selected = only.key === currentKey;
						return (
							<section
								className="board-group board-group-single"
								key={group.board}
								aria-label={group.board}
							>
								<Button
									tone="quiet"
									type="button"
									aria-current={selected ? "page" : undefined}
									aria-label={entryLabel(only)}
									aria-describedby={descriptionId(only.key)}
									className={`${NAV_ROW_CLASSES} board-nav-board${selected ? " board-nav-row-current" : ""}`}
									data-board-key={only.key}
									disabled={busy}
									onClick={selectEntry}
									ref={selected ? currentRowRef : undefined}
									title={`${only.key} · ${entryDescription(only, selected)}`}
									{...previewEvents(only)}
								>
									<span className="sr-only" id={descriptionId(only.key)}>
										{entryDescription(only, selected)}
									</span>
									<span className="board-nav-variant">{group.board}</span>
									<EntryMarkers entry={only} selected={selected} />
								</Button>
							</section>
						);
					}
					return (
						<details
							open
							className="board-group board-group-variants"
							key={group.board}
							aria-label={group.board}
						>
							<summary className="board-group-name" title={group.board}>
								<Icon name="chevron" size={14} />
								<span className="board-group-copy">
									<strong>{group.board}</strong>
								</span>
							</summary>
							<div className="board-variants">
								{group.variants.map((entry) => {
									const selected = entry.key === currentKey;
									const label =
										entry.identity.variant === "current" ? "Current" : entry.identity.variant;
									return (
										<Button
											tone="quiet"
											type="button"
											className={`${NAV_ROW_CLASSES}${selected ? " board-nav-row-current" : ""}`}
											key={entry.key}
											disabled={busy}
											aria-current={selected ? "page" : undefined}
											aria-label={entryLabel(entry)}
											aria-describedby={descriptionId(entry.key)}
											ref={selected ? currentRowRef : undefined}
											onClick={selectEntry}
											data-board-key={entry.key}
											title={`${entry.key} · ${entryDescription(entry, selected)}`}
											{...previewEvents(entry)}
										>
											<span className="sr-only" id={descriptionId(entry.key)}>
												{entryDescription(entry, selected)}
											</span>
											<span className="board-nav-variant">{label}</span>
											<EntryMarkers entry={entry} selected={selected} />
										</Button>
									);
								})}
							</div>
						</details>
					);
				})}
			</div>

			{(scratch || needsName) && (
				<section className="board-group scratch-section" aria-label="scratch">
					<span className="board-group-name board-group-name-hidden">scratch</span>
					<div className="scratch-card">
						<div className="scratch-entry">
							<Button
								tone="quiet"
								type="button"
								className={`${NAV_ROW_CLASSES} scratch-top${scratch?.key === currentKey ? " board-nav-row-current" : ""}`}
								disabled={busy || !scratch}
								aria-current={scratch?.key === currentKey ? "page" : undefined}
								aria-label="Scratch board"
								aria-describedby={scratch ? descriptionId(scratch.key) : undefined}
								ref={scratch?.key === currentKey ? currentRowRef : undefined}
								onClick={selectEntry}
								data-board-key={scratch?.key}
								{...(scratch ? previewEvents(scratch) : {})}
							>
								{scratch && (
									<span className="sr-only" id={descriptionId(scratch.key)}>
										{entryDescription(scratch, scratch.key === currentKey)}
									</span>
								)}
								<span className="board-group-copy">
									<strong>Scratch board</strong>
									<small>Unfiled draft</small>
								</span>
								{scratch?.onScreen && scratch.key !== currentKey && (
									<span
										className="board-nav-on-screen"
										aria-hidden="true"
										title="Visible in another pane"
									>
										<Icon name="split" size={14} />
									</span>
								)}
							</Button>
						</div>
						{needsName && (
							<Button
								tone="quiet"
								className="name-button"
								type="button"
								onClick={onName}
								disabled={busy}
							>
								Name this board
							</Button>
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
