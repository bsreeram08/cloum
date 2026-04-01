import AppKit
import Carbon

/// Global hotkey registration via Carbon Events API (CGEvent tap alternative).
/// Registers ⌘⇧K globally to bring up the cloum quick-connect palette.
final class GlobalHotkeyMonitor {

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?

    static let shared = GlobalHotkeyMonitor()

    private init() {}

    func register() {
        // ⌘⇧K  keycode 40 (K) with modifiers: cmdKey + shiftKey
        let hotkeyID = CGEventHotKeyID(signature: OSType(0x434C554D), id: 1) // "CLUM"

        var eventSpec = CGEventHotKey()
        eventSpec.keyID = hotkeyID
        eventSpec.flags = CGEventFlags([.maskCommand, .maskShift])
        eventSpec.keyCode = CGKeyCode(40) // K

        // Register with CGS (not recommended for sandbox — use Accessibility)
        // For non-sandboxed apps, we use the simpler CGEvent tap approach:

        let callback: CGEventTapCallBack = { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
            guard type == .tapDisabledByTimeout || type == .tapDisabledByUserInput else {
                return Unmanaged.passRetained(event)
            }
            // Re-enable the tap
            CGEvent.tapEnable(tap: proxy, enable: true)
            // Post the hotkey notification
            NotificationCenter.default.post(name: .cloumHotkeyPressed, object: nil)
            return Unmanaged.passRetained(event)
        }

        // We need accessibility permissions for CGEvent tap.
        // The app requests this via SystemPreferences > Privacy > Accessibility.
        guard CGEvent.tapRequiresAccessibility() == false else {
            requestAccessibilityPermission()
            return
        }

        eventTap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(1 << CGEventType.keyDown.rawValue),
            callback: callback,
            userInfo: nil
        )

        guard let tap = eventTap else { return }

        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)
    }

    func unregister() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let src = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), src, .commonModes)
        }
        eventTap = nil
        runLoopSource = nil
    }

    private func requestAccessibilityPermission() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)
    }
}

extension Notification.Name {
    static let cloumHotkeyPressed = Notification.Name("cloumHotkeyPressed")
}
