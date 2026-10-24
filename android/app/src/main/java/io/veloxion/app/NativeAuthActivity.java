package io.veloxion.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Bundled Android views: no WebView or internet is needed to render the form. */
public class NativeAuthActivity extends AppCompatActivity {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ArrayList<View> controls = new ArrayList<>();
    private NativeAuthApi api;
    private AuthSessionStore store;
    private JSONObject strings;
    private LinearLayout content;
    private EditText name, identity, password, confirm, code;
    private CheckBox consent;
    private TextView notice;
    private Button submit, resend, back, mode, emailMode;
    private boolean registering, codeStep, emailLogin, busy;
    private long resendAt;
    private int generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        api = new NativeAuthApi(this); store = new AuthSessionStore(this);
        generation = AuthSessionStore.revision.get();
        try (java.io.InputStream input = getAssets().open("public/native-auth.json")) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            JSONObject locales = new JSONObject(output.toString("UTF-8"));
            strings = locales.getJSONObject(!api.euro || Locale.getDefault().getLanguage().equals("ru") ? "ru" : "en");
        } catch (Exception error) { throw new IllegalStateException("Bundled authentication translations are missing", error); }
        build();
        if (store.read() != null) restore();
    }

    private String t(String key) { return strings.optString(key, key); }
    private int dp(int size) { return Math.round(size * getResources().getDisplayMetrics().density); }
    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); return drawable;
    }
    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(Color.rgb(20,35,58));
        if (bold) view.setTypeface(null, Typeface.BOLD);
        view.setPadding(0, dp(8), 0, dp(8)); content.addView(view); return view;
    }
    private EditText field(String key, int type) {
        EditText view = new EditText(this); view.setHint(t(key)); view.setTextSize(16); view.setInputType(type);
        view.setSingleLine(true); view.setTextColor(Color.rgb(20,35,58)); view.setHintTextColor(Color.rgb(97,113,139));
        view.setPadding(dp(16),dp(14),dp(16),dp(14));
        GradientDrawable bg = background(Color.WHITE, 14); bg.setStroke(dp(1), Color.rgb(168,198,214)); view.setBackground(bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, -2); params.topMargin=dp(12);
        content.addView(view, params); controls.add(view); return view;
    }
    private Button button(String key, Runnable action, boolean primary) {
        Button view = new Button(this); view.setText(t(key)); view.setAllCaps(false); view.setTextSize(15);
        view.setMinHeight(dp(50)); view.setPadding(dp(10),dp(10),dp(10),dp(10));
        view.setTextColor(primary ? Color.WHITE : Color.rgb(37,84,122));
        GradientDrawable bg = primary ? new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{Color.rgb(17,178,216),Color.rgb(110,91,226),Color.rgb(184,66,175)}) : background(Color.rgb(242,248,252),14);
        bg.setCornerRadius(dp(14)); view.setBackground(bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1,-2); params.topMargin=dp(12);
        content.addView(view,params); controls.add(view); view.setOnClickListener(v -> { if (!busy) action.run(); }); return view;
    }
    private void build() {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xffdff4fa,0xffedf5f9,0xffece7fa}));
        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(26),dp(30),dp(26),dp(28));
        android.widget.FrameLayout.LayoutParams layout = new android.widget.FrameLayout.LayoutParams(-1,-2,android.view.Gravity.CENTER);
        frame.addView(content,layout); scroll.addView(frame); setContentView(scroll);
        ViewCompat.setOnApplyWindowInsetsListener(scroll, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            view.setPadding(insets.left,insets.top,insets.right,insets.bottom); return windowInsets;
        });
        scroll.post(() -> { if (scroll.getWidth() > dp(560)) { layout.width = dp(560); content.setLayoutParams(layout); } });
        text(api.euro ? "VELOXION AI / EUROPE" : "VELOXION AI", 14, true);
        text(t("title"), 30, true); text(t("intro"), 15, false);
        mode = button("register", () -> { registering=!registering; emailLogin=false; password.setText(""); confirm.setText(""); consent.setChecked(false); resetCode(); update(); }, false);
        name = field("name", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        identity = field(api.euro ? "email" : "phone", api.euro ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS : InputType.TYPE_CLASS_PHONE);
        password = field("password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        confirm = field("confirm", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        code = field("code", InputType.TYPE_CLASS_NUMBER);
        code.setAutofillHints("smsOTPCode");
        consent = new CheckBox(this); consent.setText(t("consent")); consent.setTextColor(0xff344963); consent.setPadding(0,dp(12),0,dp(8));
        content.addView(consent); controls.add(consent);
        LinearLayout legal = new LinearLayout(this); legal.setOrientation(LinearLayout.HORIZONTAL);
        String[] keys={"rules","privacy","offer"};
        String[] paths=api.euro ? new String[]{"/service-rules","/privacy-policy","/offer-terms"} : new String[]{"/pravila-servisa","/politika-konfidentsialnosti","/publichnaya-oferta"};
        for (int i=0;i<keys.length;i++) {
            TextView link = new TextView(this); link.setText(t(keys[i])); link.setTextColor(0xff276b94); link.setTextSize(12); link.setPadding(dp(4),dp(14),dp(4),dp(14));
            final String path=paths[i]; link.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(api.origin+path))));
            legal.addView(link,new LinearLayout.LayoutParams(0,-2,1));
        }
        content.addView(legal);
        notice = text("",14,false); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        submit = button("login", this::submit, true);
        resend = button("resend", this::sendCode, false);
        back = button("back", () -> { resetCode(); update(); }, false);
        button("retry", this::restore, false);
        emailMode = button("emailLogin", () -> { emailLogin=!emailLogin; resetCode(); identity.setText(""); password.setText(""); update(); }, false);
        button("other", () -> run(form -> { api.checkSite(); return null; }, ignored -> openWorkspace(true)), false);
        text(t("secure"),12,false); update();
    }

    private String value(EditText field) { return field.getText().toString().trim(); }
    private boolean usesEmail() { return api.euro || emailLogin; }
    private JSONObject details() throws Exception {
        JSONObject body = new JSONObject().put(usesEmail()?"email":"phone", value(identity));
        if (registering) body.put("name",value(name)).put("termsAccepted",true);
        if (usesEmail()) body.put("password",password.getText().toString());
        if (codeStep) body.put("code",value(code));
        return body;
    }
    private boolean valid() {
        boolean identityValid = usesEmail() ? android.util.Patterns.EMAIL_ADDRESS.matcher(value(identity)).matches()
            : value(identity).replaceAll("[^0-9]", "").matches("[0-9]{10,15}");
        String secret=password.getText().toString();
        return identityValid && (!usesEmail() || (!secret.isEmpty() && secret.getBytes(StandardCharsets.UTF_8).length<=72))
            && (!registering || (!value(name).isEmpty() && consent.isChecked()
                && (!usesEmail() || (secret.length()>=6 && secret.equals(confirm.getText().toString())))));
    }
    private void submit() {
        if (!valid() || (codeStep && !value(code).matches("[0-9]{4,8}"))) { notice.setText(t("invalid")); return; }
        if (!codeStep && (!usesEmail() || registering)) { sendCode(); return; }
        run(form -> {
            JSONObject session = api.session(api.request(registering?"/auth/register":"/auth/login",form,null));
            api.validate(session.getString("accessToken")); store.save(session,generation); api.checkSite(); return session;
        }, ignored -> { password.setText(""); confirm.setText(""); code.setText(""); openWorkspace(false); });
    }
    private void sendCode() {
        if (!valid()) { notice.setText(t("invalid")); return; }
        if (SystemClock.elapsedRealtime()<resendAt) { notice.setText(t("wait")); return; }
        run(body -> {
            body.remove("password"); body.remove("code");
            return api.request(registering?"/auth/register/request-code":"/auth/login/request-code",body,null);
        }, data -> {
            resendAt=SystemClock.elapsedRealtime()+Math.max(60, Math.min(600, data.optInt("retryAfter",60)))*1000L;
            codeStep=true; update(); notice.setText(t("sent")); code.requestFocus();
        });
    }
    private void resetCode() { codeStep=false; if (code!=null) code.setText(""); if (notice!=null) notice.setText(""); }
    private void update() {
        mode.setText(t(registering?"login":"register"));
        name.setVisibility(registering?View.VISIBLE:View.GONE);
        password.setVisibility(usesEmail()?View.VISIBLE:View.GONE);
        confirm.setVisibility(registering && usesEmail()?View.VISIBLE:View.GONE);
        consent.setVisibility(registering?View.VISIBLE:View.GONE);
        code.setVisibility(codeStep?View.VISIBLE:View.GONE); resend.setVisibility(codeStep?View.VISIBLE:View.GONE); back.setVisibility(codeStep?View.VISIBLE:View.GONE);
        emailMode.setVisibility(!api.euro && !registering && !codeStep?View.VISIBLE:View.GONE); emailMode.setText(t(emailLogin?"phoneLogin":"emailLogin"));
        identity.setHint(t(usesEmail()?"email":"phone")); identity.setInputType(usesEmail()?InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS:InputType.TYPE_CLASS_PHONE);
        submit.setText(t(codeStep?"continue":usesEmail()&&!registering?"login":"send"));
        identity.setEnabled(!busy && !codeStep); name.setEnabled(!busy && !codeStep);
    }
    private void restore() {
        run(form -> { JSONObject session=api.restore(store); api.checkSite(); return session; }, session -> {
            generation=AuthSessionStore.revision.get();
            if (session!=null) openWorkspace(false); else notice.setText(t("login"));
        });
    }
    private interface Task { JSONObject run(JSONObject form) throws Exception; }
    private interface Done { void accept(JSONObject result); }
    private void run(Task task, Done done) {
        if (busy) return; busy=true; controls.forEach(v->v.setEnabled(false)); notice.setText(t("working"));
        // Snapshot form values on the UI thread; only network and secure storage run in the worker.
        final JSONObject form;
        try { form=details(); } catch (Exception ignored) { busy=false; controls.forEach(v->v.setEnabled(true)); update(); return; }
        worker.execute(() -> {
            JSONObject result=null; String error=null;
            try { result=task.run(form); } catch (Exception failure) { error=failure instanceof NativeAuthApi.Failure?((NativeAuthApi.Failure)failure).key:"server"; }
            JSONObject output=result; String problem=error;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                busy=false; controls.forEach(v->v.setEnabled(true)); generation=AuthSessionStore.revision.get(); update();
                if (problem==null) { notice.setText(""); done.accept(output); } else notice.setText(t(problem));
            });
        });
    }
    private void openWorkspace(boolean webAuth) {
        Intent intent=new Intent(this,MainActivity.class);
        // Preserve cold-start notification payloads across the native authentication gate.
        if (getIntent().getExtras()!=null) intent.putExtras(getIntent().getExtras());
        intent.putExtra("webAuthAllowed",webAuth).putExtra("webAuthStarted",false);
        startActivity(intent); finish();
    }
    @Override protected void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
}
