import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, afterEach, expect, jest, mock, test } from "bun:test";
import { paneMs } from "@archboard/timing";
import { installFeedServer } from "#tests/ui/support/model-catalog/feed-server.ts";

GlobalRegistrator.register({ url: "http://localhost/" });
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, writable: true });

await mock.module("virtual:archboard-renderer", () => ({ rendererBuild: "test" }));

const { act, cleanup, render, within } = await import("@testing-library/react");
const { Application } = await import("#ui/application/components/Application.tsx");
const { createReadingRoutingHost } =
	await import("#ui/panes/reading-routing/components/ReadingRoutingHost.tsx");

const feed = installFeedServer();

afterEach(() => {
	cleanup();
	feed.reset();
});
afterAll(async () => {
	feed.uninstall();
	// Sonner's synchronous toast updates schedule React work outside act.
	await new Promise<void>((resolve) => setImmediate(resolve));
	await GlobalRegistrator.unregister();
});

/**
 * Let what the page set off settle on the clock the test moves.
 * @param ms How long passes, such as a toast's leaving.
 */
async function settle(ms = 0): Promise<void> {
	await act(async () => jest.advanceTimersByTime(ms));
	await act(async () => jest.advanceTimersByTime(0));
}

test("the chooser names a server that does not answer, and lists the repositories once it does", async () => {
	jest.useFakeTimers();
	try {
		feed.refuse(true);
		const RoutedApplication = createReadingRoutingHost(Application);
		const { container } = render(<RoutedApplication />);
		await settle();
		const notices = container.querySelectorAll<HTMLElement>('[data-notice="listing"]');
		expect(notices).toHaveLength(1);
		expect(within(notices[0]!).getByText(/does not answer/)).toBeDefined();
		expect(within(notices[0]!).queryByRole("button", { name: "Retry" })).toBeNull();
		feed.refuse(false);
		await act(async () => jest.advanceTimersByTime(paneMs("socketReconnect")));
		await settle();
		await act(async () =>
			feed.latest()!.receive({ type: "repositories", revision: 0, repositories: [] }),
		);
		// The page hears the listing, the notice is dismissed, and then the toast leaves.
		await settle();
		await settle(1000);
		expect(container.querySelectorAll('[data-slot="start-empty"]')).toHaveLength(1);
		expect(container.querySelectorAll('[data-notice="listing"]')).toHaveLength(0);
	} finally {
		jest.useRealTimers();
	}
});
