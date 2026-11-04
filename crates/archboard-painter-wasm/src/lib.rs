//! The painter as WebAssembly (ADR 0071). The page chooses a surface, this
//! draws frames on it, and `archboard-paint` decides what a frame holds. A
//! native build of the workspace compiles this crate empty.

#[cfg(target_arch = "wasm32")]
mod browser;
#[cfg(all(target_arch = "wasm32", feature = "webgpu"))]
mod gpu;
#[cfg(all(target_arch = "wasm32", feature = "webgpu"))]
mod lens;
#[cfg(any(all(target_arch = "wasm32", feature = "webgpu"), test))]
mod page_gpu;
#[cfg(all(target_arch = "wasm32", feature = "webgl"))]
mod webgl;
