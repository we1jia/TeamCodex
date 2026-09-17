import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate {
  private var statusItem: NSStatusItem!
  private var popover: NSPopover!
  private var webView: WKWebView!
  private let showName = Notification.Name("TeamCodex.showPanel")

  func applicationDidFinishLaunching(_ notification: Notification) {
    let bundleId = Bundle.main.bundleIdentifier ?? "local.media.team-codex"
    let others = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
      .filter { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
    if !others.isEmpty {
      DistributedNotificationCenter.default().postNotificationName(
        showName, object: nil, userInfo: nil, deliverImmediately: true
      )
      NSApp.terminate(nil)
      return
    }

    DistributedNotificationCenter.default().addObserver(
      self,
      selector: #selector(showFromNotification),
      name: showName,
      object: nil
    )

    startBackend()
    setupStatusItem()
    setupPopover()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
      self?.togglePopover(nil)
    }
  }

  @objc private func showFromNotification() {
    DispatchQueue.main.async { self.showPopover() }
  }

  private func appRoot() -> URL {
    let bundle = Bundle.main.bundleURL
    let packaged = bundle.appendingPathComponent("Contents/Resources/app")
    if FileManager.default.fileExists(atPath: packaged.appendingPathComponent("macos/launch.sh").path) {
      return packaged
    }
    return bundle.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  }

  private func startBackend() {
    let root = appRoot()
    let launch = root.appendingPathComponent("macos/launch.sh")
    guard FileManager.default.isExecutableFile(atPath: launch.path) else { return }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/bash")
    task.arguments = [launch.path]
    task.currentDirectoryURL = root
    do { try task.run() } catch {}
  }

  private func setupStatusItem() {
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    if let button = statusItem.button {
      button.image = createStatusIcon()
      button.target = self
      button.action = #selector(statusClicked(_:))
      button.sendAction(on: [.leftMouseUp, .rightMouseUp])
    }
  }

  private func createStatusIcon() -> NSImage {
    // 1. 尝试从 App Bundle 中加载命名资源（自动适配 Retina @2x）
    if let named = NSImage(named: NSImage.Name("TeamCodex-Status")) {
      let icon = named.copy() as! NSImage
      icon.size = NSSize(width: 18, height: 18)
      icon.isTemplate = true
      return icon
    }

    // 2. 尝试从 Bundle Resource 文件路径加载
    let bundle = Bundle.main
    if let resPath = bundle.path(forResource: "TeamCodex-Status", ofType: "png") ??
                     bundle.path(forResource: "TeamCodex-Status@2x", ofType: "png") {
      if let img = NSImage(contentsOfFile: resPath) {
        img.size = NSSize(width: 18, height: 18)
        img.isTemplate = true
        return img
      }
    }

    // 3. 尝试从本地项目/工作区目录加载（支持开发模式运行）
    let appDir = appRoot().appendingPathComponent("macos")
    for filename in ["TeamCodex-Status@2x.png", "TeamCodex-Status.png"] {
      let candidate = appDir.appendingPathComponent(filename).path
      if FileManager.default.fileExists(atPath: candidate),
         let img = NSImage(contentsOfFile: candidate) {
        img.size = NSSize(width: 18, height: 18)
        img.isTemplate = true
        return img
      }
    }

    // 4. Fallback: 使用 Apple 系统的云朵 Symbol
    let fallback = NSImage(systemSymbolName: "cloud.fill", accessibilityDescription: "TeamCodex") ??
                   NSImage(systemSymbolName: "bolt.horizontal.fill", accessibilityDescription: "TeamCodex")!
    fallback.isTemplate = true
    return fallback
  }

  private func setupPopover() {
    let config = WKWebViewConfiguration()
    webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 320, height: 382), configuration: config)
    webView.setValue(false, forKey: "drawsBackground")
    if let url = URL(string: "http://127.0.0.1:18767/panel.html") {
      webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8))
    }
    let controller = NSViewController()
    controller.view = webView
    popover = NSPopover()
    popover.contentSize = NSSize(width: 320, height: 382)
    popover.behavior = .transient
    popover.animates = true
    popover.delegate = self
    popover.contentViewController = controller
  }

  @objc private func statusClicked(_ sender: NSStatusBarButton) {
    let event = NSApp.currentEvent
    if event?.type == .rightMouseUp {
      let menu = NSMenu()
      menu.addItem(withTitle: "显示面板", action: #selector(showPopover), keyEquivalent: "")
      menu.addItem(NSMenuItem.separator())
      menu.addItem(withTitle: "退出 TeamCodex", action: #selector(quit), keyEquivalent: "q")
      statusItem.menu = menu
      statusItem.button?.performClick(nil)
      statusItem.menu = nil
      return
    }
    togglePopover(sender)
  }

  @objc private func togglePopover(_ sender: Any?) {
    if popover.isShown {
      popover.performClose(sender)
    } else {
      showPopover()
    }
  }

  @objc private func showPopover() {
    reloadPanel()
    guard let button = statusItem.button else { return }
    popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func reloadPanel() {
    if let url = URL(string: "http://127.0.0.1:18767/panel.html") {
      webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 8))
    }
  }

  @objc private func quit() {
    NSApp.terminate(nil)
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
