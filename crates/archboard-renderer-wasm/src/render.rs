//! The render's binding: a render request in, as the JSON of the host's
//! request, and the picture with its key out (`archboard_render::Rendered`).
//!
//! The host runs each solve the render asks for on its layout engine, side by
//! side on as many workers as it has, and calls one off when the render calls
//! it off or drops it (`RenderHost`); it gives the path data of the icons a
//! picture draws.

use std::collections::BTreeMap;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};

use archboard_layout::{Solver, Unsolved};
use archboard_render::request::RenderRequest;
use archboard_render::{Host, Renderer};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

use crate::layout::said;

#[wasm_bindgen(typescript_custom_section)]
const RENDER_HOST: &str = r#"
import type { Rendered } from "./types.ts";

/** What a render asks of the place it runs in. */
export interface RenderHost {
    /**
     * One measured graph laid out the way its root options name, answered as
     * `layOutBoard` answers it. The signal calls off a solve that still waits
     * for an engine: it is refused with the signal's reason. One an engine
     * already lays out answers all the same, and the render may still read it.
     */
    solve(graph: string, signal: AbortSignal): Promise<string>;
    /** Each icon's path data, by export name, of the icons named that the host has. */
    icons(names: string[]): Record<string, readonly string[]>;
}

export type { Rendered };
"#;

#[wasm_bindgen]
extern "C" {
    /// What a render asks of the place it runs in.
    #[wasm_bindgen(typescript_type = "RenderHost")]
    pub type RenderHost;

    #[wasm_bindgen(method, catch, js_name = solve)]
    fn solve_on(this: &RenderHost, graph: String, signal: &AbortSignal)
    -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = icons)]
    fn icons_of(this: &RenderHost, names: Vec<String>) -> Result<JsValue, JsValue>;

    /// Read the host's map, including getters, within the exception boundary.
    #[wasm_bindgen(catch, js_namespace = Object, js_name = entries)]
    fn icon_entries(value: &JsValue) -> Result<js_sys::Array, JsValue>;

    /// What calls a solve off.
    #[derive(Clone)]
    type AbortController;

    #[wasm_bindgen(constructor)]
    fn new() -> AbortController;

    #[wasm_bindgen(method, getter)]
    fn signal(this: &AbortController) -> AbortSignal;

    #[wasm_bindgen(method)]
    fn abort(this: &AbortController);

    /// The signal a solve is called off by.
    type AbortSignal;

    #[wasm_bindgen(method, getter)]
    fn aborted(this: &AbortSignal) -> bool;

    #[wasm_bindgen(method, getter)]
    fn reason(this: &AbortSignal) -> JsValue;
}

/// One solve the host runs. Dropping it before it answers calls it off.
pub struct Solving {
    answer: JsFuture,
    calling: AbortController,
    signal: AbortSignal,
    answered: bool,
}

impl std::fmt::Debug for Solving {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Solving")
            .field("answered", &self.answered)
            .finish_non_exhaustive()
    }
}

impl Future for Solving {
    type Output = Result<String, Unsolved>;

    fn poll(mut self: Pin<&mut Self>, context: &mut Context<'_>) -> Poll<Self::Output> {
        let answer = Pin::new(&mut self.answer).poll(context);
        answer.map(|answer| {
            self.answered = true;
            let answer = answer.map_err(|error| {
                if self.signal.aborted() && js_sys::Object::is(&error, &self.signal.reason()) {
                    Unsolved::CalledOff
                } else {
                    Unsolved::Failed(said(&error, "A solve"))
                }
            })?;
            answer
                .as_string()
                .ok_or_else(|| Unsolved::Failed("A solve answered no JSON".to_owned()))
        })
    }
}

impl Drop for Solving {
    fn drop(&mut self) {
        if !self.answered {
            self.calling.abort();
        }
    }
}

impl Solver for RenderHost {
    type Solve<'s> = Solving;

    fn solve(&self, graph: String) -> Solving {
        let calling = AbortController::new();
        let signal = calling.signal();
        let answer = self.solve_on(graph, &signal).map_or_else(
            |error| js_sys::Promise::reject(&error),
            |value| js_sys::Promise::resolve(&value),
        );
        let answer = JsFuture::from(answer);
        Solving {
            answer,
            calling,
            signal,
            answered: false,
        }
    }
}

impl Host for RenderHost {
    fn icons(&self, names: &[&str]) -> Result<BTreeMap<String, Vec<String>>, String> {
        let named = names.iter().map(|name| (*name).to_owned()).collect();
        let icons = self
            .icons_of(named)
            .map_err(|error| said(&error, "Reading icons"))?;
        icon_entries(&icons)
            .map_err(|error| said(&error, "Reading icons"))?
            .iter()
            .map(|entry| {
                let entry: js_sys::Array = entry.unchecked_into();
                let name = entry.get(0).as_string().ok_or("An icon has no name")?;
                let paths = entry.get(1);
                let paths = paths
                    .dyn_ref::<js_sys::Array>()
                    .ok_or_else(|| format!("Icon {name} has no array of paths"))?;
                let paths = paths
                    .iter()
                    .map(|path| {
                        path.as_string()
                            .ok_or_else(|| format!("Icon {name} has a path that is not a string"))
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                Ok((name, paths))
            })
            .collect()
    }
}

thread_local! {
    /// The renderer of this place, which remembers the layouts it laid out.
    static RENDERER: Rc<Renderer> = Rc::default();
}

/// One reading drawn in the grammar its view asked for: the JSON of a render
/// request in; the picture and its key, or why nothing was drawn, out.
///
/// # Errors
///
/// A request that does not read as its type, a solve the host failed or
/// answered unreadably, icons the host cannot read, and a document the SVG painter refuses.
#[wasm_bindgen(unchecked_return_type = "Rendered")]
pub async fn render(request: String, host: RenderHost) -> Result<JsValue, JsError> {
    let request: RenderRequest = serde_json::from_str(&request).map_err(|error| {
        JsError::new(&format!(
            "The render request does not match its type: {error}"
        ))
    })?;
    let renderer = RENDERER.with(Rc::clone);
    let rendered = renderer
        .render(&request, &host)
        .await
        .map_err(|error| JsError::new(&error))?;
    let written =
        serde_json::to_string(&rendered).map_err(|error| JsError::new(&error.to_string()))?;
    js_sys::JSON::parse(&written).map_err(|error| JsError::new(&said(&error, "Reading a picture")))
}
