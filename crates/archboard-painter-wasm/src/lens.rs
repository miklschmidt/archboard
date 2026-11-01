//! The lens: the last step of a frame in motion, between the texture Vello drew
//! and the surface. It keeps a box in focus and lets the rest fall away. A frame
//! at rest never comes here, so a picture at rest is what Vello drew.

use archboard_paint::canvas::Lens;
use archboard_scene::geometry::Rect;
use peniko::Color;
use wgpu::util::{BufferInitDescriptor, DeviceExt as _};

/// How many times a frame is halved: the blur of the last level is the most the
/// lens can show.
const LEVELS: u32 = 6;

/// How a level holds its colours: squared, they need more than eight bits on a
/// dark ground.
const LEVEL_FORMAT: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

/// The floats of `View` in `lens.wgsl`.
const VIEW_FLOATS: usize = 12;

/// The numbers of a lens as the shader reads them.
#[expect(
    clippy::cast_possible_truncation,
    reason = "a shader's numbers are f32"
)]
fn view_of(lens: &Lens, ground: Color) -> [f32; VIEW_FLOATS] {
    let mut view = [0.0; VIEW_FLOATS];
    if let Some(focus) = lens.focus {
        let Rect {
            x,
            y,
            width,
            height,
        } = focus.place;
        view[0] = (x + width / 2.0) as f32;
        view[1] = (y + height / 2.0) as f32;
        view[2] = (width / 2.0) as f32;
        view[3] = (height / 2.0) as f32;
        view[4] = focus.radius.min(width / 2.0).min(height / 2.0) as f32;
        view[5] = focus.soft.max(1.0) as f32;
    } else {
        view[5] = 1.0;
    }
    view[6] = lens.blur as f32;
    view[7] = lens.sink as f32;
    view[8..11].copy_from_slice(&ground.components[..3]);
    view[11] = lens.smear as f32;
    view
}

/// What every lens of one surface format shares.
pub(crate) struct LensPipelines {
    first: wgpu::RenderPipeline,
    down: wgpu::RenderPipeline,
    show: wgpu::RenderPipeline,
    down_layout: wgpu::BindGroupLayout,
    show_layout: wgpu::BindGroupLayout,
    filtered: wgpu::Sampler,
}

/// A texture a shader reads, at a binding.
fn read_texture(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: true },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

/// The sampler a shader reads levels through, at a binding.
fn read_sampler(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    }
}

/// A pipeline that covers its target with one fragment entry of the shader.
fn pipeline(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::BindGroupLayout,
    entry: &str,
    format: wgpu::TextureFormat,
) -> wgpu::RenderPipeline {
    let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: None,
        bind_group_layouts: &[Some(layout)],
        immediate_size: 0,
    });
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: None,
        layout: Some(&pipeline_layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("whole"),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState::default(),
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some(entry),
            compilation_options: wgpu::PipelineCompilationOptions::default(),
            targets: &[Some(format.into())],
        }),
        multiview_mask: None,
        cache: None,
    })
}

impl LensPipelines {
    /// The pipelines of a lens that lands on surfaces of a format.
    pub(crate) fn new(device: &wgpu::Device, format: wgpu::TextureFormat) -> LensPipelines {
        let shader = device.create_shader_module(wgpu::include_wgsl!("lens.wgsl"));
        let down_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[read_texture(0), read_sampler(1)],
        });
        let show_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                read_texture(0),
                read_sampler(1),
                read_texture(2),
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        LensPipelines {
            first: pipeline(device, &shader, &down_layout, "first", LEVEL_FORMAT),
            down: pipeline(device, &shader, &down_layout, "down", LEVEL_FORMAT),
            show: pipeline(device, &shader, &show_layout, "show", format),
            filtered: device.create_sampler(&wgpu::SamplerDescriptor {
                mag_filter: wgpu::FilterMode::Linear,
                min_filter: wgpu::FilterMode::Linear,
                ..wgpu::SamplerDescriptor::default()
            }),
            down_layout,
            show_layout,
        }
    }
}

/// The levels of one frame size, and what draws them.
pub(crate) struct LensLevels {
    /// Each level as a target, and what it reads.
    levels: Vec<(wgpu::TextureView, wgpu::BindGroup)>,
    show: wgpu::BindGroup,
    view: wgpu::Buffer,
}

impl LensLevels {
    /// The levels of a frame.
    pub(crate) fn new(
        device: &wgpu::Device,
        pipelines: &LensPipelines,
        frame: &wgpu::TextureView,
        (width, height): (u32, u32),
    ) -> LensLevels {
        let (width, height) = ((width / 2).max(1), (height / 2).max(1));
        let count = LEVELS.min(width.max(height).ilog2() + 1);
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: None,
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: count,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: LEVEL_FORMAT,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let level = |base_mip_level| {
            texture.create_view(&wgpu::TextureViewDescriptor {
                base_mip_level,
                mip_level_count: Some(1),
                ..wgpu::TextureViewDescriptor::default()
            })
        };
        let reads = |source: &wgpu::TextureView| {
            device.create_bind_group(&wgpu::BindGroupDescriptor {
                label: None,
                layout: &pipelines.down_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: wgpu::BindingResource::TextureView(source),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::Sampler(&pipelines.filtered),
                    },
                ],
            })
        };
        let levels = (0..count)
            .map(|at| {
                let source = at.checked_sub(1).map(level);
                (level(at), reads(source.as_ref().unwrap_or(frame)))
            })
            .collect();
        let view = device.create_buffer_init(&BufferInitDescriptor {
            label: None,
            contents: &[0; VIEW_FLOATS * size_of::<f32>()],
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });
        let whole = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let show = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipelines.show_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(frame),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::Sampler(&pipelines.filtered),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&whole),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: view.as_entire_binding(),
                },
            ],
        });
        LensLevels { levels, show, view }
    }

    /// Put a frame on a surface through a lens.
    pub(crate) fn draw(
        &self,
        pipelines: &LensPipelines,
        (queue, encoder): (&wgpu::Queue, &mut wgpu::CommandEncoder),
        surface: &wgpu::TextureView,
        (lens, ground): (&Lens, Color),
    ) {
        let numbers: Vec<u8> = view_of(lens, ground)
            .iter()
            .flat_map(|number| number.to_ne_bytes())
            .collect();
        queue.write_buffer(&self.view, 0, &numbers);
        for (at, (target, reads)) in self.levels.iter().enumerate() {
            let shape = if at == 0 {
                &pipelines.first
            } else {
                &pipelines.down
            };
            cover(encoder, target, shape, reads);
        }
        cover(encoder, surface, &pipelines.show, &self.show);
    }
}

/// Cover a target with a pipeline.
fn cover(
    encoder: &mut wgpu::CommandEncoder,
    target: &wgpu::TextureView,
    pipeline: &wgpu::RenderPipeline,
    reads: &wgpu::BindGroup,
) {
    let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
        label: None,
        color_attachments: &[Some(wgpu::RenderPassColorAttachment {
            view: target,
            depth_slice: None,
            resolve_target: None,
            ops: wgpu::Operations {
                load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                store: wgpu::StoreOp::Store,
            },
        })],
        depth_stencil_attachment: None,
        timestamp_writes: None,
        occlusion_query_set: None,
        multiview_mask: None,
    });
    pass.set_pipeline(pipeline);
    pass.set_bind_group(0, reads, &[]);
    pass.draw(0..3, 0..1);
}
