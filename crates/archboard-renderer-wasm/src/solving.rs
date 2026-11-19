//! One solve a host runs for the core, as a future: it answers with the
//! host's JSON, and dropping it before it answers calls the solve off with the
//! signal the host was given.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

use archboard_layout::Unsolved;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

#[wasm_bindgen]
extern "C" {
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
    pub(crate) type AbortSignal;

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

impl Solving {
    /// A solve the host was asked for, with the signal that calls it off.
    pub(crate) fn asked(ask: impl FnOnce(&AbortSignal) -> Result<JsValue, JsValue>) -> Self {
        let calling = AbortController::new();
        let signal = calling.signal();
        let answer = ask(&signal).map_or_else(
            |error| js_sys::Promise::reject(&error),
            |value| js_sys::Promise::resolve(&value),
        );
        Solving {
            answer: JsFuture::from(answer),
            calling,
            signal,
            answered: false,
        }
    }
}

impl Drop for Solving {
    fn drop(&mut self) {
        if !self.answered {
            self.calling.abort();
        }
    }
}

/// What a value the host threw or refused with says.
pub(crate) fn said(error: &JsValue, what: &str) -> String {
    error
        .dyn_ref::<js_sys::Error>()
        .map(|error| String::from(error.message()))
        .or_else(|| error.as_string())
        .unwrap_or_else(|| format!("{what} failed without saying why"))
}
