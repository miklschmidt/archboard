//! Vello on WebGPU. The page checks the adapter before it comes here, so a
//! failure here is a failure to start, and the page falls back to the CPU.

use std::collections::HashMap;
use std::mem;

use archboard_paint::canvas::{Canvas, Ink, PartKey};
use kurbo::{Affine, BezPath, Rect, Shape as _};
use peniko::{BlendMode, Brush, Compose, Fill, Mix};
use vello::{AaConfig, AaSupport, RenderParams, Renderer, RendererOptions, Scene};
use wasm_bindgen::JsError;
use web_sys::HtmlCanvasElement;

/// The clip of a layer that clips nothing, in canvas pixels.
const EVERYTHING: Rect = Rect::new(-1e5, -1e5, 1e5, 1e5);

/// How finely a straight-edged box stands in as a path.
const BOX_TOLERANCE: f64 = 0.1;

/// A brush and the transform of its own space.
fn brush_of(ink: &Ink) -> (Brush, Option<Affine>) {
    match ink {
        Ink::Solid(colour) => (Brush::Solid(*colour), None),
        Ink::Gradient(gradient, transform) => (Brush::Gradient(gradient.clone()), Some(*transform)),
    }
}

/// The most bytes of path data the parts a canvas keeps can hold. Past it, the
/// canvas starts again with none.
const MOST_KEPT: usize = 32 << 20;

/// One frame's drawing, encoded for the GPU, and the parts of it that come back
/// from frame to frame, encoded once.
pub(crate) struct GpuCanvas {
    scene: Scene,
    transform: Affine,
    parts: HashMap<PartKey, Scene>,
    /// The drawings that wait for the part on the canvas to end.
    waiting: Vec<Scene>,
    /// The bytes of path data in `parts`.
    kept: usize,
}

impl Canvas for GpuCanvas {
    fn set_transform(&mut self, transform: Affine) {
        self.transform = transform;
    }

    fn fill(&mut self, path: &BezPath, ink: &Ink, even_odd: bool) {
        let (brush, own) = brush_of(ink);
        let rule = if even_odd {
            Fill::EvenOdd
        } else {
            Fill::NonZero
        };
        self.scene.fill(rule, self.transform, &brush, own, path);
    }

    fn stroke(&mut self, path: &BezPath, stroke: &kurbo::Stroke, ink: &Ink) {
        let (brush, own) = brush_of(ink);
        self.scene.stroke(stroke, self.transform, &brush, own, path);
    }

    fn push(&mut self, clip: Option<(&BezPath, bool)>, opacity: f32) {
        match clip {
            Some((path, even_odd)) => {
                let rule = if even_odd {
                    Fill::EvenOdd
                } else {
                    Fill::NonZero
                };
                self.scene
                    .push_layer(rule, Mix::Normal, opacity, self.transform, path);
            }
            None => self.scene.push_layer(
                Fill::NonZero,
                Mix::Normal,
                opacity,
                Affine::IDENTITY,
                &EVERYTHING.to_path(BOX_TOLERANCE),
            ),
        }
    }

    fn push_cut(&mut self) {
        self.composed(Compose::DestOut);
    }

    fn push_keep(&mut self) {
        self.composed(Compose::DestIn);
    }

    fn pop(&mut self) {
        self.scene.pop_layer();
    }

    fn again(&mut self, key: PartKey, transform: Affine) -> bool {
        let part = self.parts.get(&key);
        if let Some(part) = part {
            self.scene.append(part, Some(transform));
        }
        part.is_some()
    }

    fn keep(&mut self) -> bool {
        self.waiting.push(mem::take(&mut self.scene));
        true
    }

    fn kept(&mut self, key: PartKey, transform: Affine) {
        let waiting = self.waiting.pop().unwrap_or_default();
        let part = mem::replace(&mut self.scene, waiting);
        self.scene.append(&part, Some(transform));
        let bytes = part.encoding().path_data.len();
        if self.kept + bytes > MOST_KEPT {
            self.parts.clear();
            self.kept = 0;
        }
        if bytes <= MOST_KEPT {
            self.kept += bytes;
            self.parts.insert(key, part);
        }
    }
}

impl GpuCanvas {
    /// Start a layer that composes with what is under it.
    fn composed(&mut self, compose: Compose) {
        self.scene.push_layer(
            Fill::NonZero,
            BlendMode::new(Mix::Normal, compose),
            1.0,
            Affine::IDENTITY,
            &EVERYTHING.to_path(BOX_TOLERANCE),
        );
    }
}

/// A surface and all that draws on it.
pub(crate) struct GpuTarget {
    device: wgpu::Device,
    queue: wgpu::Queue,
    surface: wgpu::Surface<'static>,
    configuration: wgpu::SurfaceConfiguration,
    renderer: Renderer,
    blitter: wgpu::util::TextureBlitter,
    view: wgpu::TextureView,
    canvas: GpuCanvas,
}

impl Drop for GpuTarget {
    fn drop(&mut self) {
        // wgpu's WebGPU device drop is a no-op. Each target owns its device,
        // so release its GPU allocations when the page disposes the painter.
        self.device.destroy();
    }
}

/// The texture Vello draws into, and its view.
fn target_view(device: &wgpu::Device, width: u32, height: u32) -> wgpu::TextureView {
    device
        .create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        })
        .create_view(&wgpu::TextureViewDescriptor::default())
}

/// An error as the page reads it.
fn failed(error: impl std::fmt::Display) -> JsError {
    JsError::new(&error.to_string())
}

impl GpuTarget {
    /// Start Vello on a canvas.
    pub(crate) async fn start(canvas: HtmlCanvasElement) -> Result<GpuTarget, JsError> {
        let (width, height) = (canvas.width(), canvas.height());
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });
        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas))
            .map_err(failed)?;
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
                apply_limit_buckets: false,
            })
            .await
            .map_err(failed)?;
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                required_limits: adapter.limits(),
                ..wgpu::DeviceDescriptor::default()
            })
            .await
            .map_err(failed)?;
        let format = *surface
            .get_capabilities(&adapter)
            .formats
            .first()
            .ok_or_else(|| {
                device.destroy();
                JsError::new("The surface offers no format.")
            })?;
        let configuration = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode: wgpu::PresentMode::AutoVsync,
            desired_maximum_frame_latency: 2,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: vec![],
            color_space: wgpu::SurfaceColorSpace::default(),
        };
        surface.configure(&device, &configuration);
        let renderer = Renderer::new(
            &device,
            RendererOptions {
                use_cpu: false,
                antialiasing_support: AaSupport::area_only(),
                num_init_threads: None,
                pipeline_cache: None,
            },
        )
        .map_err(|error| {
            device.destroy();
            failed(error)
        })?;
        Ok(GpuTarget {
            view: target_view(&device, width, height),
            blitter: wgpu::util::TextureBlitter::new(&device, format),
            device,
            queue,
            surface,
            configuration,
            renderer,
            canvas: GpuCanvas {
                scene: Scene::new(),
                transform: Affine::IDENTITY,
                parts: HashMap::new(),
                waiting: Vec::new(),
                kept: 0,
            },
        })
    }

    /// Change the size of the surface, in pixels.
    pub(crate) fn resize(&mut self, width: u32, height: u32) {
        self.configuration.width = width;
        self.configuration.height = height;
        self.surface.configure(&self.device, &self.configuration);
        self.view = target_view(&self.device, width, height);
    }

    /// The canvas of the next frame, empty.
    pub(crate) fn begin(&mut self) -> &mut GpuCanvas {
        self.canvas.scene.reset();
        &mut self.canvas
    }

    /// Render the frame on the canvas and show it.
    pub(crate) fn finish(&mut self) -> Result<(), JsError> {
        let (width, height) = (self.configuration.width, self.configuration.height);
        self.renderer
            .render_to_texture(
                &self.device,
                &self.queue,
                &self.canvas.scene,
                &self.view,
                &RenderParams {
                    base_color: peniko::Color::TRANSPARENT,
                    width,
                    height,
                    antialiasing_method: AaConfig::Area,
                },
            )
            .map_err(failed)?;
        let (wgpu::CurrentSurfaceTexture::Success(frame)
        | wgpu::CurrentSurfaceTexture::Suboptimal(frame)) = self.surface.get_current_texture()
        else {
            return Err(JsError::new("The surface gave no texture."));
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        self.blitter
            .copy(&self.device, &mut encoder, &self.view, &view);
        self.queue.submit([encoder.finish()]);
        self.queue.present(frame);
        Ok(())
    }
}
