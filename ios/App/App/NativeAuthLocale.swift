import Foundation

enum NativeAuthLocale {
    static let codes = ["en", "de", "it", "es", "fr", "pl", "zh"]
    static let labels = ["English", "Deutsch", "Italiano", "Español", "Français", "Polski", "中文"]
    static let key = "veloxion_native_locale"
    static func resolve(saved: String?, device: String?) -> String {
        if let saved = saved, codes.contains(saved) { return saved }
        let base = (device ?? "").lowercased().replacingOccurrences(of: "_", with: "-").components(separatedBy: "-")[0]
        return codes.contains(base) ? base : "en"
    }
    static var current: String { resolve(saved: UserDefaults.standard.string(forKey: key), device: Locale.preferredLanguages.first) }
}
