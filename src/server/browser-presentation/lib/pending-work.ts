/** One picture a pane produced, as it answered. */
interface CaptureResult {
	readonly format: string;
	readonly data: string;
}

/** A capture this canvas asked for and is still waiting on. */
interface PendingBrowserCapture {
	readonly resolve: (data: Readonly<CaptureResult>) => void;
	readonly reject: (error: Readonly<Error>) => void;
	readonly timeout: ReturnType<typeof setTimeout>;
	dispatchTimeout: ReturnType<typeof setTimeout> | null;
	collectionTimeout: ReturnType<typeof setTimeout> | null;
	bestResult: CaptureResult | null;
}

/** What a pane said about a camera move it was asked to make. */
interface ViewportResult {
	readonly success: boolean;
	readonly message: string;
}

/** A camera move this canvas asked for and is still waiting on. */
interface PendingViewport {
	readonly resolve: (data: Readonly<ViewportResult>) => void;
	readonly reject: (error: Readonly<Error>) => void;
	readonly timeout: ReturnType<typeof setTimeout>;
}

export type { CaptureResult, PendingBrowserCapture, PendingViewport, ViewportResult };
