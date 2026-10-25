import Capacitor
import UIKit
import WebKit

@objc(NativeAuthPlugin)
public final class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "VeloxionAuth"
    public let pluginMethods: [CAPPluginMethod] = [
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
            call.resolve(["accessToken": NativeAuthStore.shared.read()?["accessToken"] ?? "",
                          "webAuthAllowed": allowed, "beginWebAuth": begin])
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
            (UIApplication.shared.delegate as? AppDelegate)?.showNativeAuth()
            call.resolve()
        }
    }
}
