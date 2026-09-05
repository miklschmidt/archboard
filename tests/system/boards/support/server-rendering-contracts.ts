interface RendererStatus {
	started: boolean;
	accepting: boolean;
	active: boolean;
	queued: number;
	chromiumStarts: number;
	chromiumPid: number | null;
	tempRoot: string | null;
	profile: string | null;
	controlPort: number | null;
	fixturePort: number | null;
}

interface HealthBody {
	websocket_clients: number;
	renderer: RendererStatus;
	application: { activeMutations: Array<{ name: string; kind: string }> };
	held_boards: Array<{ board: string }>;
}

interface RenderBody {
	code?: string;
	error?: string;
	board: string;
	sourceFingerprint: string;
	format: "png" | "svg";
	data: string;
	width: number;
	height: number;
	backgroundColor: string;
}

interface MermaidElement {
	type: string;
	text?: string;
	startBinding?: { elementId: string } | null;
	endBinding?: { elementId: string } | null;
}

interface FindingBody {
	sourceFingerprint: string;
	report: {
		findings: Array<{
			code: string;
			focusBBox?: { x: number; y: number; width: number; height: number };
		}>;
	};
	results: Array<{ findingIndex: number; data?: string; failure?: string }>;
}

export type { RendererStatus, HealthBody, RenderBody, MermaidElement, FindingBody };
