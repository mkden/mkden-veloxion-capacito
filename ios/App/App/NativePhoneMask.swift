import Foundation

enum NativePhoneMask {
    struct Edit { let text: String; let selection: Int }
    private static func isDigit(_ value: unichar) -> Bool { value >= 48 && value <= 57 }
    static func digits(_ value: String) -> String { String(value.unicodeScalars.filter { $0.value >= 48 && $0.value <= 57 }) }
    static func format(_ value: String) -> String {
        var number = digits(value)
        if number.hasPrefix("8") { number = "7" + number.dropFirst() }
        if !number.hasPrefix("7") { number = "7" + number }
        let chars = Array(number.prefix(11))
        func part(_ start: Int, _ end: Int) -> String { start < chars.count ? String(chars[start..<min(end, chars.count)]) : "" }
        var result = "+7"
        if chars.count > 1 { result += " (" + part(1, 4) }
        if chars.count >= 4 { result += ")" }
        if chars.count > 4 { result += " " + part(4, 7) }
        if chars.count > 7 { result += "-" + part(7, 9) }
        if chars.count > 9 { result += "-" + part(9, 11) }
        return result
    }
    static func complete(_ value: String) -> Bool { digits(value).range(of: "^7[0-9]{10}$", options: .regularExpression) != nil }
    static func canonical(_ value: String) -> String { complete(value) ? "+" + digits(value) : "" }
    static func edit(_ previous: String, location: Int, length: Int, replacement: String) -> Edit {
        let old = previous as NSString
        var start = max(0, min(location, old.length))
        let end = max(start, min(old.length, start + max(0, length)))
        if replacement.isEmpty && end > start && digits(old.substring(with: NSRange(location: start, length: end - start))).isEmpty && start > 2 {
            for i in stride(from: start - 1, through: 2, by: -1) { if isDigit(old.character(at: i)) { start = i; break } }
        }
        let candidate = old.replacingCharacters(in: NSRange(location: start, length: end - start), with: replacement)
        if candidate.isEmpty { return Edit(text: "", selection: 0) }
        let raw = digits(candidate)
        let prefix = (candidate as NSString).substring(to: start + (replacement as NSString).length)
        var leftDigits = digits(prefix).count
        if let first = raw.first, first != "7" && first != "8" { leftDigits += 1 }
        let formatted = format(candidate), text = formatted as NSString
        var position = min(2, text.length), seen = 0
        for i in 0..<text.length {
            if isDigit(text.character(at: i)) { seen += 1; if seen >= leftDigits { position = i + 1; break } }
            position = i + 1
        }
        if !replacement.isEmpty { while position < text.length && !isDigit(text.character(at: position)) { position += 1 } }
        return Edit(text: formatted, selection: min(position, text.length))
    }
}
