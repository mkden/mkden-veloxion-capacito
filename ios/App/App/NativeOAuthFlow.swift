import Foundation
import CryptoKit
import Security

struct NativeOAuthFlow {
    enum Failure: Error { case invalid }
    let state: String, verifier: String, challenge: String, scheme: String, provider: String
    private static func encode(_ data: Data) -> String { data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "") }
    private static func random() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw Failure.invalid }
        return encode(Data(bytes))
    }
    init(bundle: String) throws {
        guard ["eu.veloxion.app", "io.veloxion.app"].contains(bundle) else { throw Failure.invalid }
        scheme = bundle; provider = bundle == "eu.veloxion.app" ? "google" : "yandex"
        state = try Self.random(); verifier = try Self.random()
        challenge = Self.encode(Data(SHA256.hash(data: Data(verifier.utf8))))
    }
    func authorization(_ raw: String) throws -> URL {
        guard let url = URL(string: raw), url.scheme == "https", url.user == nil, url.password == nil,
              url.port == nil || url.port == 443, url.fragment == nil,
              url.host == (provider == "google" ? "accounts.google.com" : "oauth.yandex.ru"),
              url.path == (provider == "google" ? "/o/oauth2/v2/auth" : "/authorize") else { throw Failure.invalid }
        return url
    }
    func callback(_ url: URL) throws -> [String: String] {
        guard url.absoluteString.count <= 4096, url.scheme == scheme, url.host == "oauth", url.path == "/callback",
              url.user == nil, url.password == nil, url.port == nil, url.fragment == nil,
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { throw Failure.invalid }
        var params: [String: String] = [:]
        for item in items {
            guard ["state", "code", "error"].contains(item.name), params[item.name] == nil, let value = item.value else { throw Failure.invalid }
            params[item.name] = value
        }
        guard params["state"] == state, (params["code"] != nil) != (params["error"] != nil) else { throw Failure.invalid }
        if let code = params["code"], code.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) == nil { throw Failure.invalid }
        if let error = params["error"], !["cancelled", "denied", "registration_required"].contains(error) { throw Failure.invalid }
        return params
    }
}
