import React, { useEffect, useMemo, useState } from "react";
import { exportToSvg } from "@excalidraw/excalidraw";
import type { NonDeletedExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import {
	BoardPreviewCache,
	fingerprintMountedPreview,
	PreviewRequestGate,
	projectPreviewSnapshot,
	type MountedBoardPreviewScene,
	type PreviewScene,
	type PreviewTheme,
} from "../board-preview";
import { fetchBoardPreview } from "../canvas/api";

export interface BoardPreviewTarget {
	key: string;
	label: string;
	top: number;
}

interface BoardPreviewCardProps {
	target: BoardPreviewTarget | null;
	theme: PreviewTheme;
	readMountedPreview: (board: string) => MountedBoardPreviewScene | null;
}

type PreviewState =
	| { kind: "empty"; board: string; theme: PreviewTheme; source: "mounted" | "vault" }
	| {
			kind: "ready";
			board: string;
			theme: PreviewTheme;
			source: "mounted" | "vault";
			url: string;
	  }
	| { kind: "unavailable"; board: string; theme: PreviewTheme };

const sceneFromMounted = (scene: MountedBoardPreviewScene): PreviewScene => ({
	elements: scene.elements.filter(
		(element) => !element.isDeleted,
	) as readonly NonDeletedExcalidrawElement[],
	files: scene.files,
});

export function BoardPreviewCard({
	target,
	theme,
	readMountedPreview,
}: BoardPreviewCardProps): React.JSX.Element | null {
	const [cache] = useState(() => new BoardPreviewCache());
	const [gate] = useState(() => new PreviewRequestGate());
	const [state, setState] = useState<PreviewState | null>(null);
	const cardStyle = useMemo(() => ({ top: target?.top ?? 0 }), [target?.top]);

	useEffect(() => () => cache.clear(), [cache]);

	useEffect(() => {
		if (!target) {
			gate.cancel();
			return;
		}
		const token = gate.begin(target.key);
		const abort = new AbortController();

		void (async () => {
			try {
				const mounted = readMountedPreview(target.key);
				const source = mounted ? "mounted" : "vault";
				const [fingerprint, scene] = mounted
					? [await fingerprintMountedPreview(mounted), sceneFromMounted(mounted)]
					: await fetchBoardPreview(target.key, abort.signal).then(
							(snapshot) => [snapshot.fingerprint, projectPreviewSnapshot(snapshot)] as const,
						);
				if (!gate.accepts(token)) return;
				if (scene.elements.length === 0) {
					setState({ kind: "empty", board: target.key, theme, source });
					return;
				}
				const identity = { board: target.key, fingerprint, theme };
				const cached = cache.get(identity);
				if (cached) {
					setState({ kind: "ready", board: target.key, theme, source, url: cached });
					return;
				}
				const svg = await exportToSvg({
					elements: scene.elements,
					files: scene.files,
					exportPadding: 18,
					appState: {
						theme,
						exportBackground: true,
						exportWithDarkMode: theme === "dark",
						viewBackgroundColor: theme === "dark" ? "#17191d" : "#f7f6f2",
					},
				});
				const url = URL.createObjectURL(
					new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }),
				);
				if (!gate.accepts(token)) {
					URL.revokeObjectURL(url);
					return;
				}
				cache.put(identity, url);
				setState({ kind: "ready", board: target.key, theme, source, url });
			} catch (error) {
				if (abort.signal.aborted || !gate.accepts(token)) return;
				void error;
				setState({ kind: "unavailable", board: target.key, theme });
			}
		})();
		return () => {
			abort.abort();
			if (gate.accepts(token)) gate.cancel();
		};
	}, [cache, gate, readMountedPreview, target, theme]);

	if (!target) return null;
	const visibleState =
		state?.board === target.key && state.theme === theme ? state : { kind: "loading" as const };
	return (
		<output
			className="board-preview-card"
			style={cardStyle}
			aria-label={`Preview of ${target.label}`}
			data-preview-board={target.key}
			data-preview-state={visibleState.kind}
			data-preview-source={"source" in visibleState ? visibleState.source : undefined}
		>
			<header className="board-preview-header">
				<span>Board preview</span>
				<strong>{target.label}</strong>
			</header>
			<div className={`board-preview-frame board-preview-${visibleState.kind}`}>
				{visibleState.kind === "ready" ? (
					<img src={visibleState.url} alt="" draggable={false} />
				) : visibleState.kind === "loading" ? (
					<span>Rendering board…</span>
				) : visibleState.kind === "empty" ? (
					<span>Empty board</span>
				) : (
					<span>
						Preview unavailable
						<small>Move away and back to retry</small>
					</span>
				)}
			</div>
		</output>
	);
}
