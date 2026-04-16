import AppKit

// Entry point — NSApplication.shared must run on main thread
let app = NSApplication.shared
let delegate = MenuBarDelegate()
app.delegate = delegate
app.run()
