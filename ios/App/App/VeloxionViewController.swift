import Capacitor

class VeloxionViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VeloxionPurchasesPlugin())
        bridge?.registerPluginInstance(NativeAuthPlugin())
    }
}
