import Foundation

private final class MemorySession: NativeSessionStorage {
    var revision = 0
    var value: [String: String]? = ["accessToken": "old-fixture", "refreshToken": "refresh-fixture"]
    func read() -> [String: String]? { value }
    func save(_ session: [String: String], revision expected: Int) throws {
        guard revision == expected else { throw NativeAuthFailure("expired") }; value = session
    }
    func clear(ifRevision expected: Int?) {
        if let expected = expected, expected != revision { return }; revision += 1; value = nil
    }
}

private final class StubRequests: URLProtocol {
    static var respond: (URLRequest) -> (Int, [String: Any]) = { _ in (500, [:]) }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let (status, data) = Self.respond(request)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: ["success": true, "data": data]))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main struct NativeAuthSessionTests {
    static func main() async throws {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [StubRequests.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel() }
        for bundle in ["io.veloxion.app", "eu.veloxion.app"] {
            let api = NativeAuthApi(region: NativeAuthRegion(bundleIdentifier: bundle), client: session)
            let store = MemorySession()
            StubRequests.respond = { request in
                precondition(request.url?.path == "/api/me")
                return (200, ["user": ["id": 1, "is_blocked": 0]])
            }
            let restored = try await api.restore(store: store)
            precondition(restored?["accessToken"] == "old-fixture" && store.value?["refreshToken"] == "refresh-fixture")
            var requests = 0
            StubRequests.respond = { request in
                requests += 1
                if request.url?.path == "/api/auth/refresh" { return (200, ["accessToken": "new-fixture", "refreshToken": "new-refresh-fixture"]) }
                return requests == 1 ? (401, [:]) : (200, ["user": ["id": 1]])
            }
            _ = try await api.restore(store: store)
            precondition(requests == 3 && store.value?["accessToken"] == "new-fixture" && store.value?["refreshToken"] == "new-refresh-fixture")
            StubRequests.respond = { _ in (503, [:]) }
            do { _ = try await api.restore(store: store); preconditionFailure("Server failure accepted") } catch {}
            precondition(store.value?["refreshToken"] == "new-refresh-fixture")
            StubRequests.respond = { _ in
                store.clear(ifRevision: store.revision)
                try! store.save(["accessToken": "another-account", "refreshToken": "another-refresh"], revision: store.revision)
                return (403, [:])
            }
            do { _ = try await api.restore(store: store); preconditionFailure("Late failure accepted") } catch {}
            precondition(store.value?["accessToken"] == "another-account")
            StubRequests.respond = { _ in store.clear(ifRevision: store.revision); return (200, ["user": ["id": 1]]) }
            do { _ = try await api.restore(store: store); preconditionFailure("Logged out session restored") } catch {}
            precondition(store.value == nil)
        }
        print("Swift session restore, refresh, outage and account revision guards passed")
    }
}
