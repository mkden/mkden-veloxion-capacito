import UIKit
import Capacitor

/// Owns the app's UIWindow under the scene lifecycle required by the iOS 27 SDK.
/// The custom native sign-in screen must remain the initial controller.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard session.role == .windowApplication,
              let windowScene = scene as? UIWindowScene,
              let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }

        let newWindow = UIWindow(windowScene: windowScene)
        window = newWindow
        // The existing login, account restoration and native Capacitor plugins
        // switch root controllers through AppDelegate.window.
        appDelegate.window = newWindow
        appDelegate.showNativeAuth()

        // Capacitor 8.5 forwards deep links delivered on cold start after
        // plugins have registered (on capacitorViewDidAppear).
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        (UIApplication.shared.delegate as? AppDelegate)?.configureBridgeWebView()
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
           appDelegate.window === window {
            appDelegate.window = nil
        }
        window = nil
    }
}
