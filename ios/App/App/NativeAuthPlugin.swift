import Capacitor
import UIKit
import WebKit

@objc(NativeAuthPlugin)
public final class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "VeloxionAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "completeHandoff", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocale", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLocale", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "adoptSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLogin", returnType: CAPPluginReturnPromise)
    ]
    @objc public func getLocale(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard NativeAuthRegion().trusts(webView?.url) else { call.reject("Untrusted origin"); return }
            call.resolve(["locale": NativeAuthRegion().euro ? NativeAuthLocale.current : "ru"])
        }
    }
    @objc public func setLocale(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard NativeAuthRegion().trusts(webView?.url), NativeAuthRegion().euro,
                  let locale = call.getString("locale"), NativeAuthLocale.codes.contains(locale) else { call.reject("Invalid locale or origin"); return }
            UserDefaults.standard.set(locale, forKey: NativeAuthLocale.key); call.resolve()
        }
    }
    @objc public func getSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard NativeAuthRegion().trusts(webView?.url) else { call.reject("Untrusted origin"); return }
            let app = UIApplication.shared.delegate as? AppDelegate
            let allowed = app?.webAuthAllowed ?? false
            let begin = allowed && app?.webAuthStarted != true
            if allowed { app?.webAuthStarted = true }
            Task { @MainActor in
                do {
                    let session = allowed ? nil : try await NativeAuthApi().restore()
                    call.resolve(["accessToken": session?["accessToken"] ?? "",
                                  "validated": !allowed, "webAuthAllowed": allowed, "beginWebAuth": begin])
                } catch { call.reject("Could not restore session") }
            }
        }
    }
    @objc public func completeHandoff(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard NativeAuthRegion().trusts(webView?.url) else { call.reject("Untrusted origin"); return }
            (bridge?.viewController as? VeloxionViewController)?.completeNativeSessionHandoff()
            call.resolve()
        }
    }
    @objc public func adoptSession(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            guard NativeAuthRegion().trusts(webView?.url), let token = call.getString("accessToken") else { call.reject("Untrusted origin"); return }
            let revision = NativeAuthStore.shared.revision
            Task { @MainActor in
                do {
                    try await NativeAuthApi().validate(token)
                    let previous = NativeAuthStore.shared.read()
                    try NativeAuthStore.shared.save(["accessToken": token,
                        "refreshToken": previous?["accessToken"] == token ? previous?["refreshToken"] ?? "" : ""], revision: revision)
                    (UIApplication.shared.delegate as? AppDelegate)?.webAuthAllowed = false
                    call.resolve()
                } catch { call.reject("Could not validate session") }
            }
        }
    }
    @objc public func showLogin(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            let local = webView?.url?.scheme == "capacitor" && webView?.url?.host == "localhost"
            guard NativeAuthRegion().trusts(webView?.url) || local else { call.reject("Untrusted origin"); return }
            if call.getBool("clearSession") == true {
                NativeAuthStore.shared.clear()
                let cookies = WKWebsiteDataStore.default().httpCookieStore
                cookies.getAllCookies { list in list.forEach { cookies.delete($0) } }
            }
            // An explicit return to login must not immediately reopen the failed WebView.
            (UIApplication.shared.delegate as? AppDelegate)?.showNativeAuth(restoreSession: false)
            call.resolve()
        }
    }

    // Native file export for generated images/videos. Only accept the first-party
    // attachment endpoint; the server validates the media origin and every redirect.
    @objc public func downloadMedia(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [self] in
            let region = NativeAuthRegion()
            guard region.trusts(webView?.url),
                  let raw = call.getString("url"), let url = URL(string: raw),
                  region.trusts(url), url.user == nil, url.password == nil,
                  url.path == "/api/download" else { call.reject("Invalid download URL"); return }
            var request = URLRequest(url: url)
            request.timeoutInterval = 120
            let session = URLSession(configuration: .ephemeral, delegate: MediaNoRedirect(), delegateQueue: nil)
            session.downloadTask(with: request) { [weak self] temporary, response, error in
                defer { session.finishTasksAndInvalidate() }
                guard error == nil, let temporary = temporary, let http = response as? HTTPURLResponse,
                      http.statusCode == 200, region.trusts(http.url),
                      let mime = http.mimeType?.lowercased(),
                      mime.hasPrefix("image/") || mime.hasPrefix("video/") || mime == "application/zip" || mime == "application/octet-stream",
                      http.value(forHTTPHeaderField: "Content-Disposition")?.lowercased().hasPrefix("attachment") == true
                else { call.reject("Could not download the file"); return }
                let rawName = http.suggestedFilename ?? call.getString("filename") ?? "veloxion-file"
                let safeName = rawName.components(separatedBy: CharacterSet(charactersIn: "/\\:\r\n\u{0000}")).joined(separator: "_")
                let name = safeName.isEmpty || safeName == "." || safeName == ".." ? "veloxion-file" : String(safeName.prefix(180))
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent("veloxion-export-" + UUID().uuidString, isDirectory: true)
                let destination = folder.appendingPathComponent(name)
                do {
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    try FileManager.default.moveItem(at: temporary, to: destination)
                } catch {
                    try? FileManager.default.removeItem(at: folder)
                    call.reject("Could not save the file"); return
                }
                DispatchQueue.main.async {
                    guard let self = self, let controller = self.bridge?.viewController,
                          controller.viewIfLoaded?.window != nil, controller.presentedViewController == nil else {
                        try? FileManager.default.removeItem(at: folder)
                        call.reject("File export unavailable"); return
                    }
                    let sheet = UIActivityViewController(activityItems: [destination], applicationActivities: nil)
                    sheet.popoverPresentationController?.sourceView = controller.view
                    sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                    sheet.completionWithItemsHandler = { _, completed, _, error in
                        try? FileManager.default.removeItem(at: folder)
                        if error != nil { call.reject("Could not save the file") }
                        else { call.resolve(["completed": completed]) }
                    }
                    controller.present(sheet, animated: true)
                }
            }.resume()
        }
    }
}

private final class MediaNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
