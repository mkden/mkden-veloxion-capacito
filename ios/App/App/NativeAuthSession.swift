import Foundation
import Security

struct NativeAuthFailure: Error {
    let key: String
    let status: Int
    init(_ key: String, _ status: Int = 0) { self.key = key; self.status = status }
}

struct NativeAuthRegion {
    let euro: Bool
    let origin: String
    let api: String
    init(bundleIdentifier: String? = Bundle.main.bundleIdentifier) {
        switch bundleIdentifier {
        case "io.veloxion.app": euro = false; origin = "https://veloxion.io"; api = "https://api.veloxion.io/api"
        case "eu.veloxion.app": euro = true; origin = "https://veloxion.eu"; api = "https://veloxion.eu/api"
        default: preconditionFailure("Unknown application region")
        }
    }
    func trusts(_ url: URL?) -> Bool {
        guard let url = url, url.scheme == "https", let host = url.host,
              url.port == nil || url.port == 443 else { return false }
        let expected = euro ? "veloxion.eu" : "veloxion.io"
        return host == expected || host == "www." + expected
    }
}

protocol NativeSessionStorage: AnyObject {
    var revision: Int { get }
    func read() -> [String: String]?
    func save(_ session: [String: String], revision: Int) throws
    func clear(ifRevision expected: Int?)
}

final class NativeAuthStore: NativeSessionStorage {
    static let shared = NativeAuthStore()
    private let lock = NSLock()
    private var generation = 0
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: Bundle.main.bundleIdentifier! + ".auth.v1",
         kSecAttrAccount as String: "session"]
    }
    var revision: Int { lock.lock(); defer { lock.unlock() }; return generation }
    func read() -> [String: String]? {
        lock.lock(); defer { lock.unlock() }
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(search as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: String]
    }
    func save(_ session: [String: String], revision: Int) throws {
        lock.lock(); defer { lock.unlock() }
        guard generation == revision else { throw NativeAuthFailure("expired") }
        let data = try JSONSerialization.data(withJSONObject: session)
        let attributes: [String: Any] = [kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw NativeAuthFailure("server") }
    }
    func clear(ifRevision expected: Int? = nil) {
        lock.lock(); defer { lock.unlock() }
        if let expected = expected, generation != expected { return }
        generation += 1
        SecItemDelete(query as CFDictionary)
    }
}

private final class AuthNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class NativeAuthApi {
    let region: NativeAuthRegion
    private let client: URLSession
    init(region: NativeAuthRegion = NativeAuthRegion(), client: URLSession? = nil) {
        self.region = region; self.client = client ?? Self.makeClient()
    }
    private static func makeClient() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 12
        config.timeoutIntervalForResource = 20
        config.httpShouldSetCookies = false
        config.httpCookieStorage = nil
        config.urlCache = nil
        return URLSession(configuration: config, delegate: AuthNoRedirect(), delegateQueue: nil)
    }
    static func checkedToken(_ token: String?) throws -> String {
        guard let token = token, !token.isEmpty, token.count <= 16384, !token.contains("\r"), !token.contains("\n") else {
            throw NativeAuthFailure("denied", 401)
        }
        return token
    }
    func request(_ path: String, body: [String: Any]? = nil, token: String? = nil) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: region.api + path)!)
        request.httpMethod = body == nil ? "GET" : "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        if let token = token { request.setValue("Bearer " + (try Self.checkedToken(token)), forHTTPHeaderField: "Authorization") }
        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }
        let data: Data
        let response: URLResponse
        do { (data, response) = try await client.data(for: request) }
        catch { throw NativeAuthFailure("offline") }
        guard let http = response as? HTTPURLResponse else { throw NativeAuthFailure("server") }
        let status = http.statusCode
        guard (200..<300).contains(status) else {
            throw NativeAuthFailure(status == 429 ? "rate" : status >= 500 || status < 400 ? "server" : "denied", status)
        }
        guard data.count <= 262144,
              let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              envelope["success"] as? Bool == true, let payload = envelope["data"] as? [String: Any] else {
            throw NativeAuthFailure("server")
        }
        return payload
    }
    func session(_ data: [String: Any]) throws -> [String: String] {
        ["accessToken": try Self.checkedToken((data["accessToken"] ?? data["token"]) as? String),
         "refreshToken": data["refreshToken"] as? String ?? ""]
    }
    func validate(_ token: String) async throws {
        let payload = try await request("/me", token: token)
        guard let user = payload["user"] as? [String: Any],
              let id = user["id"], (Int(String(describing: id)) ?? 0) > 0,
              (user["is_blocked"] as? NSNumber)?.boolValue != true else { throw NativeAuthFailure("denied", 403) }
    }
    func restore(store: NativeSessionStorage = NativeAuthStore.shared) async throws -> [String: String]? {
        let revision = store.revision
        guard var saved = store.read() else { return nil }
        do { try await validate(saved["accessToken"] ?? "") }
        catch let error as NativeAuthFailure {
            guard error.status == 401 else {
                if error.status == 403 || error.status == 404 { store.clear(ifRevision: revision) }
                throw error
            }
            guard let refresh = saved["refreshToken"], !refresh.isEmpty else { store.clear(ifRevision: revision); throw error }
            do {
                let response = try await request("/auth/refresh", body: ["refreshToken": refresh])
                saved = try session(response)
                try await validate(saved["accessToken"]!)
                try store.save(saved, revision: revision)
            } catch let refreshError as NativeAuthFailure {
                if [400,401,403,404].contains(refreshError.status) { store.clear(ifRevision: revision) }
                throw refreshError
            }
        }
        guard store.revision == revision else { throw NativeAuthFailure("expired") }
        return saved
    }
    func checkSite() async throws {
        var request = URLRequest(url: URL(string: region.origin + "/auth")!)
        request.httpMethod = "HEAD"
        do {
            let (_, response) = try await client.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw NativeAuthFailure("server", 503) }
        } catch let failure as NativeAuthFailure { throw failure }
        catch { throw NativeAuthFailure("offline") }
    }
}
