//! The painter as WebAssembly (ADR 0071). The page chooses a surface, this
//! draws frames on it, and `archboard-paint` decides what a frame holds. A
//! native build of the workspace compiles this crate empty.

#[cfg(target_arch = "wasm32")]
mod browser;
#[cfg(target_arch = "wasm32")]
mod gpu;
#[cfg(any(target_arch = "wasm32", test))]
mod page_gpu;
