import Capacitor
import StoreKit
import WebKit

@objc(VeloxionPurchasesPlugin)
public class VeloxionPurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VeloxionPurchasesPlugin"
    public let jsName = "VeloxionPurchases"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncPurchases", returnType: CAPPluginReturnPromise)
    ]
    private var updatesTask: Task<Void, Never>?
    private var purchaseInProgress = false
    private var productPrefix: String { (Bundle.main.bundleIdentifier ?? "") + "." }

    private var trustedHosts: Set<String> {
        switch Bundle.main.bundleIdentifier {
        case "io.veloxion.app": return ["veloxion.io", "www.veloxion.io"]
        case "eu.veloxion.app": return ["veloxion.eu", "www.veloxion.eu"]
        default: return []
        }
    }

    public override func load() {
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                guard case .verified(let transaction) = result else { continue }
                guard transaction.productType == .consumable, transaction.productID.hasPrefix(self.productPrefix) else { continue }
                await MainActor.run {
                    guard self.trustedOrigin else { return }
                    self.notifyListeners("transactionUpdated", data: self.payload(result, transaction), retainUntilConsumed: true)
                }
            }
        }
    }

    deinit { updatesTask?.cancel() }

    private var trustedOrigin: Bool {
        guard let url = bridge?.webView?.url else { return false }
        return url.scheme == "https" && trustedHosts.contains(url.host?.lowercased() ?? "")
    }

    private func requireOrigin(_ call: CAPPluginCall) -> Bool {
        guard trustedOrigin else {
            call.reject("Purchases are only available on the trusted Veloxion website.", "UNTRUSTED_ORIGIN")
            return false
        }
        return true
    }

    private func payload(_ result: VerificationResult<Transaction>, _ transaction: Transaction) -> [String: Any] {
        return [
            "transactionId": String(transaction.id),
            "productId": transaction.productID,
            "signedTransaction": result.jwsRepresentation
        ]
    }

    @objc public func getProducts(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard requireOrigin(call) else { return }
            let ids = call.getArray("productIds", String.self) ?? []
            guard !ids.isEmpty, ids.count <= 32,
                  ids.allSatisfy({ $0.hasPrefix(productPrefix) && $0.count <= 190 }) else {
                call.reject("Invalid App Store product identifiers.", "INVALID_PRODUCTS")
                return
            }
            do {
                let products = try await Product.products(for: ids)
                call.resolve(["products": products.filter { $0.type == .consumable }.map { product in
                    ["productId": product.id, "displayName": product.displayName,
                     "description": product.description, "displayPrice": product.displayPrice]
                }])
            } catch { call.reject("Unable to load App Store products. Please try again.", "STORE_UNAVAILABLE") }
        }
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard requireOrigin(call) else { return }
            guard !purchaseInProgress else { call.reject("A purchase is already in progress.", "PURCHASE_BUSY"); return }
            guard let id = call.getString("productId"), id.hasPrefix(productPrefix),
                  let rawToken = call.getString("appAccountToken"), let token = UUID(uuidString: rawToken) else {
                call.reject("An authenticated purchase request is required.", "INVALID_PURCHASE")
                return
            }
            purchaseInProgress = true
            defer { purchaseInProgress = false }
            do {
                guard let product = try await Product.products(for: [id]).first, product.type == .consumable else {
                    call.reject("This App Store product is unavailable.", "PRODUCT_UNAVAILABLE")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(token)])
                switch result {
                case .success(let verification):
                    guard case .verified(let transaction) = verification else {
                        call.reject("Apple could not verify the purchase.", "UNVERIFIED_TRANSACTION")
                        return
                    }
                    // Deliver and acknowledge only after the backend has credited this transaction.
                    call.resolve(["status": "purchased", "transaction": payload(verification, transaction)])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.reject("Unexpected App Store purchase status.", "UNKNOWN_PURCHASE_STATUS")
                }
            } catch { call.reject("The App Store purchase could not be completed. Please try again.", "PURCHASE_FAILED") }
        }
    }

    @objc public func getPendingTransactions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard requireOrigin(call) else { return }
            var transactions: [[String: Any]] = []
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result, transaction.productType == .consumable,
                      transaction.productID.hasPrefix(productPrefix) else { continue }
                transactions.append(payload(result, transaction))
            }
            call.resolve(["transactions": transactions])
        }
    }

    @objc public func finishTransaction(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard requireOrigin(call) else { return }
            guard let rawId = call.getString("transactionId"), let id = UInt64(rawId) else {
                call.reject("Invalid transaction identifier.", "INVALID_TRANSACTION")
                return
            }
            for await result in Transaction.unfinished {
                guard case .verified(let transaction) = result, transaction.id == id, transaction.productType == .consumable,
                      transaction.productID.hasPrefix(productPrefix) else { continue }
                await transaction.finish()
                break
            }
            call.resolve(["finished": true])
        }
    }

    @objc public func syncPurchases(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard requireOrigin(call) else { return }
            do { try await AppStore.sync(); call.resolve(["synced": true]) }
            catch { call.reject("Unable to sync App Store purchases.", "SYNC_FAILED") }
        }
    }

    public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        guard let host = navigationAction.request.url?.host?.lowercased() else { return nil }
        let paymentHosts = ["robokassa.ru", "roboxchange.com", "stripe.com", "stripe.network"]
        if paymentHosts.contains(where: { host == $0 || host.hasSuffix("." + $0) }) {
            return NSNumber(value: true)
        }
        return nil
    }
}
