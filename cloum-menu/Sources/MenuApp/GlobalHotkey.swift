import AppKit
import Carbon

/// Global hotkey registration via CGEvent tap.
/// Registers ⌘⇧K globally to bring up the cloum quick-connect.
final class GlobalHotkeyMonitor {

    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?

    static let shared = GlobalHotkeyMonitor()

    private init() {}

    func register() {
        // Request accessibility permission if needed — the tap creation will
        // fail gracefully if permission is not granted.
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)

        let callback: CGEventTapCallBack = { _, type, event, _ -> Unmanaged<CGEvent>? in
            // Post notification on any tap event
            if type == .keyDown {
                NotificationCenter.default.post(name: .cloumHotkeyPressed, object: nil)
            }
            return Unmanaged.passRetained(event)
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
}

extension Notification.Name {
    static let cloumHotkeyPressed = Notification.Name("cloumHotkeyPressed")
}
