//! Which WebGL renderers draw in software, by the names that browsers give them.
//! A software renderer draws the largest picture at about a second a frame, so
//! the CPU painter paints in its place (ADR 0074).

/// Words that only the name of a software renderer holds, in lower case:
/// `SwiftShader` of Chrome, llvmpipe, softpipe and lavapipe of Mesa, the Basic
/// Render Driver of Windows, and Apple's Software Renderer.
const SOFTWARE: [&str; 6] = [
    "swiftshader",
    "llvmpipe",
    "softpipe",
    "lavapipe",
    "basic render driver",
    "software",
];

/// Whether a renderer's name says that it draws in software.
pub(crate) fn is_software(renderer: &str) -> bool {
    let renderer = renderer.to_lowercase();
    SOFTWARE.iter().any(|word| renderer.contains(word))
}

#[cfg(test)]
mod tests {
    use super::is_software;

    #[test]
    fn a_software_renderer_is_known_by_its_name() {
        for name in [
            "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)",
            "ANGLE (Mesa, llvmpipe (LLVM 19.1.7, 256 bits), OpenGL 4.5)",
            "llvmpipe (LLVM 15.0.7, 256 bits)",
            "ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)",
            "Apple Software Renderer",
        ] {
            assert!(is_software(name), "{name}");
        }
    }

    #[test]
    fn a_hardware_renderer_paints() {
        for name in [
            "ANGLE (NVIDIA, Vulkan 1.4.329 (NVIDIA NVIDIA GeForce RTX 4090 (0x00002684)), NVIDIA)",
            "NVIDIA GeForce GTX 980, or similar",
            "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
            "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)",
            "Mali-G78",
        ] {
            assert!(!is_software(name), "{name}");
        }
    }
}
