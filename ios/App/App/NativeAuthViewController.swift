import UIKit

/// UIKit remains the application root until authentication and site availability succeed.
@MainActor final class NativeAuthViewController: UIViewController {
    private let api = NativeAuthApi()
    private let stack = UIStackView()
    private let name = UITextField(), identity = UITextField(), password = UITextField(), confirm = UITextField(), code = UITextField()
    private let consent = UISwitch(), consentRow = UIStackView()
    private let notice = UILabel()
    private let mode = UIButton(type: .system), submit = UIButton(type: .system), resend = UIButton(type: .system), back = UIButton(type: .system), emailMode = UIButton(type: .system)
    private var strings: [String: String] = [:]
    private var actions: [UIControl] = []
    private var registering = false, codeStep = false, emailLogin = false, busy = false
    private var resendAt = Date.distantPast
    private var work: Task<Void, Never>?
    private var generation = NativeAuthStore.shared.revision

    private func t(_ key: String) -> String { strings[key] ?? key }
    private var usesEmail: Bool { api.region.euro || emailLogin }
    private func value(_ field: UITextField) -> String { (field.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let url = Bundle.main.url(forResource: "native-auth", withExtension: "json", subdirectory: "public"),
              let data = try? Data(contentsOf: url), let locales = try? JSONSerialization.jsonObject(with: data) as? [String: [String: String]],
              let labels = locales[!api.region.euro || Locale.preferredLanguages.first?.hasPrefix("ru") == true ? "ru" : "en"] else {
            preconditionFailure("Bundled authentication translations are missing")
        }
        strings = labels
        view.backgroundColor = UIColor(red: 0.92, green: 0.96, blue: 0.98, alpha: 1)
        let scroll = UIScrollView(); scroll.keyboardDismissMode = .interactive; scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(scroll)
        stack.axis = .vertical; stack.spacing = 14; stack.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(stack)
        let width = stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48); width.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 32), stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -32),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.centerXAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerXAnchor), stack.widthAnchor.constraint(lessThanOrEqualToConstant: 520), width
        ])
        label(api.region.euro ? "VELOXION AI / EUROPE" : "VELOXION AI", size: 14, bold: true)
        label(t("title"), size: 32, bold: true); label(t("intro"), size: 16)
        button(mode, key: "register", selector: #selector(toggleMode))
        field(name, key: "name", content: .name); name.autocapitalizationType = .words
        field(identity, key: usesEmail ? "email" : "phone", content: .username)
        field(password, key: "password", content: .password); password.isSecureTextEntry = true
        field(confirm, key: "confirm", content: .newPassword); confirm.isSecureTextEntry = true
        field(code, key: "code", content: .oneTimeCode); code.keyboardType = .numberPad
        consentRow.axis = .horizontal; consentRow.spacing = 12; consentRow.alignment = .center
        let terms = UILabel(); terms.text = t("consent"); terms.numberOfLines = 0; terms.font = .preferredFont(forTextStyle: .footnote); terms.textColor = .darkGray
        consent.accessibilityLabel = t("consent"); consentRow.addArrangedSubview(consent); consentRow.addArrangedSubview(terms); stack.addArrangedSubview(consentRow); actions.append(consent)
        let legal = UIStackView(); legal.axis = .horizontal; legal.distribution = .fillEqually; legal.spacing = 8
        for key in ["rules", "privacy", "offer"] {
            let link = UIButton(type: .system); link.setTitle(t(key), for: .normal); link.titleLabel?.font = .systemFont(ofSize: 12)
            link.titleLabel?.numberOfLines = 0; link.accessibilityIdentifier = key; link.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            link.addTarget(self, action: #selector(openLegal(_:)), for: .touchUpInside); legal.addArrangedSubview(link)
        }
        stack.addArrangedSubview(legal)
        notice.numberOfLines = 0; notice.font = .preferredFont(forTextStyle: .footnote); notice.textColor = UIColor(red: 0.25, green: 0.35, blue: 0.48, alpha: 1); stack.addArrangedSubview(notice)
        button(submit, key: "login", selector: #selector(send), primary: true)
        button(resend, key: "resend", selector: #selector(sendCode))
        button(back, key: "back", selector: #selector(reset))
        button(UIButton(type: .system), key: "retry", selector: #selector(restore))
        button(emailMode, key: "emailLogin", selector: #selector(toggleEmail))
        button(UIButton(type: .system), key: "other", selector: #selector(otherMethods))
        label(t("secure"), size: 12)
        update()
        if NativeAuthStore.shared.read() != nil { restore() }
    }
    private func label(_ text: String, size: CGFloat, bold: Bool = false) {
        let label = UILabel(); label.text = text; label.numberOfLines = 0
        label.font = .systemFont(ofSize: size, weight: bold ? .bold : .regular); label.adjustsFontForContentSizeCategory = true
        label.textColor = UIColor(red: 0.08, green: 0.14, blue: 0.23, alpha: 1); stack.addArrangedSubview(label)
    }
    private func field(_ field: UITextField, key: String, content: UITextContentType) {
        field.placeholder = t(key); field.accessibilityLabel = t(key); field.borderStyle = .roundedRect
        field.font = .preferredFont(forTextStyle: .body); field.textContentType = content; field.autocorrectionType = .no; field.autocapitalizationType = .none
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 50).isActive = true
        stack.addArrangedSubview(field); actions.append(field)
    }
    private func button(_ button: UIButton, key: String, selector: Selector, primary: Bool = false) {
        var config = primary ? UIButton.Configuration.filled() : UIButton.Configuration.tinted()
        config.title = t(key); config.cornerStyle = .large; config.baseBackgroundColor = UIColor(red: 0.15, green: 0.47, blue: 0.72, alpha: 1)
        config.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 12, bottom: 14, trailing: 12)
        button.configuration = config; button.addTarget(self, action: selector, for: .touchUpInside)
        stack.addArrangedSubview(button); actions.append(button)
    }
    private func update() {
        mode.configuration?.title = t(registering ? "login" : "register")
        name.isHidden = !registering; password.isHidden = !usesEmail; confirm.isHidden = !registering || !usesEmail
        consentRow.isHidden = !registering; code.isHidden = !codeStep; resend.isHidden = !codeStep; back.isHidden = !codeStep
        emailMode.isHidden = api.region.euro || registering || codeStep
        emailMode.configuration?.title = t(emailLogin ? "phoneLogin" : "emailLogin")
        identity.placeholder = t(usesEmail ? "email" : "phone"); identity.accessibilityLabel = identity.placeholder
        identity.keyboardType = usesEmail ? .emailAddress : .phonePad
        identity.textContentType = usesEmail ? .username : .telephoneNumber
        password.textContentType = registering ? .newPassword : .password
        submit.configuration?.title = t(codeStep ? "continue" : usesEmail && !registering ? "login" : "send")
        identity.isEnabled = !busy && !codeStep; name.isEnabled = !busy && !codeStep
    }
    private func valid() -> Bool {
        let id = value(identity), secret = password.text ?? ""
        let identityValid = usesEmail ? id.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil
            : (10...15).contains(id.filter(\.isNumber).count)
        return identityValid && (!usesEmail || (!secret.isEmpty && secret.utf8.count <= 72)) && (!registering || (!value(name).isEmpty && consent.isOn && (!usesEmail || (secret.count >= 6 && secret == confirm.text))))
    }
    private func details() -> [String: Any] {
        var body: [String: Any] = [usesEmail ? "email" : "phone": value(identity)]
        if registering { body["name"] = value(name); body["termsAccepted"] = true }
        if usesEmail { body["password"] = password.text ?? "" }
        if codeStep { body["code"] = value(code) }
        return body
    }
    @objc private func toggleMode() { guard !busy else { return }; registering.toggle(); emailLogin = false; password.text = ""; confirm.text = ""; consent.isOn = false; reset() }
    @objc private func toggleEmail() { guard !busy else { return }; emailLogin.toggle(); identity.text = ""; password.text = ""; reset() }
    @objc private func reset() { guard !busy else { return }; codeStep = false; code.text = ""; notice.text = ""; update() }
    @objc private func send() {
        guard valid(), !codeStep || value(code).range(of: "^[0-9]{4,8}$", options: .regularExpression) != nil else { notice.text = t("invalid"); return }
        if !codeStep && (!usesEmail || registering) { sendCode(); return }
        let body = details(), path = registering ? "/auth/register" : "/auth/login", revision = generation
        run { [self] in
            let response = try await api.request(path, body: body)
            let session = try api.session(response)
            try await api.validate(session["accessToken"]!)
            try NativeAuthStore.shared.save(session, revision: revision)
            try await api.checkSite()
            password.text = ""; confirm.text = ""; code.text = ""
            openWorkspace(webAuth: false)
        }
    }
    @objc private func sendCode() {
        guard valid() else { notice.text = t("invalid"); return }
        guard Date() >= resendAt else { notice.text = t("wait"); return }
        var body = details(); body.removeValue(forKey: "password"); body.removeValue(forKey: "code")
        let path = registering ? "/auth/register/request-code" : "/auth/login/request-code"
        run { [self] in
            let response = try await api.request(path, body: body)
            resendAt = Date().addingTimeInterval(Double(max(60, min(600, response["retryAfter"] as? Int ?? 60))))
            codeStep = true; update(); notice.text = t("sent"); code.becomeFirstResponder()
        }
    }
    @objc private func restore() {
        run { [self] in
            let session = try await api.restore()
            try await api.checkSite()
            if session != nil { openWorkspace(webAuth: false) } else { notice.text = t("login") }
        }
    }
    @objc private func otherMethods() { run { [self] in try await api.checkSite(); openWorkspace(webAuth: true) } }
    @objc private func openLegal(_ sender: UIButton) {
        let paths = api.region.euro ? ["rules": "/service-rules", "privacy": "/privacy-policy", "offer": "/offer-terms"]
            : ["rules": "/pravila-servisa", "privacy": "/politika-konfidentsialnosti", "offer": "/publichnaya-oferta"]
        guard let key = sender.accessibilityIdentifier, let path = paths[key], let url = URL(string: api.region.origin + path) else { return }
        UIApplication.shared.open(url)
    }
    private func run(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }; busy = true; actions.forEach { $0.isEnabled = false }; notice.text = t("working")
        work = Task { [self] in
            defer { busy = false; actions.forEach { $0.isEnabled = true }; generation = NativeAuthStore.shared.revision; update() }
            do { notice.text = ""; try await operation() }
            catch { if !Task.isCancelled { notice.text = t((error as? NativeAuthFailure)?.key ?? "server") } }
        }
    }
    private func openWorkspace(webAuth: Bool) {
        view.endEditing(true)
        (UIApplication.shared.delegate as? AppDelegate)?.showWorkspace(webAuth: webAuth)
    }
    deinit { work?.cancel() }
}
