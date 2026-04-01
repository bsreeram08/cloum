import AppKit

// MARK: - Menu Icon

enum MenuIcon: String {
    case connected    = "🟢"
    case disconnected = "⚪"
    case syncing      = "🔄"
    case error        = "🔴"

    var menuImage: NSImage {
        let font = NSFont.systemFont(ofSize: 14)
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        let img = NSImage(size: NSSize(width: 20, height: 18))
        img.lockFocus()
        (rawValue as NSString).draw(at: .zero, withAttributes: attrs)
        img.unlockFocus()
        img.isTemplate = false
        return img
    }
}

// MARK: - Types

struct ClusterItem: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let provider: String
    let region: String
    let isFavorite: Bool
}

struct AuthStatus {
    var gcp = false; var aws = false; var azure = false
    var gcpIdentity: String?; var awsIdentity: String?; var azureIdentity: String?
}

struct AppState {
    var icon: MenuIcon = .disconnected
    var clusters: [ClusterItem] = []
    var favorites: [ClusterItem] = []
    var auth: AuthStatus?
    var syncEnabled = false
    var lastSync: String?
    var error: String?
}

// MARK: - Menu Bar Controller

final class MenuBarController: NSObject {

    private var statusItem: NSStatusItem!
    private var state = AppState()

    override init() {
        super.init()
        setupStatusItem()
        refreshDaemonState()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.image = MenuIcon.disconnected.menuImage
        statusItem.button?.action = #selector(statusItemClicked)
        statusItem.button?.target = self
    }

    @objc private func statusItemClicked() {
        refreshDaemonState()
        statusItem.menu = buildMenu()
        statusItem.button?.performClick(nil)
    }

    // MARK: - Build Menu

    private func buildMenu() -> NSMenu {
        let m = NSMenu()

        let title: String
        switch state.icon {
        case .connected:   title = "cloum  \(MenuIcon.connected.rawValue)  Connected"
        case .error:       title = "cloum  \(MenuIcon.error.rawValue)  Error"
        case .syncing:     title = "cloum  \(MenuIcon.syncing.rawValue)  Syncing"
        case .disconnected: title = "cloum  \(MenuIcon.disconnected.rawValue)  Disconnected"
        }
        let hdr = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        hdr.isEnabled = false
        m.addItem(hdr)
        m.addItem(NSMenuItem.separator())

        // Favorites
        if !state.favorites.isEmpty {
            let favHdr = NSMenuItem(title: "★  Favorites", action: nil, keyEquivalent: "")
            favHdr.isEnabled = false
            m.addItem(favHdr)
            for (idx, cluster) in state.favorites.prefix(9).enumerated() {
                m.addItem(clusterMenuItem(cluster, starred: true, idx: idx))
            }
            m.addItem(NSMenuItem.separator())
        }

        // All Clusters submenu
        let submenu = NSMenu()
        let allHdr = NSMenuItem(title: "All Clusters", action: nil, keyEquivalent: "")
        allHdr.submenu = submenu

        if state.clusters.isEmpty {
            let empty = NSMenuItem(title: "  No clusters", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            submenu.addItem(empty)
        } else {
            for cluster in state.clusters {
                submenu.addItem(clusterMenuItem(cluster, starred: false, idx: nil))
            }
        }

        m.addItem(allHdr)

        m.addItem(NSMenuItem.separator())
        let addItem_ = NSMenuItem(title: "Discover New Cluster...", action: #selector(discoverClusters), keyEquivalent: "d")
        addItem_.keyEquivalentModifierMask = [.command]
        addItem_.target = self
        m.addItem(addItem_)

        m.addItem(NSMenuItem.separator())

        // Auth
        if let auth = state.auth {
            let authHdr = NSMenuItem(title: "Auth Status", action: nil, keyEquivalent: "")
            authHdr.isEnabled = false
            m.addItem(authHdr)
            authHdr.submenu = NSMenu()

            authHdr.submenu?.addItem(authRow("GCP",   ok: auth.gcp,   identity: auth.gcpIdentity))
            authHdr.submenu?.addItem(authRow("AWS",   ok: auth.aws,   identity: auth.awsIdentity))
            authHdr.submenu?.addItem(authRow("Azure", ok: auth.azure, identity: auth.azureIdentity))
            authHdr.submenu?.addItem(NSMenuItem.separator())
            let reauth = NSMenuItem(title: "Re-authenticate All...", action: #selector(reauthAll), keyEquivalent: "")
            reauth.target = self
            authHdr.submenu?.addItem(reauth)
        }

        // Cloud Sync
        let syncHdr = NSMenuItem(title: "Cloud Sync", action: nil, keyEquivalent: "")
        syncHdr.submenu = NSMenu()
        syncHdr.submenu?.addItem(NSMenuItem(
            title: state.syncEnabled ? "✅  Sync Enabled" : "❌  Sync Disabled",
            action: nil, keyEquivalent: ""
        ))
        if let last = state.lastSync {
            syncHdr.submenu?.addItem(NSMenuItem(title: "  Last: \(last)", action: nil, keyEquivalent: ""))
        }
        syncHdr.submenu?.addItem(NSMenuItem.separator())
        let syncNow = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "s")
        syncNow.keyEquivalentModifierMask = [.command]
        syncNow.target = self
        syncHdr.submenu?.addItem(syncNow)
        m.addItem(syncHdr)

        m.addItem(NSMenuItem.separator())

        // Helper controls
        let daemonHdr = NSMenuItem(title: "Background Helper", action: nil, keyEquivalent: "")
        daemonHdr.submenu = NSMenu()
        let startItem = NSMenuItem(title: "Start Helper", action: #selector(startHelper), keyEquivalent: "")
        startItem.target = self
        daemonHdr.submenu?.addItem(startItem)
        let stopItem = NSMenuItem(title: "Stop Helper", action: #selector(stopHelper), keyEquivalent: "")
        stopItem.target = self
        daemonHdr.submenu?.addItem(stopItem)
        daemonHdr.submenu?.addItem(NSMenuItem.separator())
        let restartItem = NSMenuItem(title: "Restart Helper", action: #selector(restartHelper), keyEquivalent: "")
        restartItem.target = self
        daemonHdr.submenu?.addItem(restartItem)
        m.addItem(daemonHdr)

        // Error
        if let err = state.error {
            m.addItem(NSMenuItem.separator())
            let errItem = NSMenuItem(title: "⚠️  \(err)", action: nil, keyEquivalent: "")
            errItem.isEnabled = false
            m.addItem(errItem)
        }

        m.addItem(NSMenuItem.separator())

        let prefs = NSMenuItem(title: "Preferences...", action: #selector(openPreferences), keyEquivalent: ",")
        prefs.target = self
        m.addItem(prefs)
        let quit = NSMenuItem(title: "Quit cloum", action: #selector(quit), keyEquivalent: "q")
        quit.keyEquivalentModifierMask = [.command]
        quit.target = self
        m.addItem(quit)

        return m
    }

    private func authRow(_ provider: String, ok: Bool, identity: String?) -> NSMenuItem {
        let icon = ok ? "✅" : "❌"
        let id = identity ?? (ok ? "authenticated" : "not set")
        return NSMenuItem(title: "  \(icon) \(provider): \(id)", action: nil, keyEquivalent: "")
    }

    private func clusterMenuItem(_ cluster: ClusterItem, starred: Bool, idx: Int?) -> NSMenuItem {
        let icon: String
        switch cluster.provider {
        case "gcp":   icon = "🔵"
        case "aws":   icon = "🟠"
        case "azure": icon = "🔷"
        default:      icon = "☁️"
        }
        let star = starred ? "★" : ""
        let title = "  \(icon)  \(cluster.name)\(star)  \(cluster.region)"
        let item = NSMenuItem(title: title, action: #selector(connectToCluster(_:)), keyEquivalent: "")
        item.target = self
        item.representedObject = cluster

        if starred, let num = idx {
            item.keyEquivalent = "\(num + 1)"
            item.keyEquivalentModifierMask = [.command]
        }

        return item
    }

    // MARK: - Actions

    @objc private func connectToCluster(_ sender: NSMenuItem) {
        guard let cluster = sender.representedObject as? ClusterItem else { return }

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
        task.arguments = ["/home/sreeram/cloum/src/index.ts", "connect", cluster.name]
        try? task.run()
        task.waitUntilExit()
        refreshDaemonState()
    }

    @objc private func discoverClusters() {
        NSWorkspace.shared.open(URL(string: "cloum://discover")!)
    }

    @objc private func reauthAll() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
        task.arguments = ["/home/sreeram/cloum/src/index.ts", "clean", "--all"]
        try? task.run()
    }

    @objc private func syncNow() {
        state.icon = .syncing
        updateIcon()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
            task.arguments = ["/home/sreeram/cloum/src/index.ts", "sync", "--push"]
            try? task.run()
            task.waitUntilExit()

            DispatchQueue.main.async {
                self?.refreshDaemonState()
            }
        }
    }

    @objc private func startHelper()  { runHelper(["start"]) }
    @objc private func stopHelper()  { runHelper(["stop"]) }
    @objc private func restartHelper() {
        runHelper(["stop"])
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.runHelper(["start"]) }
    }

    private func runHelper(_ args: [String]) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
        task.arguments = ["/home/sreeram/cloum/src/index.ts", "helper"] + args
        try? task.run()
    }

    @objc private func openPreferences() {
        NSWorkspace.shared.open(URL(string: "cloum://config")!)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    // MARK: - Daemon State

    private func refreshDaemonState() {
        // For now, run cloum commands directly.
        // A proper Unix-socket implementation would go here.
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
        task.arguments = ["/home/sreeram/cloum/src/index.ts", "list"]
        task.standardOutput = Pipe()

        do {
            try task.run()
            task.waitUntilExit()

            let data = (task.standardOutput as? Pipe)?.fileHandleForReading.readDataToEndOfFile()
            let output = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""

            // Simple parse — treat each non-empty line as a cluster name
            // Format: "  🔵 prod-gke    us-central1  prod"
            let lines = output.split(separator: "\n").map(String.init)
            var clusters: [ClusterItem] = []
            for line in lines where !line.isEmpty && !line.contains("No clusters") {
                let parts = line.split(separator: " ").compactMap { String($0) }.filter { !$0.isEmpty }
                if let name = parts.last {
                    let provider = line.contains("🔵") && !line.contains("Azure") ? "gcp"
                        : line.contains("🟠") ? "aws"
                        : line.contains("🔷") ? "azure" : "unknown"
                    clusters.append(ClusterItem(name: name, provider: provider, region: "unknown", isFavorite: false))
                }
            }

            DispatchQueue.main.async { [weak self] in
                guard let self = self else { return }
                self.state.clusters = clusters
                self.state.favorites = clusters.filter { $0.isFavorite }
                self.state.icon = clusters.isEmpty ? .disconnected : .connected
                self.updateIcon()
            }
        } catch {
            DispatchQueue.main.async { [weak self] in
                self?.state.icon = .error
                self?.updateIcon()
            }
        }
    }

    private func updateIcon() {
        statusItem.button?.image = state.icon.menuImage
    }
}

// MARK: - App Delegate

final class MenuBarDelegate: NSObject, NSApplicationDelegate {

    private var controller: MenuBarController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        controller = MenuBarController()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }
}
