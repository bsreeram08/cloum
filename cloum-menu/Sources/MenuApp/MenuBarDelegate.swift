import AppKit

/// Menu bar icon states
enum MenuIcon: String {
    case connected    = "🟢"
    case disconnected = "⚪"
    case syncing      = "🔄"
    case error        = "🔴"

    var menuIcon: NSImage {
        let font = NSFont.systemFont(ofSize: 14)
        let attrs: [NSAttributedString.Key: Any] = [.font: font]
        let size = (rawValue as NSString).size(withAttributes: attrs)
        let img = NSImage(size: NSSize(width: 20, height: 18))
        img.lockFocus()
        (rawValue as NSString).draw(at: .zero, withAttributes: attrs)
        img.unlockFocus()
        img.isTemplate = false
        return img
    }
}

/// Main menu bar controller
final class MenuBarController: NSObject {

    private var statusItem: NSStatusItem!
    private var menu: NSMenu!

    // ---- menu items (rebuilt on refresh) ----
    private var clustersMenu: NSMenu!
    private var statusMenuItem: NSMenuItem!
    private var syncMenuItem: NSMenuItem!
    private var authMenuItem: NSMenuItem!

    private var state: AppState = .disconnected

    struct AppState {
        var icon: MenuIcon = .disconnected
        var clusters: [ClusterItem] = []
        var favorites: [ClusterItem] = []
        var auth: AuthStatus?
        var syncEnabled: Bool = false
        var lastSync: String?
        var error: String?
    }

    struct ClusterItem: Identifiable {
        let id = UUID()
        let name: String
        let provider: String  // "gcp" | "aws" | "azure"
        let region: String
        let isFavorite: Bool
    }

    struct AuthStatus {
        var gcp: Bool = false; var aws: Bool = false; var azure: Bool = false
        var gcpIdentity: String?; var awsIdentity: String?; var azureIdentity: String?
    }

    override init() {
        super.init()
        setupStatusItem()
        buildMenu()
        refreshDaemonState()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.menu = nil // we'll attach on click
        statusItem.button?.image = MenuIcon.disconnected.menuIcon
        statusItem.button?.action = #selector(statusItemClicked)
        statusItem.button?.target = self
    }

    @objc private func statusItemClicked() {
        refreshDaemonState()
        statusItem.menu = buildMenu()
        statusItem.button?.performClick(nil)
    }

    // -------------------------------------------------------------------------
    // Build the full menu
    // -------------------------------------------------------------------------

    private func buildMenu() -> NSMenu {
        let m = NSMenu()

        // -- Status header --
        let title: String
        switch state.icon {
        case .connected:  title = "cloum  \(MenuIcon.connected.rawValue)  Connected"
        case .error:      title = "cloum  \(MenuIcon.error.rawValue)  Error"
        case .syncing:    title = "cloum  \(MenuIcon.syncing.rawValue)  Syncing"
        case .disconnected: title = "cloum  \(MenuIcon.disconnected.rawValue)  Disconnected"
        }
        let hdr = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        hdr.isEnabled = false
        m.addItem(hdr)
        m.addItem(NSMenuItem.separator())

        // -- Favorites section (★ at top) --
        if !state.favorites.isEmpty {
            let favHeader = NSMenuItem(title: "★  Favorites", action: nil, keyEquivalent: "")
            favHeader.isEnabled = false
            m.addItem(favHeader)
            for cluster in state.favorites {
                m.addItem(clusterMenuItem(cluster, starred: true))
            }
            m.addItem(NSMenuItem.separator())
        }

        // -- All Clusters submenu --
        let clustersSubmenu = NSMenu()
        let clustersHeader = NSMenuItem(title: "All Clusters", action: nil, keyEquivalent: "")
        clustersHeader.submenu = clustersSubmenu

        if state.clusters.isEmpty {
            let empty = NSMenuItem(title: "  No clusters", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            clustersSubmenu.addItem(empty)
        } else {
            for cluster in state.clusters {
                clustersSubmenu.addItem(clusterMenuItem(cluster, starred: false))
            }
        }

        m.addItem(clustersHeader)
        clustersHeader.submenu = clustersSubmenu

        // -- Connect to new cluster --
        m.addItem(NSMenuItem.separator())
        let addItem_ = NSMenuItem(title: "Discover New Cluster...", action: #selector(discoverClusters), keyEquivalent: "d")
        addItem_.keyEquivalentModifierMask = [.command]
        addItem_.target = self
        m.addItem(addItem_)

        m.addItem(NSMenuItem.separator())

        // -- Auth status --
        if let auth = state.auth {
            let authHeader = NSMenuItem(title: "Auth Status", action: nil, keyEquivalent: "")
            authHeader.isEnabled = false
            m.addItem(authHeader)

            func authRow(provider: String, ok: Bool, identity: String?) -> NSMenuItem {
                let icon = ok ? "✅" : "❌"
                let id = identity ?? (ok ? "authenticated" : "not set")
                return NSMenuItem(title: "  \(icon) \(provider.uppercased()): \(id)", action: nil, keyEquivalent: "")
            }
            authHeader.submenu = NSMenu()
            authHeader.submenu?.addItem(authRow(provider: "GCP", ok: auth.gcp, identity: auth.gcpIdentity))
            authHeader.submenu?.addItem(authRow(provider: "AWS", ok: auth.aws, identity: auth.awsIdentity))
            authHeader.submenu?.addItem(authRow(provider: "Azure", ok: auth.azure, identity: auth.azureIdentity))
            authHeader.submenu?.addItem(NSMenuItem.separator())
            let reauth = NSMenuItem(title: "Re-authenticate All...", action: #selector(reauthAll), keyEquivalent: "")
            reauth.target = self
            authHeader.submenu?.addItem(reauth)
        }

        // -- Cloud Sync --
        let syncHeader = NSMenuItem(title: "Cloud Sync", action: nil, keyEquivalent: "")
        syncHeader.submenu = NSMenu()
        let syncEnabled = NSMenuItem(
            title: state.syncEnabled ? "✅  Sync Enabled" : "❌  Sync Disabled",
            action: nil, keyEquivalent: ""
        )
        syncEnabled.isEnabled = false
        syncHeader.submenu?.addItem(syncEnabled)

        if let last = state.lastSync {
            syncHeader.submenu?.addItem(NSMenuItem(title: "  Last: \(last)", action: nil, keyEquivalent: ""))
        }

        syncHeader.submenu?.addItem(NSMenuItem.separator())
        let syncNow = NSMenuItem(title: "Sync Now", action: #selector(syncNow), keyEquivalent: "s")
        syncNow.keyEquivalentModifierMask = [.command]
        syncNow.target = self
        syncHeader.submenu?.addItem(syncNow)
        syncHeader.submenu?.addItem(NSMenuItem(title: "Configure Sync...", action: #selector(configureSync), keyEquivalent: ""))
        syncHeader.submenu?.lastItem?.target = self
        m.addItem(syncHeader)

        m.addItem(NSMenuItem.separator())

        // -- Helper daemon controls --
        let daemonHeader = NSMenuItem(title: "Background Helper", action: nil, keyEquivalent: "")
        daemonHeader.submenu = NSMenu()
        daemonHeader.submenu?.addItem(NSMenuItem(title: "Start Helper", action: #selector(startHelper), keyEquivalent: ""))
        daemonHeader.submenu?.lastItem?.target = self
        daemonHeader.submenu?.addItem(NSMenuItem(title: "Stop Helper", action: #selector(stopHelper), keyEquivalent: ""))
        daemonHeader.submenu?.lastItem?.target = self
        daemonHeader.submenu?.addItem(NSMenuItem.separator())
        daemonHeader.submenu?.addItem(NSMenuItem(title: "Restart Helper", action: #selector(restartHelper), keyEquivalent: ""))
        daemonHeader.submenu?.lastItem?.target = self
        m.addItem(daemonHeader)

        // -- Error display --
        if let err = state.error {
            m.addItem(NSMenuItem.separator())
            let errItem = NSMenuItem(title: "⚠️  \(err)", action: nil, keyEquivalent: "")
            errItem.isEnabled = false
            m.addItem(errItem)
        }

        m.addItem(NSMenuItem.separator())

        // -- Preferences / Quit --
        let prefs = NSMenuItem(title: "Preferences...", action: #selector(openPreferences), keyEquivalent: ",")
        prefs.target = self
        m.addItem(prefs)
        let quit = NSMenuItem(title: "Quit cloum", action: #selector(quit), keyEquivalent: "q")
        quit.keyEquivalentModifierMask = [.command]
        quit.target = self
        m.addItem(quit)

        return m
    }

    // -------------------------------------------------------------------------
    // Cluster menu items
    // -------------------------------------------------------------------------

    private func clusterMenuItem(_ cluster: ClusterItem, starred: Bool) -> NSMenuItem {
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

        // Number shortcuts for first 9 favorites
        if starred, let idx = state.favorites.firstIndex(where: { $0.id == cluster.id }), idx < 9 {
            item.keyEquivalent = "\(idx + 1)"
            item.keyEquivalentModifierMask = [.command]
        }

        return item
    }

    @objc private func connectToCluster(_ sender: NSMenuItem) {
        guard let cluster = sender.representedObject as? ClusterItem else { return }
        NSLog("cloum-menu: connect to \(cluster.name)")

        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
        task.arguments = ["/home/sreeram/cloum/src/index.ts", "connect", cluster.name]
        task.environment = ProcessInfo.processInfo.environment

        do {
            try task.run()
            // Refresh icon on completion
            task.waitUntilExit()
            refreshDaemonState()
        } catch {
            NSLog("cloum-menu: failed to connect: \(error)")
        }
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

        DispatchQueue.global(qos: .userInitiated).async {
            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
            task.arguments = ["/home/sreeram/cloum/src/index.ts", "sync", "--push"]
            try? task.run()
            task.waitUntilExit()

            DispatchQueue.main.async {
                self.refreshDaemonState()
            }
        }
    }

    @objc private func configureSync() {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/home/sreeram/.bun/bin/bun")
        task.arguments = ["/home/sreeram/cloum/src/index.ts", "config", "--json"]
        task.environment = ProcessInfo.processInfo.environment
        try? task.run()
    }

    @objc private func startHelper()  { runHelper(["start"]) }
    @objc private func stopHelper()   { runHelper(["stop"]) }
    @objc private func restartHelper(){ runHelper(["stop"]); DispatchQueue.main.asyncAfter(deadline: .now()+1) { self.runHelper(["start"]) } }

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

    // -------------------------------------------------------------------------
    // Daemon state refresh via Unix socket
    // -------------------------------------------------------------------------

    private func refreshDaemonState() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            var newState = self.state

            // Try RPC calls over Unix socket
            if let clusters = self.socketCall("list_clusters", [:]) as? [[String: Any]] {
                newState.clusters = clusters.map { c in
                    ClusterItem(
                        name: c["name"] as? String ?? "",
                        provider: c["provider"] as? String ?? "",
                        region: c["region"] as? String ?? "",
                        isFavorite: c["isFavorite"] as? Bool ?? false
                    )
                }
                newState.favorites = newState.clusters.filter { $0.isFavorite }
                newState.icon = .connected
            } else {
                newState.icon = .disconnected
                newState.clusters = []
                newState.favorites = []
            }

            if let auth = self.socketCall("check_auth", [:]) as? [String: Any] {
                var a = AuthStatus()
                if let gcp = auth["gcp"] as? [String: Any] {
                    a.gcp = gcp["authenticated"] as? Bool ?? false
                    a.gcpIdentity = gcp["identity"] as? String
                }
                if let aws = auth["aws"] as? [String: Any] {
                    a.aws = aws["authenticated"] as? Bool ?? false
                    a.awsIdentity = aws["identity"] as? String
                }
                if let azure = auth["azure"] as? [String: Any] {
                    a.azure = azure["authenticated"] as? Bool ?? false
                    a.azureIdentity = azure["identity"] as? String
                }
                newState.auth = a
            }

            if let sync = self.socketCall("sync_status", [:]) as? [String: Any] {
                newState.syncEnabled = sync["enabled"] as? Bool ?? false
                newState.lastSync = sync["lastSync"] as? String
            }

            newState.error = nil

            DispatchQueue.main.async {
                self.state = newState
                self.updateIcon()
            }
        }
    }

    private func socketCall(_ method: String, _ params: [String: Any]) -> Any? {
        let sockPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".cloum/helper.sock").path

        guard FileManager.default.fileExists(atPath: sockPath) else { return nil }

        let request: [String: Any] = [
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params
        ]

        guard let data = try? JSONSerialization.data(withJSONObject: request) else { return nil }

        var result: Any?
        let conn = CFHostCreateWithName(nil, sockPath as CFString).takeRetainedValue()
        var addr = sockaddr_un()
        addr.sun_family = sa_family_t(AF_UNIX)

        // Use a simpler approach: NEPipe + CFStream
        // For now, fall back to NSTask direct
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/nc")
        task.arguments = ["-U", sockPath]
        task.standardInput = Pipe()
        task.standardOutput = Pipe()

        let stdin = task.standardInput as? Pipe
        let stdout = task.standardOutput as? Pipe

        if let nc = try? FileHandle(forWritingTo: URL(fileURLWithPath: "/dev/stdin")) {
            nc.write(data)
            nc.write(Data([0x0A])) // newline
        }

        return nil // TODO: implement proper socket call
    }

    private func updateIcon() {
        statusItem.button?.image = state.icon.menuIcon
    }
}

// -------------------------------------------------------------------------
// AppKit integration
// -------------------------------------------------------------------------

final class MenuBarDelegate: NSObject, NSApplicationDelegate {

    private var controller: MenuBarController!

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Ensure we are a menu bar app (not in dock)
        NSApp.setActivationPolicy(.accessory)

        controller = MenuBarController()
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Cleanup if needed
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false // menu bar app stays alive
    }
}
