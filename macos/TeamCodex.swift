import Cocoa
import WebKit
import Darwin

// Private subprocess mode: consumed only through an anonymous pipe by the local launcher.
// Never persist or display the returned environment in the control panel or logs.
if CommandLine.arguments.count == 3, let targetPid = Int32(CommandLine.arguments[2]), targetPid > 1 {
  if CommandLine.arguments[1] == "--read-process-context" {
    var query: [Int32] = [CTL_KERN, KERN_PROCARGS2, targetPid]
    var size = 0
    guard sysctl(&query, 3, nil, &size, nil, 0) == 0, size > 4, size < 4_194_304 else { exit(2) }
    var bytes = [UInt8](repeating: 0, count: size)
    guard sysctl(&query, 3, &bytes, &size, nil, 0) == 0 else { exit(2) }
    let count = bytes.withUnsafeBytes { $0.loadUnaligned(as: Int32.self) }
    var cursor = 4
    func readString() -> String? {
      let start = cursor
      while cursor < size && bytes[cursor] != 0 { cursor += 1 }
      guard cursor < size, let value = String(bytes: bytes[start..<cursor], encoding: .utf8) else { return nil }
      cursor += 1
      return value
    }
    guard count > 0, count < 65536, let executable = readString() else { exit(2) }
    while cursor < size && bytes[cursor] == 0 { cursor += 1 }
    var arguments: [String] = []
    for _ in 0..<count { guard let value = readString() else { exit(2) }; arguments.append(value) }
    var environment: [String: String] = [:]
    while cursor < size && bytes[cursor] != 0 {
      guard let item = readString(), let separator = item.firstIndex(of: "=") else { exit(2) }
      environment[String(item[..<separator])] = String(item[item.index(after: separator)...])
    }
    guard let output = try? JSONSerialization.data(withJSONObject: ["path": executable, "args": Array(arguments.dropFirst()), "env": environment]) else { exit(2) }
    FileHandle.standardOutput.write(output)
    exit(0)
  }
  if CommandLine.arguments[1] == "--quit-process" {
    guard let target = NSRunningApplication(processIdentifier: targetPid),
      let executable = target.executableURL?.path,
      executable.hasSuffix("/ChatGPT.app/Contents/MacOS/ChatGPT") || executable.hasSuffix("/Codex.app/Contents/MacOS/Codex"),
      target.terminate() else { exit(2) }
    exit(0)
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate, WKUIDelegate {
  private var statusItem: NSStatusItem!
  private var popover: NSPopover!
  private var webView: WKWebView!
  private let showName = Notification.Name("TeamCodex.showPanel")
  private var primaryInstance = false
  private var quitting = false
  private var backendTask: Process?

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
    primaryInstance = true

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
    DispatchQueue.main.async { self.startBackend(); self.showPopover() }
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    startBackend()
    showPopover()
    return true
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
    if quitting || backendTask?.isRunning == true { return }
    let root = appRoot()
    let launch = root.appendingPathComponent("macos/launch.sh")
    guard FileManager.default.isExecutableFile(atPath: launch.path) else { return }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/bash")
    task.arguments = [launch.path]
    task.currentDirectoryURL = root
    backendTask = task
    task.terminationHandler = { [weak self] _ in DispatchQueue.main.async { self?.reloadPanel() } }
    do { try task.run() } catch { backendTask = nil }
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
    webView.uiDelegate = self
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

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    let alert = NSAlert()
    alert.messageText = "TeamCodex"
    alert.informativeText = message
    alert.addButton(withTitle: "确认")
    alert.addButton(withTitle: "取消")
    let response = alert.runModal()
    completionHandler(response == .alertFirstButtonReturn)
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    let alert = NSAlert()
    alert.messageText = "TeamCodex"
    alert.informativeText = message
    alert.addButton(withTitle: "好")
    alert.runModal()
    completionHandler()
  }

  @objc private func statusClicked(_ sender: NSStatusBarButton) {
    let event = NSApp.currentEvent
    if event?.type == .rightMouseUp {
      let menu = NSMenu()
      menu.addItem(withTitle: "显示面板", action: #selector(showPopover), keyEquivalent: "")
      menu.addItem(NSMenuItem.separator())
      menu.addItem(withTitle: "退出 TeamCodex（保留协作服务）", action: #selector(quit), keyEquivalent: "q")
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

  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if !primaryInstance { return .terminateNow }
    if quitting { return .terminateLater }
    quitting = true
    var request = URLRequest(url: URL(string: "http://127.0.0.1:18767/api/shutdown")!)
    request.httpMethod = "POST"
    request.timeoutInterval = 3
    URLSession.shared.dataTask(with: request) { [weak self] _, response, error in
      if (error as? URLError)?.code == .cannotConnectToHost { self?.finishQuit(true); return }
      guard (response as? HTTPURLResponse)?.statusCode == 202 else { self?.finishQuit(false); return }
      self?.waitForBackendExit(remaining: 60)
    }.resume()
    return .terminateLater
  }

  private func waitForBackendExit(remaining: Int) {
    if remaining == 0 { finishQuit(false); return }
    DispatchQueue.global().asyncAfter(deadline: .now() + 0.3) { [weak self] in
      let request = URLRequest(url: URL(string: "http://127.0.0.1:18767/api/runtime")!, timeoutInterval: 1)
      URLSession.shared.dataTask(with: request) { _, _, error in
        if (error as? URLError)?.code == .cannotConnectToHost { self?.finishQuit(true) }
        else { self?.waitForBackendExit(remaining: remaining - 1) }
      }.resume()
    }
  }

  private func finishQuit(_ success: Bool) {
    DispatchQueue.main.async {
      self.quitting = false
      NSApp.reply(toApplicationShouldTerminate: success)
      if !success {
        let alert = NSAlert()
        alert.messageText = "后台尚未退出"
        alert.informativeText = "TeamCodex 已保留运行，没有强制结束进程。请稍后重试；Codex 和协作数据未受影响。"
        alert.runModal()
      }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
