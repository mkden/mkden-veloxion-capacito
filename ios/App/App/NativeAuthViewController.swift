import UIKit
import CoreText
import AuthenticationServices

@MainActor private enum AuthAppearance {
    static let ink = UIColor(red: 0.08, green: 0.14, blue: 0.23, alpha: 1)
    static let muted = UIColor(red: 0.38, green: 0.44, blue: 0.55, alpha: 1)
    static let fontName: String? = {
        guard let url = Bundle.main.url(forResource: "Manrope", withExtension: "ttf", subdirectory: "public/fonts"),
              let provider = CGDataProvider(url: url as CFURL), let font = CGFont(provider), let name = font.postScriptName else { return nil }
        CTFontManagerRegisterGraphicsFont(font, nil)
        return name as String
    }()
    static func font(_ size: CGFloat, bold: Bool = false) -> UIFont {
        let base = fontName.flatMap { UIFont(name: $0, size: size) } ?? .systemFont(ofSize: size)
        let descriptor = base.fontDescriptor.addingAttributes([
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [NSNumber(value: 0x77676874): NSNumber(value: bold ? 700 : 500)]
        ])
        return UIFontMetrics.default.scaledFont(for: UIFont(descriptor: descriptor, size: size))
    }
}

@MainActor private final class AuthBackground: UIView {
    private let gradient = CAGradientLayer()
    override init(frame: CGRect) {
        super.init(frame: frame)
        gradient.colors = [UIColor(red: 0.87, green: 0.96, blue: 0.98, alpha: 1).cgColor, UIColor(red: 0.93, green: 0.96, blue: 0.98, alpha: 1).cgColor, UIColor(red: 0.93, green: 0.90, blue: 0.98, alpha: 1).cgColor]
        gradient.startPoint = .zero; gradient.endPoint = CGPoint(x: 1, y: 1); layer.addSublayer(gradient)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func layoutSubviews() { super.layoutSubviews(); gradient.frame = bounds }
}

@MainActor private final class AuthField: UITextField {
    override func textRect(forBounds bounds: CGRect) -> CGRect { bounds.insetBy(dx: 16, dy: 12) }
    override func editingRect(forBounds bounds: CGRect) -> CGRect { textRect(forBounds: bounds) }
}

@MainActor private final class AuthPrimaryButton: UIButton {
    private let gradient = CAGradientLayer()
    override init(frame: CGRect) {
        super.init(frame: frame)
        gradient.colors = [UIColor(red: 0.07, green: 0.70, blue: 0.85, alpha: 1).cgColor, UIColor(red: 0.43, green: 0.36, blue: 0.89, alpha: 1).cgColor, UIColor(red: 0.72, green: 0.26, blue: 0.69, alpha: 1).cgColor]
        gradient.startPoint = CGPoint(x: 0, y: 0.5); gradient.endPoint = CGPoint(x: 1, y: 0.5)
        layer.insertSublayer(gradient, at: 0); clipsToBounds = true
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override var isEnabled: Bool { didSet { alpha = isEnabled ? 1 : 0.55 } }
    override func layoutSubviews() { super.layoutSubviews(); gradient.frame = bounds; layer.cornerRadius = min(27, bounds.height / 2) }
}

/// UIKit remains the application root until authentication and site availability succeed.
@MainActor final class NativeAuthViewController: UIViewController, UITextFieldDelegate, ASWebAuthenticationPresentationContextProviding {
    private let api = NativeAuthApi()
    private let stack = UIStackView()
    private let name = AuthField(), identity = AuthField(), password = AuthField(), confirm = AuthField(), code = AuthField()
    private let consent = UIButton(type: .system)
    private let heading = UILabel(), intro = UILabel()
    private var rows: [ObjectIdentifier: UIStackView] = [:]
    private var fieldLabels: [ObjectIdentifier: UILabel] = [:]
    private let notice = UILabel()
    private let providerButton = UIButton(type: .system), providerOr = UILabel()
    private let vkButton = UIButton(type: .system), languageButton = UIButton(type: .system), brandSubtitle = UILabel()
    private var translatedLabels: [UILabel: String] = [:], translatedButtons: [UIButton: String] = [:]
    private var fieldKeys: [UITextField: String] = [:]
    private var dictionaries: [String: [String: String]] = [:]
    private var locale = "en"
    private var providerFlow: NativeOAuthFlow?
    private var webAuthentication: ASWebAuthenticationSession?
    private let loginTab = UIButton(type: .system), registerTab = UIButton(type: .system), submit = AuthPrimaryButton(frame: .zero), resend = UIButton(type: .system), back = UIButton(type: .system), emailMode = UIButton(type: .system)
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
              let data = try? Data(contentsOf: url), let locales = try? JSONSerialization.jsonObject(with: data) as? [String: [String: String]] else {
            preconditionFailure("Bundled authentication translations are missing")
        }
        dictionaries = locales
        if api.region.euro {
            guard let url = Bundle.main.url(forResource: "native-auth-euro", withExtension: "json", subdirectory: "public"),
                  let data = try? Data(contentsOf: url), let extra = try? JSONSerialization.jsonObject(with: data) as? [String: [String: String]] else {
                preconditionFailure("Bundled EURO translations are missing")
            }
            dictionaries.merge(extra) { _, new in new }
        }
        locale = api.region.euro ? NativeAuthLocale.current : "ru"
        guard let labels = dictionaries[locale] else { preconditionFailure("Missing authentication language") }
        strings = labels
        overrideUserInterfaceStyle = .light
        let backdrop = AuthBackground(frame: view.bounds); backdrop.autoresizingMask = [.flexibleWidth, .flexibleHeight]; view.insertSubview(backdrop, at: 0)
        let scroll = UIScrollView(); scroll.keyboardDismissMode = .interactive; scroll.alwaysBounceVertical = true
        scroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(scroll)
        let outer = UIStackView(); outer.axis = .vertical; outer.spacing = 22; outer.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(outer)
        let width = outer.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40); width.priority = .defaultHigh
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), scroll.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.contentLayoutGuide.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
            outer.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 24), outer.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            outer.leadingAnchor.constraint(greaterThanOrEqualTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
            outer.trailingAnchor.constraint(lessThanOrEqualTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
            outer.centerXAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerXAnchor), outer.widthAnchor.constraint(lessThanOrEqualToConstant: 520), width
        ])
        let brand = UIStackView(); brand.axis = .horizontal; brand.spacing = 12; brand.alignment = .center
        let logo = UIImageView(); logo.contentMode = .scaleAspectFit; logo.accessibilityLabel = "Veloxion AI"
        if let url = Bundle.main.url(forResource: "veloxion-logo", withExtension: "png", subdirectory: "public") { logo.image = UIImage(contentsOfFile: url.path) }
        NSLayoutConstraint.activate([logo.widthAnchor.constraint(equalToConstant: 48), logo.heightAnchor.constraint(equalToConstant: 48)])
        let brandText = UIStackView(); brandText.axis = .vertical; brandText.spacing = 4
        brandText.addArrangedSubview(label("Veloxion AI", size: 19, bold: true))
        configureLabel(brandSubtitle, size: 11, muted: true); brandSubtitle.text = (api.region.euro ? "EU / " : "") + t("brandSubtitle")
        brandText.addArrangedSubview(brandSubtitle)
        brand.addArrangedSubview(logo); brand.addArrangedSubview(brandText); outer.addArrangedSubview(brand)
        if api.region.euro {
            languageButton.titleLabel?.font = AuthAppearance.font(14, bold: true); languageButton.setTitleColor(AuthAppearance.ink, for: .normal)
            languageButton.backgroundColor = UIColor.white.withAlphaComponent(0.9); languageButton.layer.cornerRadius = 14
            languageButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 12, bottom: 12, right: 12)
            languageButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
            languageButton.setContentHuggingPriority(.required, for: .horizontal); languageButton.setContentCompressionResistancePriority(.required, for: .horizontal)
            languageButton.showsMenuAsPrimaryAction = true; actions.append(languageButton); brand.addArrangedSubview(languageButton)
            updateLanguageMenu()
        }
        let card = UIView(); card.backgroundColor = UIColor.white.withAlphaComponent(0.96); card.layer.cornerRadius = 26
        card.layer.borderWidth = 1; card.layer.borderColor = UIColor(red: 0.64, green: 0.76, blue: 0.83, alpha: 1).cgColor
        card.layer.shadowColor = AuthAppearance.ink.cgColor; card.layer.shadowOpacity = 0.08; card.layer.shadowRadius = 18; card.layer.shadowOffset = CGSize(width: 0, height: 6)
        stack.axis = .vertical; stack.spacing = 12; stack.translatesAutoresizingMaskIntoConstraints = false; card.addSubview(stack); outer.addArrangedSubview(card)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20), stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20), stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 22), stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -20)])
        configureLabel(heading, size: 26, bold: true); configureLabel(intro, size: 14, muted: true); stack.addArrangedSubview(heading); stack.addArrangedSubview(intro)
        let tabs = UIStackView(); tabs.axis = .horizontal; tabs.distribution = .fillEqually; tabs.spacing = 4
        tabs.isLayoutMarginsRelativeArrangement = true; tabs.layoutMargins = UIEdgeInsets(top: 4, left: 4, bottom: 4, right: 4); tabs.backgroundColor = UIColor(red: 0.87, green: 0.93, blue: 0.95, alpha: 1); tabs.layer.cornerRadius = 24
        for (tab, key, action) in [(loginTab, "login", #selector(selectLogin)), (registerTab, "register", #selector(selectRegister))] {
            styleButton(tab, key: key, selector: action); tab.layer.cornerRadius = 20; tabs.addArrangedSubview(tab)
        }
        stack.addArrangedSubview(tabs)
        button(providerButton, key: api.region.euro ? "googleLogin" : "yandexLogin", selector: #selector(startProviderButton))
        providerButton.layer.cornerRadius = 14; providerButton.layer.borderWidth = 1; providerButton.layer.borderColor = UIColor(red: 0.66, green: 0.78, blue: 0.84, alpha: 1).cgColor
        if api.region.euro, let url = Bundle.main.url(forResource: "google-g", withExtension: "png", subdirectory: "public"), let image = UIImage(contentsOfFile: url.path) {
            let resized = UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { _ in image.draw(in: CGRect(x: 0, y: 0, width: 20, height: 20)) }
            providerButton.setImage(resized.withRenderingMode(.alwaysOriginal), for: .normal)
            providerButton.imageEdgeInsets = UIEdgeInsets(top: 0, left: -10, bottom: 0, right: 10)
        }
        if !api.region.euro {
            button(vkButton, key: "vkLogin", selector: #selector(startVK))
            vkButton.backgroundColor = UIColor(red: 0, green: 0.47, blue: 1, alpha: 1); vkButton.setTitleColor(.white, for: .normal); vkButton.layer.cornerRadius = 14
        }
        configureLabel(providerOr, size: 12, muted: true); providerOr.text = t("providerOr"); providerOr.textAlignment = .center; stack.addArrangedSubview(providerOr)
        translatedLabels[providerOr] = "providerOr"
        field(name, key: "name", content: .name); name.autocapitalizationType = .words
        field(identity, key: usesEmail ? "email" : "phone", content: .username)
        field(password, key: "password", content: .password); password.isSecureTextEntry = true
        field(confirm, key: "confirm", content: .newPassword); confirm.isSecureTextEntry = true
        field(code, key: "code", content: .oneTimeCode); code.keyboardType = .numberPad
        identity.delegate = self
        styleButton(consent, key: "consent", selector: #selector(toggleConsent)); consent.titleLabel?.numberOfLines = 0; consent.titleLabel?.font = AuthAppearance.font(13)
        consent.contentHorizontalAlignment = .leading; consent.titleLabel?.textAlignment = .left; consent.isSelected = false; stack.addArrangedSubview(consent)
        let legal = UIStackView(); legal.axis = .horizontal; legal.distribution = .fillEqually; legal.spacing = 8
        for key in ["rules", "privacy", "offer"] {
            let link = UIButton(type: .system); link.setTitle(t(key + "Short"), for: .normal); link.accessibilityLabel = t(key); link.titleLabel?.font = AuthAppearance.font(12)
            link.titleLabel?.numberOfLines = 0; link.accessibilityIdentifier = key; link.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
            link.addTarget(self, action: #selector(openLegal(_:)), for: .touchUpInside); legal.addArrangedSubview(link)
            translatedButtons[link] = key + "Short"
        }
        stack.addArrangedSubview(legal)
        configureLabel(notice, size: 13, muted: true); notice.isHidden = true; notice.accessibilityTraits.insert(.updatesFrequently); stack.addArrangedSubview(notice)
        button(submit, key: "login", selector: #selector(send), primary: true)
        button(resend, key: "resend", selector: #selector(sendCode))
        button(back, key: "back", selector: #selector(reset))
        button(UIButton(type: .system), key: "retry", selector: #selector(restore))
        button(emailMode, key: "emailLogin", selector: #selector(toggleEmail))
        button(UIButton(type: .system), key: "other", selector: #selector(otherMethods))
        for key in ["offlineHint", "secure"] { let note = label(t(key), size: 12, muted: true); translatedLabels[note] = key; outer.addArrangedSubview(note) }
        update()
        if NativeAuthStore.shared.read() != nil { restore() }
    }
    private func configureLabel(_ label: UILabel, size: CGFloat, bold: Bool = false, muted: Bool = false) {
        label.numberOfLines = 0; label.font = AuthAppearance.font(size, bold: bold); label.adjustsFontForContentSizeCategory = true; label.textColor = muted ? AuthAppearance.muted : AuthAppearance.ink
    }
    private func label(_ text: String, size: CGFloat, bold: Bool = false, muted: Bool = false) -> UILabel {
        let view = UILabel(); view.text = text; configureLabel(view, size: size, bold: bold, muted: muted); return view
    }
    private func field(_ field: UITextField, key: String, content: UITextContentType) {
        let row = UIStackView(); row.axis = .vertical; row.spacing = 6
        let title = label(t(key), size: 13, bold: true, muted: true); row.addArrangedSubview(title); row.addArrangedSubview(field)
        field.placeholder = t(key); field.accessibilityLabel = t(key); field.backgroundColor = .white; field.textColor = AuthAppearance.ink; field.layer.cornerRadius = 14
        field.layer.borderWidth = 1; field.layer.borderColor = UIColor(red: 0.66, green: 0.78, blue: 0.84, alpha: 1).cgColor
        field.font = AuthAppearance.font(16); field.adjustsFontForContentSizeCategory = true; field.textContentType = content; field.autocorrectionType = .no; field.autocapitalizationType = .none
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 54).isActive = true
        stack.addArrangedSubview(row); rows[ObjectIdentifier(field)] = row; fieldLabels[ObjectIdentifier(field)] = title; actions.append(field)
        fieldKeys[field] = key; translatedLabels[title] = key
    }
    private func button(_ button: UIButton, key: String, selector: Selector, primary: Bool = false) {
        styleButton(button, key: key, selector: selector)
        if primary { button.setTitleColor(.white, for: .normal); button.heightAnchor.constraint(greaterThanOrEqualToConstant: 54).isActive = true }
        stack.addArrangedSubview(button)
    }
    private func styleButton(_ button: UIButton, key: String, selector: Selector) {
        translatedButtons[button] = key
        button.setTitle(t(key), for: .normal); button.titleLabel?.font = AuthAppearance.font(14, bold: true); button.titleLabel?.numberOfLines = 0
        button.setTitleColor(UIColor(red: 0.15, green: 0.33, blue: 0.48, alpha: 1), for: .normal)
        button.contentEdgeInsets = UIEdgeInsets(top: 12, left: 10, bottom: 12, right: 10); button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        button.addTarget(self, action: selector, for: .touchUpInside); actions.append(button)
    }
    private func showNotice(_ message: String) { notice.text = message; notice.isHidden = message.isEmpty }
    private func updateLanguageMenu() {
        languageButton.setTitle(locale.uppercased() + " ▾", for: .normal); languageButton.accessibilityLabel = t("language")
        languageButton.menu = UIMenu(title: t("language"), children: NativeAuthLocale.codes.enumerated().map { index, code in
            UIAction(title: NativeAuthLocale.labels[index], state: code == locale ? .on : .off) { [weak self] _ in self?.changeLanguage(code) }
        })
    }
    private func changeLanguage(_ next: String) {
        guard api.region.euro, !busy, providerFlow == nil, next != locale, NativeAuthLocale.codes.contains(next), let labels = dictionaries[next] else { return }
        let noticeKey = strings.first { $0.value == notice.text }?.key
        locale = next; strings = labels; UserDefaults.standard.set(next, forKey: NativeAuthLocale.key)
        translatedLabels.forEach { $0.key.text = t($0.value) }
        translatedButtons.forEach { button, key in
            button.setTitle(t(key), for: .normal)
            if let legal = button.accessibilityIdentifier { button.accessibilityLabel = t(legal) }
        }
        fieldKeys.forEach { field, key in field.placeholder = t(key); field.accessibilityLabel = t(key) }
        brandSubtitle.text = "EU / " + t("brandSubtitle"); updateLanguageMenu()
        if let key = noticeKey { showNotice(t(key)) }
        update()
    }
    func textField(_ textField: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String) -> Bool {
        guard textField === identity, !usesEmail else { return true }
        let edit = NativePhoneMask.edit(textField.text ?? "", location: range.location, length: range.length, replacement: string)
        textField.text = edit.text
        if let cursor = textField.position(from: textField.beginningOfDocument, offset: edit.selection) { textField.selectedTextRange = textField.textRange(from: cursor, to: cursor) }
        return false
    }
    private func update() {
        let editable = !busy && providerFlow == nil
        actions.forEach { $0.isEnabled = editable }
        providerButton.isHidden = codeStep; providerOr.isHidden = codeStep
        vkButton.isHidden = api.region.euro || codeStep
        heading.text = t(codeStep ? "codeTitle" : registering ? "registerTitle" : "loginTitle"); intro.text = t(codeStep ? "sent" : registering ? "registerIntro" : "loginIntro")
        loginTab.isSelected = !registering; registerTab.isSelected = registering
        for tab in [loginTab, registerTab] { tab.backgroundColor = tab.isSelected ? .white : .clear; tab.accessibilityTraits = tab.isSelected ? [.button, .selected] : .button }
        rows[ObjectIdentifier(name)]?.isHidden = !registering || codeStep; rows[ObjectIdentifier(password)]?.isHidden = !usesEmail || codeStep; rows[ObjectIdentifier(confirm)]?.isHidden = !registering || !usesEmail || codeStep
        consent.isHidden = !registering || codeStep; rows[ObjectIdentifier(code)]?.isHidden = !codeStep; resend.isHidden = !codeStep; back.isHidden = !codeStep
        consent.setImage(UIImage(systemName: consent.isSelected ? "checkmark.square.fill" : "square"), for: .normal); consent.accessibilityTraits = consent.isSelected ? [.button, .selected] : .button
        emailMode.isHidden = api.region.euro || registering || codeStep
        emailMode.setTitle(t(emailLogin ? "phoneLogin" : "emailLogin"), for: .normal)
        identity.placeholder = usesEmail ? "name@example.com" : "+7 (999) 123-45-67"; identity.accessibilityLabel = t(usesEmail ? "email" : "phone"); fieldLabels[ObjectIdentifier(identity)]?.text = identity.accessibilityLabel
        identity.keyboardType = usesEmail ? .emailAddress : .phonePad
        identity.textContentType = usesEmail ? .username : .telephoneNumber
        password.textContentType = registering ? .newPassword : .password
        submit.setTitle(t(codeStep ? "continue" : usesEmail && !registering ? "login" : "send"), for: .normal)
        identity.isEnabled = editable && !codeStep; name.isEnabled = editable && !codeStep
    }
    private func validationKey() -> String {
        let id = value(identity), secret = password.text ?? ""
        let identityValid = usesEmail ? id.range(of: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", options: .regularExpression) != nil
            : NativePhoneMask.complete(id)
        if !identityValid { return usesEmail ? "invalidEmail" : "invalidPhone" }
        if registering && value(name).isEmpty { return "invalidName" }
        if usesEmail && (secret.isEmpty || secret.utf8.count > 72 || (registering && (secret.count < 6 || secret != confirm.text))) { return "invalidPassword" }
        if registering && !consent.isSelected { return "invalidConsent" }
        return ""
    }
    private func valid() -> Bool { validationKey().isEmpty }
    private func details() -> [String: Any] {
        var body: [String: Any] = [usesEmail ? "email" : "phone": usesEmail ? value(identity) : NativePhoneMask.canonical(value(identity))]
        if registering { body["name"] = value(name); body["termsAccepted"] = true }
        if usesEmail { body["password"] = password.text ?? "" }
        if codeStep { body["code"] = value(code) }
        return body
    }
    @objc private func selectLogin() { selectMode(false) }
    @objc private func selectRegister() { selectMode(true) }
    private func selectMode(_ registration: Bool) {
        guard !busy, providerFlow == nil, registering != registration else { return }
        let wasEmail = usesEmail; registering = registration; emailLogin = false
        if wasEmail != usesEmail { identity.text = "" }
        password.text = ""; confirm.text = ""; consent.isSelected = false; reset()
    }
    @objc private func toggleConsent() { guard !busy else { return }; consent.isSelected.toggle(); update() }
    @objc private func toggleEmail() { guard !busy else { return }; emailLogin.toggle(); identity.text = ""; password.text = ""; reset() }
    @objc private func reset() { guard !busy else { return }; codeStep = false; code.text = ""; showNotice(""); update() }
    @objc private func send() {
        guard valid() else { showNotice(t(validationKey())); return }
        guard !codeStep || value(code).range(of: "^[0-9]{4,8}$", options: .regularExpression) != nil else { showNotice(t("invalidCode")); return }
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
        guard valid() else { showNotice(t(validationKey())); return }
        guard Date() >= resendAt else { showNotice(t("wait")); return }
        var body = details(); body.removeValue(forKey: "password"); body.removeValue(forKey: "code")
        let path = registering ? "/auth/register/request-code" : "/auth/login/request-code"
        run { [self] in
            let response = try await api.request(path, body: body)
            resendAt = Date().addingTimeInterval(Double(max(60, min(600, response["retryAfter"] as? Int ?? 60))))
            codeStep = true; update(); showNotice(t("sent")); code.becomeFirstResponder()
        }
    }
    @objc private func restore() {
        run { [self] in
            let session = try await api.restore()
            try await api.checkSite()
            if session != nil { openWorkspace(webAuth: false) } else { showNotice(t("login")) }
        }
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { view.window! }
    @objc private func startProviderButton() { startProvider(api.region.euro ? "google" : "yandex") }
    @objc private func startVK() { startProvider("vk") }
    private func startProvider(_ provider: String) {
        guard !busy, providerFlow == nil else { return }
        guard !registering || consent.isSelected else { showNotice(t("invalidConsent")); return }
        let flow: NativeOAuthFlow
        do { flow = try NativeOAuthFlow(bundle: Bundle.main.bundleIdentifier!, selectedProvider: provider) }
        catch { showNotice(t("server")); return }
        let revision = NativeAuthStore.shared.revision
        let body: [String: Any] = ["provider": flow.provider, "platform": "ios", "state": flow.state,
                                  "codeChallenge": flow.challenge, "intent": registering ? "register" : "login", "termsAccepted": registering && consent.isSelected]
        view.endEditing(true)
        run { [self] in
            let response = try await api.request("/auth/native/start", body: body)
            guard NativeAuthStore.shared.revision == revision else { throw NativeAuthFailure("expired") }
            let url = try flow.authorization(response["authorizationUrl"] as? String ?? "")
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: flow.scheme) { [weak self] url, error in
                Task { @MainActor [weak self] in
                    guard let self = self, self.providerFlow?.state == flow.state else { return }
                    self.webAuthentication = nil; self.providerFlow = nil; self.update()
                    guard error == nil, let url = url else { self.showNotice(self.t("providerCancelled")); return }
                    self.finishProvider(flow, url: url, revision: revision)
                }
            }
            session.presentationContextProvider = self
            webAuthentication = session; providerFlow = flow
            guard session.start() else { webAuthentication = nil; providerFlow = nil; throw NativeAuthFailure("providerUnavailable") }
            showNotice(t("providerWaiting"))
        }
    }
    private func finishProvider(_ flow: NativeOAuthFlow, url: URL, revision: Int) {
        let callback: [String: String]
        do { callback = try flow.callback(url) }
        catch { showNotice(t("denied")); return }
        guard NativeAuthStore.shared.revision == revision else { showNotice(t("expired")); return }
        if let error = callback["error"] {
            if error == "registration_required" { selectMode(true); showNotice(t("registrationRequired")) }
            else { showNotice(t(error == "cancelled" ? "providerCancelled" : "denied")) }
            return
        }
        guard let code = callback["code"] else { showNotice(t("denied")); return }
        run { [self] in
            let response = try await api.request("/auth/native/exchange", body: ["code": code, "codeVerifier": flow.verifier])
            let session = try api.session(response)
            try await api.validate(session["accessToken"]!)
            try NativeAuthStore.shared.save(session, revision: revision)
            try await api.checkSite()
            password.text = ""; confirm.text = ""; self.code.text = ""
            openWorkspace(webAuth: false)
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
        guard !busy, providerFlow == nil else { return }; busy = true; actions.forEach { $0.isEnabled = false }; showNotice(t("working"))
        work = Task { [self] in
            defer {
                busy = false; actions.forEach { $0.isEnabled = true }; generation = NativeAuthStore.shared.revision; update()
                if codeStep { code.becomeFirstResponder() }
            }
            do { try await operation() }
            catch { if !Task.isCancelled { showNotice(t((error as? NativeAuthFailure)?.key ?? "server")) } }
        }
    }
    private func openWorkspace(webAuth: Bool) {
        view.endEditing(true)
        (UIApplication.shared.delegate as? AppDelegate)?.showWorkspace(webAuth: webAuth)
    }
    deinit { work?.cancel(); webAuthentication?.cancel() }
}
