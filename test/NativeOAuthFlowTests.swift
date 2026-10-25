import Foundation
import CryptoKit

@main struct NativeOAuthFlowTests {
    static func rejects(_ operation: () throws -> Any) {
        do { _ = try operation(); fatalError("Unsafe OAuth value accepted") } catch {}
    }
    static func main() throws {
        for bundle in ["eu.veloxion.app", "io.veloxion.app"] {
            let flow = try NativeOAuthFlow(bundle: bundle)
            precondition(flow.state.count == 43 && flow.verifier.count == 43 && flow.state != flow.verifier)
            let proof = Data(SHA256.hash(data: Data(flow.verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            precondition(flow.challenge == proof)
            let base = bundle + "://oauth/callback?state=" + flow.state, code = String(repeating: "a", count: 43)
            let result = try flow.callback(URL(string: base + "&code=" + code)!)
            precondition(result["code"] == code)
            let cancelled = try flow.callback(URL(string: base + "&error=cancelled")!)
            precondition(cancelled["error"] == "cancelled")
            for raw in [base + "&code=" + code + "&code=" + code, base + "&code=" + code + "&error=denied",
                        base + "&token=private", base + "&code=" + code + "#fragment",
                        base.replacingOccurrences(of: flow.state, with: "invalid") + "&code=" + code,
                        base.replacingOccurrences(of: "://oauth/", with: "://user@oauth/") + "&code=" + code,
                        base.replacingOccurrences(of: bundle, with: "foreign.app") + "&code=" + code] {
                rejects { try flow.callback(URL(string: raw)!) }
            }
            let authorization = flow.provider == "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://oauth.yandex.ru/authorize"
            _ = try flow.authorization(authorization)
            rejects { try flow.authorization(authorization.replacingOccurrences(of: "https:", with: "http:")) }
            rejects { try flow.authorization(authorization.replacingOccurrences(of: ".com/", with: ".com.evil.invalid/").replacingOccurrences(of: ".ru/", with: ".ru.evil.invalid/")) }
        }
        print("Swift OAuth: PKCE, state, callbacks, errors and region isolation passed")
    }
}
