// The docs' page script: the section the reader is in, the links on each section's head, the
// sidebar's scroll across pages, the drawer on a narrow screen and the search.

/** Mark the section of the page that the reader is in, in the table of contents. */
function followSections(): void {
	const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-toc-link]")];
	if (links.length === 0) return;
	const bySlug = new Map(links.map((link) => [link.dataset["tocLink"] ?? "", link]));
	const headings = [...bySlug.keys()]
		.map((slug) => document.getElementById(slug))
		.filter((heading): heading is HTMLElement => heading !== null);
	const mark = (): void => {
		// The current section is the last whose head has passed a line under the bar.
		const line = 120;
		let current = headings[0];
		for (const heading of headings) {
			if (heading.getBoundingClientRect().top - line <= 0) current = heading;
		}
		// At the foot of the page the last section is the current one, however short it is.
		if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
			current = headings.at(-1);
		}
		for (const [slug, link] of bySlug) link.classList.toggle("is-current", slug === current?.id);
	};
	let queued = false;
	window.addEventListener(
		"scroll",
		() => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(() => {
				queued = false;
				mark();
			});
		},
		{ passive: true },
	);
	mark();
}

/** A click on a section's link copies its address, and the address bar takes it. */
function copyHeadingLinks(): void {
	for (const link of document.querySelectorAll<HTMLAnchorElement>("[data-heading-link]")) {
		link.addEventListener("click", () => {
			const url = new URL(link.href, location.href).href;
			void navigator.clipboard?.writeText(url).then(
				() => {
					link.classList.add("is-copied");
					window.setTimeout(() => link.classList.remove("is-copied"), 1400);
				},
				() => undefined,
			);
		});
	}
}

const SIDEBAR_KEY = "archboard-docs-sidebar";

/** The sidebar keeps its scroll from page to page, and shows the current page. */
function keepSidebar(): void {
	const sidebar = document.querySelector<HTMLElement>("[data-sidebar]");
	if (!sidebar) return;
	try {
		const saved = Number(sessionStorage.getItem(SIDEBAR_KEY));
		if (saved > 0) sidebar.scrollTop = saved;
	} catch {
		// Storage can be closed to the page. The sidebar then starts at its top.
	}
	const current = sidebar.querySelector<HTMLElement>('[aria-current="page"]');
	if (current) {
		const box = sidebar.getBoundingClientRect();
		const item = current.getBoundingClientRect();
		if (item.top < box.top || item.bottom > box.bottom) current.scrollIntoView({ block: "center" });
	}
	window.addEventListener("pagehide", () => {
		try {
			sessionStorage.setItem(SIDEBAR_KEY, String(sidebar.scrollTop));
		} catch {
			// Nothing to keep.
		}
	});
}

/** The drawer that holds the sidebar on a narrow screen. */
function mountDrawer(): void {
	const drawer = document.querySelector<HTMLDialogElement>("[data-drawer]");
	if (!drawer) return;
	for (const open of document.querySelectorAll("[data-drawer-open]")) {
		open.addEventListener("click", () => drawer.showModal());
	}
	for (const close of drawer.querySelectorAll("[data-drawer-close]")) {
		close.addEventListener("click", () => drawer.close());
	}
	drawer.addEventListener("click", (event) => {
		if (event.target === drawer) drawer.close();
	});
}

interface PagefindResult {
	url: string;
	excerpt: string;
	meta: { title?: string };
	sub_results?: { title: string; url: string; excerpt: string }[];
}
interface Pagefind {
	options(options: Record<string, unknown>): Promise<void>;
	debouncedSearch(
		query: string,
		options?: Record<string, unknown>,
		wait?: number,
	): Promise<{ results: { data(): Promise<PagefindResult> }[] } | null>;
}

/** The search dialog and its keys. */
function mountSearch(): void {
	const dialog = document.querySelector<HTMLDialogElement>("[data-search]");
	const input = dialog?.querySelector<HTMLInputElement>("[data-search-input]");
	const list = dialog?.querySelector<HTMLElement>("[data-search-results]");
	if (!dialog || !input || !list) return;
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	let pagefind: Promise<Pagefind | null> | undefined;
	const load = (): Promise<Pagefind | null> => {
		pagefind ??= import(/* @vite-ignore */ `${base}/pagefind/pagefind.js`).then(
			async (module: Pagefind) => {
				await module.options({ excerptLength: 18 });
				return module;
			},
			() => null,
		);
		return pagefind;
	};
	const hint = (text: string): void => {
		const line = document.createElement("p");
		line.className = "hint";
		line.textContent = text;
		list.replaceChildren(line);
	};
	const items = (): HTMLAnchorElement[] => [...list.querySelectorAll<HTMLAnchorElement>(".result")];
	const select = (index: number): void => {
		const all = items();
		all.forEach((item, at) => item.setAttribute("aria-selected", at === index ? "true" : "false"));
		all[index]?.scrollIntoView({ block: "nearest" });
	};
	const selected = (): number => items().findIndex((item) => item.ariaSelected === "true");
	const result = (page: string, title: string, url: string, excerpt: string): HTMLAnchorElement => {
		const link = document.createElement("a");
		link.className = "result";
		link.href = url;
		link.setAttribute("role", "option");
		const pageLine = document.createElement("span");
		pageLine.className = "result-page";
		pageLine.textContent = page;
		const titleLine = document.createElement("span");
		titleLine.className = "result-title";
		titleLine.textContent = title;
		const excerptLine = document.createElement("span");
		excerptLine.className = "result-excerpt";
		// Pagefind's excerpt is the page's own text, escaped, with <mark> around the words found.
		excerptLine.innerHTML = excerpt;
		link.append(pageLine, titleLine, excerptLine);
		link.addEventListener("mousemove", () => select(items().indexOf(link)));
		return link;
	};
	const run = async (query: string): Promise<void> => {
		if (query.trim() === "") {
			hint("Type to search every page, command and schema.");
			return;
		}
		const engine = await load();
		if (!engine) {
			hint("The search index comes with the built site. Run bun run build, then bun run preview.");
			return;
		}
		const found = await engine.debouncedSearch(query, {}, 120);
		if (!found) return;
		const pages = await Promise.all(found.results.slice(0, 8).map((entry) => entry.data()));
		if (input.value !== query) return;
		if (pages.length === 0) {
			hint(`Nothing in the docs matches “${query}”.`);
			return;
		}
		list.replaceChildren(
			...pages.flatMap((page) => {
				const name = page.meta.title ?? page.url;
				const sections = (page.sub_results ?? []).filter((sub) => sub.url !== page.url).slice(0, 3);
				return sections.length > 0
					? sections.map((sub) => result(name, sub.title, sub.url, sub.excerpt))
					: [result("Page", name, page.url, page.excerpt)];
			}),
		);
		select(0);
	};
	const open = (): void => {
		if (dialog.open) return;
		dialog.showModal();
		input.select();
		void load();
	};
	for (const trigger of document.querySelectorAll("[data-search-open]")) {
		trigger.addEventListener("click", open);
	}
	dialog.querySelector("[data-search-close]")?.addEventListener("click", () => dialog.close());
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) dialog.close();
	});
	input.addEventListener("input", () => void run(input.value));
	input.addEventListener("keydown", (event) => {
		const count = items().length;
		if (event.key === "ArrowDown" && count > 0) {
			event.preventDefault();
			select((selected() + 1) % count);
		} else if (event.key === "ArrowUp" && count > 0) {
			event.preventDefault();
			select((selected() - 1 + count) % count);
		} else if (event.key === "Enter") {
			const chosen = items()[Math.max(0, selected())];
			if (chosen) {
				event.preventDefault();
				chosen.click();
			}
		}
	});
	document.addEventListener("keydown", (event) => {
		const target = event.target as HTMLElement | null;
		const typing =
			target?.isContentEditable === true ||
			["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
		if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
			event.preventDefault();
			open();
		}
	});
	// A Mac shows ⌘K where another system shows Ctrl K.
	if (/Mac|iPhone|iPad/.test(navigator.platform)) {
		for (const key of document.querySelectorAll("[data-search-key]")) key.textContent = "⌘K";
	}
}

followSections();
copyHeadingLinks();
keepSidebar();
mountDrawer();
mountSearch();
