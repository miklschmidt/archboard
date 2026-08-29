import type { AgentBrowserSession } from "./agent-browser.ts";

type PageEvaluator = Pick<AgentBrowserSession, "eval">;

export type PageEdit =
	| { kind: "delete"; id: string }
	| { kind: "move"; id: string; dx: number; dy: number }
	| { kind: "resize"; id: string; dw: number; dh: number }
	| { kind: "retype"; id: string; text: string };

export interface PageSceneSnapshot {
	error?: string;
	elements?: Array<Record<string, unknown>>;
}

export interface ReportStats {
	sent: number;
	done: number;
	holds: number;
	releases: number;
	acknowledgements: number;
	correctionUpserts: number;
	correctionDeletes: number;
	lastCorrections: unknown;
	delayedReports: number;
	reportStarts: number[];
	reportAnswers: number[];
}

export const EXCALIDRAW_APP_EXPRESSION = `(() => {
  const node = document.querySelector('.excalidraw');
  const key = node && Object.keys(node).find(candidate => candidate.startsWith('__reactFiber$'));
  let fiber = key ? node[key] : null;
  for (let depth = 0; fiber && depth < 60; depth += 1) {
    const app = fiber.stateNode;
    if (app && typeof app === 'object' && app.scene
        && typeof app.scene.getElementsIncludingDeleted === 'function') return app;
    fiber = fiber.return;
  }
  return null;
})()`;

export function inExcalidrawApp(body: string): string {
	return `(() => {
  const app = ${EXCALIDRAW_APP_EXPRESSION};
  if (!app) return { error: 'no Excalidraw app instance' };
  ${body}
})()`;
}

export const READ_PAGE_SCENE_EXPRESSION = inExcalidrawApp(
	"return { elements: app.scene.getElementsIncludingDeleted().map(element => ({ ...element })) };",
);

const INSTALL_REPORT_COUNTER = `(() => {
  if (window.__archboardBrowserReports) return { already: true };
  const reports = window.__archboardBrowserReports = {
    sent: 0, done: 0, holds: 0, releases: 0, acknowledgements: 0,
    correctionUpserts: 0, correctionDeletes: 0, lastCorrections: null,
    delayedReports: 0, reportStarts: [], reportAnswers: []
  };
  window.__archboardDelayNextReport = 0;
  const original = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = (init && init.method) || (input && input.method) || 'GET';
    const report = method === 'POST' && url.includes('/api/elements/changes');
    const hold = method === 'POST' && url.includes('/api/boards/hold')
      && !url.includes('/api/boards/hold/release');
    if (method === 'POST' && url.includes('/api/boards/hold/release')) reports.releases += 1;
    else if (hold) reports.holds += 1;
    if (report) {
      reports.sent += 1;
      reports.reportStarts.push(performance.now());
    }
    const answer = original.apply(this, arguments);
    if (!report) return answer;
    const delay = window.__archboardDelayNextReport || 0;
    window.__archboardDelayNextReport = 0;
    if (delay) reports.delayedReports += 1;
    return answer
      .then(response => delay
        ? new Promise(resolve => setTimeout(() => resolve(response), delay))
        : response)
      .then(response => {
        reports.done += 1;
        reports.reportAnswers.push(performance.now());
        response.clone().json().then(body => {
          const corrections = body && body.corrections;
          if (!corrections) return;
          reports.acknowledgements += 1;
          reports.correctionUpserts += corrections.upserts?.length || 0;
          reports.correctionDeletes += corrections.deletes?.length || 0;
          reports.lastCorrections = corrections;
        }).catch(() => {});
        return response;
      });
  };
  return { installed: true };
})()`;

const INSTALL_LIVE_EDIT_SUPPORT = `(() => {
  if (window.__archboardApplyPageEdit) return { already: true };
  window.__archboardApplyPageEdit = edit => {
    const app = ${EXCALIDRAW_APP_EXPRESSION};
    if (!app) return { error: 'no Excalidraw app instance' };
    const all = app.scene.getElementsIncludingDeleted().map(element => ({ ...element }));
    const at = all.findIndex(element => element.id === edit.id);
    if (at === -1) return { error: 'the pane is not holding ' + edit.id };
    let next;
    if (edit.kind === 'delete') {
      next = all.filter(element => element.id !== edit.id);
    } else if (edit.kind === 'move') {
      next = all.map(element => element.id === edit.id
        ? { ...element, x: element.x + edit.dx, y: element.y + edit.dy }
        : element);
    } else if (edit.kind === 'resize') {
      next = all.map(element => element.id === edit.id
        ? { ...element, width: Math.max(20, element.width + edit.dw),
          height: Math.max(20, element.height + edit.dh) }
        : element);
    } else if (edit.kind === 'retype') {
      const text = all[at];
      if (text.type !== 'text') return { error: edit.id + ' is not a text element' };
      const context = document.createElement('canvas').getContext('2d');
      const family = { 1: 'Virgil', 2: 'Helvetica', 3: 'Cascadia', 5: 'Excalifont',
        6: 'Nunito', 7: 'Lilita One', 8: 'Comic Shanns' }[text.fontFamily] || 'Excalifont';
      const font = text.fontSize + 'px ' + family;
      if (!document.fonts.check(font)) return { error: font + ' has not been loaded' };
      context.font = font;
      const width = context.measureText(edit.text).width;
      next = all.map(element => element.id === edit.id
        ? { ...element, text: edit.text, originalText: edit.text, rawText: edit.text, width }
        : element);
    } else {
      return { error: 'unknown edit ' + edit.kind };
    }
    app.updateScene({ elements: next, captureUpdate: 'IMMEDIATELY' });
    return { ok: true, count: next.length };
  };
  return { installed: true };
})()`;

const INSTALL_SERVER_UPDATE_INJECTOR = inExcalidrawApp(`
  if (window.__archboardServerUpdateInjector) return { already: true };
  window.__archboardServerUpdateInjector = true;
  window.__archboardPendingPageEdit = null;
  window.__archboardInjectedPageEdits = 0;
  let applyingInjectedEdit = false;
  const replace = app.scene.replaceAllElements.bind(app.scene);
  app.scene.replaceAllElements = function (elements) {
    const result = replace(elements);
    const pending = window.__archboardPendingPageEdit;
    if (pending && !applyingInjectedEdit) {
      window.__archboardPendingPageEdit = null;
      queueMicrotask(() => {
        applyingInjectedEdit = true;
        try {
          window.__archboardInjectedPageEdits += 1;
          window.__archboardApplyPageEdit(pending);
        } finally {
          applyingInjectedEdit = false;
        }
      });
    }
    return result;
  };
  return { installed: true };
`);

export async function readPageScene(browser: PageEvaluator): Promise<PageSceneSnapshot> {
	return browser.eval<PageSceneSnapshot>(READ_PAGE_SCENE_EXPRESSION);
}

export async function installLiveEditSupport(browser: PageEvaluator): Promise<unknown> {
	return browser.eval(INSTALL_LIVE_EDIT_SUPPORT);
}

export async function applyPageEdit(browser: PageEvaluator, edit: PageEdit): Promise<unknown> {
	return browser.eval(`window.__archboardApplyPageEdit(${JSON.stringify(edit)})`);
}

export async function installReportCounter(browser: PageEvaluator): Promise<unknown> {
	return browser.eval(INSTALL_REPORT_COUNTER);
}

export async function readReportStats(browser: PageEvaluator): Promise<ReportStats> {
	return browser.eval("(() => ({ ...window.__archboardBrowserReports }))()");
}

export async function delayNextReport(browser: PageEvaluator, milliseconds: number): Promise<void> {
	await browser.eval(`window.__archboardDelayNextReport = ${JSON.stringify(milliseconds)}`);
}

export async function installServerUpdateInjector(browser: PageEvaluator): Promise<unknown> {
	return browser.eval(INSTALL_SERVER_UPDATE_INJECTOR);
}

export async function armServerUpdateEdit(browser: PageEvaluator, edit: PageEdit): Promise<void> {
	await browser.eval(`window.__archboardPendingPageEdit = ${JSON.stringify(edit)}`);
}

export async function injectedPageEditCount(browser: PageEvaluator): Promise<number> {
	return browser.eval("window.__archboardInjectedPageEdits || 0");
}
