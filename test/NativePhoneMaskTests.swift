import Foundation

@main struct NativePhoneMaskTests {
    static func main() throws {
        let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
        let cases = try JSONSerialization.jsonObject(with: data) as! [String: [[Any]]]
        for row in cases["format"]! { precondition(NativePhoneMask.format(row[0] as! String) == row[1] as! String, "Phone format mismatch") }
        for row in cases["edit"]! {
            let edit = NativePhoneMask.edit(row[0] as! String, location: row[1] as! Int, length: row[2] as! Int, replacement: row[3] as! String)
            precondition(edit.text == row[4] as! String && edit.selection == row[5] as! Int, "Phone edit mismatch")
        }
        precondition(NativePhoneMask.canonical("+7 (912) 345-67-89") == "+79123456789")
        precondition(NativePhoneMask.canonical("+7 (912)").isEmpty)
        print("Swift phone mask: format, editing, cursor and canonical API checks passed")
    }
}
