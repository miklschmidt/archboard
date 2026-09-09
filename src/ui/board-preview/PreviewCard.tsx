// A lazy board preview: the real scene the server sent, exported through
// Excalidraw's own SVG exporter once the card is on screen. It depicts only
// the snapshot it is given and never opens, claims or writes the board.

import { exportToSvg } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useRef, useState, type JSX } from "react";

import {
	type BoardPreviewCache,
	type PreviewRequestGate,
	type PreviewSource,
	type PreviewTheme,
	previewSourceHasContent,
	projectPreviewSource,
} from "@/ui/board-preview";

/** Inputs for one preview card. */
interface PreviewCardProps {
	board: string;
	/** The scene to depict, or null until the runtime has supplied one. */
	snapshot: PreviewSource | null;
	theme: PreviewTheme;
	/** Shared across cards: owns every Blob URL it holds and revokes what it drops. */
	cache: BoardPreviewCache;
	/** Owned by this card's host: makes an export that finishes late inert. */
	gate: PreviewRequestGate;
}

/** The padding Excalidraw leaves around an exported scene, in scene pixels. */
const EXPORT_PADDING = 8;

/** The 16:9 card every state shares: one-pixel border, two-pixel corners. */
const CARD_CLASS = "border-border bg-card relative block aspect-video w-full rounded-[2px] border";

/**
 * Export the scene as an SVG Blob URL.
 * @param snapshot The scene to depict.
 * @param theme Which theme to export in.
 * @returns An owned Blob URL; the caller revokes it or hands it to the cache.
 */
async function renderPreviewUrl(snapshot: PreviewSource, theme: PreviewTheme): Promise<string> {
	const scene = projectPreviewSource(snapshot);
	const svg = await exportToSvg({
		elements: scene.elements,
		files: scene.files,
		appState: { exportBackground: false, exportWithDarkMode: theme === "dark" },
		exportPadding: EXPORT_PADDING,
		skipInliningFonts: true,
	});
	const markup = new XMLSerializer().serializeToString(svg);
	return URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
}

/** What the card shows while it has no image. */
interface EmptyBoxProps {
	/** The words, kept short: they sit as a technical label in the corner. */
	text: string;
	/** Whether the board itself is empty, which paints the faint dot grid. */
	empty: boolean;
}

/**
 * The 16:9 card shown before a preview exists or when the board is empty:
 * a faint dot grid with a small technical label in the corner, not a
 * sentence in the middle.
 * @param props The label and whether the board is empty.
 * @returns The card.
 */
function EmptyBox(props: EmptyBoxProps): JSX.Element {
	return (
		<span className={`${CARD_CLASS} ${props.empty ? "dot-grid" : ""}`}>
			<span className="text-technical text-muted-foreground bg-card absolute bottom-1 left-1 rounded-[2px] px-0.5 font-mono">
				{props.text}
			</span>
		</span>
	);
}

/** A failed export leaves the empty box; the next snapshot retries. */
function ignoreFailure(): void {
	// Intentionally empty.
}

/** What the export effect needs, so the observer callback closes over one object. */
interface ExportRequest {
	snapshot: PreviewSource;
	theme: PreviewTheme;
	cache: BoardPreviewCache;
	gate: PreviewRequestGate;
	setUrl: (url: string) => void;
}

/**
 * Export once, then either adopt the URL into the cache or revoke it when the
 * request has been superseded or the card has gone.
 * @param request What to export and where the result goes.
 */
function runExport(request: ExportRequest): void {
	const { snapshot, theme, cache, gate, setUrl } = request;
	const identity = { board: snapshot.board, fingerprint: snapshot.fingerprint, theme };
	const cached = cache.get(identity);
	if (cached !== null) {
		setUrl(cached);
		return;
	}
	const token = gate.begin(snapshot.board);
	/**
	 * Adopt a finished export, or revoke it when it arrived too late.
	 * @param url The owned Blob URL.
	 */
	const settle = (url: string): void => {
		if (!gate.accepts(token)) {
			URL.revokeObjectURL(url);
			return;
		}
		cache.put(identity, url);
		setUrl(url);
	};
	void renderPreviewUrl(snapshot, theme).then(settle, ignoreFailure);
}

/**
 * Start the export once the card scrolls into view, and cancel it when the
 * card leaves the tree or its inputs change.
 * @param element The card element to observe, or null before mount.
 * @param request What to export, or null when there is nothing to draw.
 * @returns The cleanup that disconnects the observer and cancels the gate.
 */
function observeAndExport(element: HTMLElement | null, request: ExportRequest | null): () => void {
	if (!element || !request) {
		return () => {
			// Nothing was started.
		};
	}
	const observer = new IntersectionObserver((entries) => {
		if (entries.some((entry) => entry.isIntersecting)) {
			observer.disconnect();
			runExport(request);
		}
	});
	observer.observe(element);
	return () => {
		observer.disconnect();
		request.gate.cancel();
	};
}

/**
 * One board's lazy preview.
 * @param props The board, its snapshot, the theme, the shared cache and the gate.
 * @returns An image once exported; a bordered box before that or when the board is empty.
 */
function PreviewCard(props: PreviewCardProps): JSX.Element {
	const { board, snapshot, theme, cache, gate } = props;
	const [url, setUrl] = useState<string | null>(null);
	const hostRef = useRef<HTMLSpanElement | null>(null);
	const adopt = useCallback((next: string) => setUrl(next), []);
	useEffect(() => {
		const request: ExportRequest | null =
			snapshot !== null && previewSourceHasContent(snapshot)
				? { snapshot, theme, cache, gate, setUrl: adopt }
				: null;
		return observeAndExport(hostRef.current, request);
	}, [snapshot, theme, cache, gate, adopt]);
	if (snapshot === null) {
		return <EmptyBox text="No preview yet" empty={false} />;
	}
	if (!previewSourceHasContent(snapshot)) {
		return <EmptyBox text="Empty board" empty />;
	}
	return (
		<span ref={hostRef} className="block w-full">
			{url === null ? (
				<EmptyBox text="Rendering" empty={false} />
			) : (
				<img src={url} alt={`Preview of ${board}`} className={`${CARD_CLASS} object-contain p-1`} />
			)}
		</span>
	);
}

export { PreviewCard, type PreviewCardProps };
