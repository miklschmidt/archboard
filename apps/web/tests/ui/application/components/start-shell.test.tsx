import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, mock, test } from "bun:test";

GlobalRegistrator.register({ url: "http://localhost/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

await mock.module("virtual:archboard-renderer", () => ({ rendererBuild: "test" }));

const { cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { Application } = await import("#ui/application/components/Application.tsx");
const { createReadingRoutingHost } =
	await import("#ui/panes/reading-routing/components/ReadingRoutingHost.tsx");

const realFetch = globalThis.fetch;
const FAILURE = "The repository store refused discovery.";

afterEach(() => {
	cleanup();
	globalThis.fetch = realFetch;
});
afterAll(async () => {
	// Sonner's synchronous toast updates schedule React work outside act.
	await new Promise<void>((resolve) => setImmediate(resolve));
	await GlobalRegistrator.unregister();
});

test("the chooser offers an immediate retry when repository discovery fails", async () => {
	let recovered = false;
	/**
	 * Refuse discovery until the server can answer again.
	 * @param input The requested resource.
	 * @returns The server's response.
	 */
	async function discover(input: RequestInfo | URL): Promise<Response> {
		const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI);
		if (url.pathname !== "/api/repositories") return new Response(null, { status: 404 });
		return recovered
			? Response.json({ success: true, repositories: [] })
			: Response.json({ success: false, error: FAILURE }, { status: 500 });
	}
	globalThis.fetch = Object.assign(discover, { preconnect: realFetch.preconnect });
	const RoutedApplication = createReadingRoutingHost(Application);
	const { container } = render(<RoutedApplication />);
	const notice = await waitFor(() => {
		const notices = container.querySelectorAll<HTMLElement>('[data-notice="listing"]');
		expect(notices).toHaveLength(1);
		return notices[0]!;
	});
	expect(within(container).getByText(FAILURE)).toBe(within(notice).getByText(FAILURE));
	recovered = true;
	fireEvent.click(within(notice).getByRole("button", { name: "Retry" }));
	await waitFor(() => {
		expect(container.querySelectorAll('[data-slot="start-empty"]')).toHaveLength(1);
		expect(container.querySelectorAll('[data-notice="listing"]')).toHaveLength(0);
	});
});
