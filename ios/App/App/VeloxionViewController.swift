import Capacitor
import UIKit

class VeloxionViewController: CAPBridgeViewController {
    private let loadingPanel = UIView()
    private let message = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let retryButton = UIButton(type: .system), loginButton = UIButton(type: .system)
    private var loadingDeadline: Task<Void, Never>?
    private var handoffComplete = false
    private var labels: [String: String] = [:]

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VeloxionPurchasesPlugin())
        bridge?.registerPluginInstance(NativeAuthPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let euro = NativeAuthRegion().euro, locale = NativeAuthRegion().euro ? NativeAuthLocale.current : "ru"
        for file in euro ? ["native-auth", "native-auth-euro"] : ["native-auth"] {
            if let url = Bundle.main.url(forResource: file, withExtension: "json", subdirectory: "public"),
               let data = try? Data(contentsOf: url), let all = try? JSONSerialization.jsonObject(with: data) as? [String: [String: String]], let dictionary = all[locale] { labels.merge(dictionary) { _, new in new } }
        }
        loadingPanel.backgroundColor = UIColor(red: 0.93, green: 0.96, blue: 0.98, alpha: 1)
        loadingPanel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(loadingPanel)
        NSLayoutConstraint.activate([loadingPanel.leadingAnchor.constraint(equalTo: view.leadingAnchor), loadingPanel.trailingAnchor.constraint(equalTo: view.trailingAnchor), loadingPanel.topAnchor.constraint(equalTo: view.topAnchor), loadingPanel.bottomAnchor.constraint(equalTo: view.bottomAnchor)])
        let content = UIStackView(); content.axis = .vertical; content.spacing = 20; content.alignment = .center; content.translatesAutoresizingMaskIntoConstraints = false
        loadingPanel.addSubview(content)
        let brand = UILabel(); brand.text = "VELOXION AI"; brand.font = .systemFont(ofSize: 18, weight: .bold)
        message.font = .systemFont(ofSize: 16); message.numberOfLines = 0; message.textAlignment = .center
        content.addArrangedSubview(brand); content.addArrangedSubview(spinner); content.addArrangedSubview(message)
        retryButton.setTitle(labels["retry"] ?? "Retry", for: .normal); retryButton.addTarget(self, action: #selector(retryWorkspace), for: .touchUpInside)
        loginButton.setTitle(labels["back"] ?? "Back", for: .normal); loginButton.addTarget(self, action: #selector(returnToLogin), for: .touchUpInside)
        for button in [retryButton, loginButton] { button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true; content.addArrangedSubview(button) }
        NSLayoutConstraint.activate([content.centerXAnchor.constraint(equalTo: loadingPanel.centerXAnchor), content.centerYAnchor.constraint(equalTo: loadingPanel.safeAreaLayoutGuide.centerYAnchor), content.leadingAnchor.constraint(greaterThanOrEqualTo: loadingPanel.leadingAnchor, constant: 24), content.trailingAnchor.constraint(lessThanOrEqualTo: loadingPanel.trailingAnchor, constant: -24), content.widthAnchor.constraint(lessThanOrEqualToConstant: 460)])
        beginLoading()
    }

    private func beginLoading() {
        handoffComplete = false; loadingPanel.isHidden = false; spinner.startAnimating()
        message.text = labels["working"] ?? "Connecting..."; retryButton.isHidden = true; loginButton.isHidden = false
        loadingDeadline?.cancel()
        loadingDeadline = Task { @MainActor [weak self] in
            do { try await Task.sleep(nanoseconds: 35000000000) } catch { return }
            guard let self = self, !self.handoffComplete else { return }
            self.spinner.stopAnimating(); self.message.text = self.labels["offline"] ?? "Could not open your account. Check your connection."
            self.retryButton.isHidden = false
        }
    }

    func completeNativeSessionHandoff() {
        handoffComplete = true; loadingDeadline?.cancel(); spinner.stopAnimating(); loadingPanel.isHidden = true
    }

    @objc private func retryWorkspace() { beginLoading(); loadWebView() }
    @objc private func returnToLogin() { (UIApplication.shared.delegate as? AppDelegate)?.showNativeAuth(restoreSession: false) }
    deinit { loadingDeadline?.cancel() }
}
