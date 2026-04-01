// cloum-tray — macOS menu bar companion for cloum
// Compile:  swiftc -O -o cloum-tray MenuBar.swift
// Or:       cloum tray install   (handles everything automatically)

import Cocoa
import Foundation

// MARK: - Config types (mirrors src/config/types.ts)

struct ClusterEntry: Codable {
    let name: String
    let provider: String
    let region: String
    let favorite: Bool?
    // GCP
    let project: String?
    let clusterName: String?
    let account: String?
    // AWS
    let profile: String?
    let roleArn: String?
    // Azure
    let resourceGroup: String?
    let subscription: String?
}

struct CloumConfig: Codable {
    let clusters: [ClusterEntry]
}

// MARK: - App Delegate

class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var configWatcher: DispatchSourceFileSystemObject?

    private var configPath: String {
        FileManager.default.homeDirectoryForCurrentUser.path
            + "/.config/cloum/clusters.json"
    }

    // MARK: Launch

    func applicationDidFinishLaunching(_: Notification) {
        setupStatusItem()
        buildMenu()
        startConfigWatcher()
    }

    // MARK: Status item

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        guard let button = statusItem.button else { return }
        if #available(macOS 11.0, *) {
            button.image = NSImage(
                systemSymbolName: "cloud.fill",
                accessibilityDescription: "Cloum"
            )
        } else {
            button.title = "⎈"
        }
        button.toolTip = "Cloum – Kubernetes Cluster Manager"
    }

    // MARK: Config loading

    private func loadConfig() -> [ClusterEntry] {
        guard
            let data = FileManager.default.contents(atPath: configPath),
            let cfg = try? JSONDecoder().decode(CloumConfig.self, from: data)
        else { return [] }
        return cfg.clusters
    }

    // MARK: kubectl context

    private func currentContext() -> String? {
        let task = Process()
        task.launchPath = "/usr/bin/env"
        task.arguments = ["kubectl", "config", "current-context"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = Pipe()
        guard (try? task.run()) != nil else { return nil }
        task.waitUntilExit()
        guard task.terminationStatus == 0 else { return nil }
        let raw = String(
            data: pipe.fileHandleForReading.readDataToEndOfFile(),
            encoding: .utf8
        )
        return raw?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Menu building

    @objc func buildMenu() {
        let menu = NSMenu()
        let clusters = loadConfig()

        // ── Header ──────────────────────────────────────────────────────────
        let header = NSMenuItem(title: "⎈  Cloum", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)

        if let ctx = currentContext() {
            let ctxItem = NSMenuItem(
                title: "  ctx: " + ctx,
                action: nil,
                keyEquivalent: ""
            )
            ctxItem.isEnabled = false
            menu.addItem(ctxItem)
        }

        menu.addItem(.separator())

        // ── Favourites ───────────────────────────────────────────────────────
        let favorites = clusters.filter { $0.favorite == true }
        if !favorites.isEmpty {
            let favHeader = NSMenuItem(title: "⭐  Favourites", action: nil, keyEquivalent: "")
            favHeader.isEnabled = false
            menu.addItem(favHeader)

            for (i, cluster) in favorites.enumerated() {
                let shortcut = i < 9 ? String(i + 1) : ""
                menu.addItem(makeClusterItem(cluster, shortcut: shortcut))
            }
            menu.addItem(.separator())
        }

        // ── Clusters by provider ─────────────────────────────────────────────
        let sections: [(String, String)] = [
            ("gcp", "GCP  (GKE)"),
            ("aws", "AWS  (EKS)"),
            ("azure", "Azure  (AKS)"),
        ]
        for section in sections {
            let id = section.0
            let label = section.1
            let group = clusters.filter { $0.provider == id }
            guard !group.isEmpty else { continue }
            let sectionItem = NSMenuItem(
                title: "── " + label + " ──",
                action: nil,
                keyEquivalent: ""
            )
            sectionItem.isEnabled = false
            menu.addItem(sectionItem)
            for cluster in group {
                menu.addItem(makeClusterItem(cluster, shortcut: ""))
            }
        }

        if !clusters.isEmpty { menu.addItem(.separator()) }

        if clusters.isEmpty {
            let emptyItem = NSMenuItem(
                title: "  No clusters configured",
                action: nil,
                keyEquivalent: ""
            )
            emptyItem.isEnabled = false
            menu.addItem(emptyItem)
            let addItem = NSMenuItem(
                title: "  Add with: cloum add <provider>",
                action: nil,
                keyEquivalent: ""
            )
            addItem.isEnabled = false
            menu.addItem(addItem)
            menu.addItem(.separator())
        }

        // ── Quick actions ────────────────────────────────────────────────────
        let refreshItem = NSMenuItem(
            title: "🔄  Refresh",
            action: #selector(buildMenu),
            keyEquivalent: "r"
        )
        refreshItem.target = self
        menu.addItem(refreshItem)

        let statusItem2 = NSMenuItem(
            title: "📊  Auth Status",
            action: #selector(showStatus),
            keyEquivalent: "s"
        )
        statusItem2.target = self
        menu.addItem(statusItem2)

        let listItem = NSMenuItem(
            title: "📋  List Clusters",
            action: #selector(listClusters),
            keyEquivalent: "l"
        )
        listItem.target = self
        menu.addItem(listItem)

        menu.addItem(.separator())

        let quitItem = NSMenuItem(
            title: "Quit Cloum Tray",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )
        menu.addItem(quitItem)

        statusItem.menu = menu
    }

    private func makeClusterItem(_ cluster: ClusterEntry, shortcut: String) -> NSMenuItem {
        let icon: String
        switch cluster.provider {
        case "gcp":   icon = "🔵"
        case "aws":   icon = "🟠"
        case "azure": icon = "🔷"
        default:      icon = "⚙️"
        }
        let title = icon + "  " + cluster.name + "  (" + cluster.region + ")"
        let item = NSMenuItem(
            title: title,
            action: #selector(connectCluster(_:)),
            keyEquivalent: shortcut
        )
        item.representedObject = cluster.name
        item.target = self
        return item
    }

    // MARK: Actions

    @objc private func connectCluster(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        runInTerminal("cloum connect " + name)
    }

    @objc private func showStatus() {
        runInTerminal("cloum status")
    }

    @objc private func listClusters() {
        runInTerminal("cloum list")
    }

    // MARK: Terminal launch

    private func runInTerminal(_ command: String) {
        // Escape the command for embedding in AppleScript
        let safe = command
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")

        // Prefer iTerm2 when available
        if NSWorkspace.shared.urlForApplication(
            withBundleIdentifier: "com.googlecode.iterm2"
        ) != nil {
            let script =
                "tell application \"iTerm\" to activate\n" +
                "tell application \"iTerm\" to tell current window to " +
                "create tab with default profile\n" +
                "tell application \"iTerm\" to tell current window to " +
                "tell current session to write text \"" + safe + "\""
            var err: NSDictionary?
            if let obj = NSAppleScript(source: script) {
                obj.executeAndReturnError(&err)
                if err == nil { return }
            }
        }

        // Fall back to Terminal.app
        let script =
            "tell application \"Terminal\" to activate\n" +
            "tell application \"Terminal\" to do script \"" + safe + "\""
        var err: NSDictionary?
        NSAppleScript(source: script)?.executeAndReturnError(&err)
    }

    // MARK: Config file watcher

    private func startConfigWatcher() {
        guard FileManager.default.fileExists(atPath: configPath) else { return }
        let fd = open(configPath, O_EVTONLY)
        guard fd >= 0 else { return }
        let src = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: .write,
            queue: .main
        )
        src.setEventHandler { [weak self] in self?.buildMenu() }
        src.setCancelHandler { close(fd) }
        src.resume()
        configWatcher = src
    }
}

// MARK: - Entry point

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)   // no Dock icon
app.run()
