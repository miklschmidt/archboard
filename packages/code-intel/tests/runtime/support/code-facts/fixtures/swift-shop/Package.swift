// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Shop",
    products: [
        .library(name: "ShopCore", targets: ["Core"]),
        .plugin(name: "ShopPlugin", targets: ["ShopPlugin"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.0.0"),
    ],
    targets: [
        .target(name: "Core", path: "Sources/Core/"),
        .target(name: "Util"),
        .executableTarget(
            name: "App",
            dependencies: [
                "Core",
                .target(name: "Util"),
                .product(name: "ArgumentParser", package: "swift-argument-parser"),
            ]
        ),
        .testTarget(name: "CoreTests", dependencies: ["Core"]),
        .plugin(name: "ShopPlugin", capability: .buildTool()),
    ]
)
