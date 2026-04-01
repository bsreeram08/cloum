// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "cloum-menu",
  platforms: [.macOS(.v14)],
  products: [
    .executable(
      name: "cloum-menu",
      targets: ["MenuApp"]
    ),
  ],
  dependencies: [],
  targets: [
    .executableTarget(
      name: "MenuApp",
      dependencies: [],
      path: "Sources/MenuApp",
      resources: [.process("Resources")]
    ),
  ]
)

