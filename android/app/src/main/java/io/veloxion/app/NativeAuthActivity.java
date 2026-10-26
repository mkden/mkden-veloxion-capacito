package io.veloxion.app;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.BitmapFactory;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.SystemClock;
import android.text.InputType;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.browser.customtabs.CustomTabsIntent;
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
    private JSONObject locales;
    private String locale;
    private final java.util.Map<TextView,String> translations=new java.util.HashMap<>();
    private final java.util.Map<EditText,String> fieldKeys=new java.util.HashMap<>();
    private TextView brandSubtitle;
    private Spinner languagePicker;
    private LinearLayout content;
    private final java.util.Map<EditText, LinearLayout> rows = new java.util.HashMap<>();
    private Typeface font, strongFont;
    private TextView heading, intro, identityLabel;
    private EditText name, identity, password, confirm, code;
    private CheckBox consent;
    private TextView notice;
    private Button submit, resend, back, loginTab, registerTab, emailMode;
    private Button providerButton, vkButton;
    private TextView providerOr;
    private NativeOAuthFlow oauthFlow;
    private boolean oauthLeft;
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
            locales = new JSONObject(output.toString("UTF-8"));
            if (api.euro) try (java.io.InputStream extra=getAssets().open("public/native-auth-euro.json")) {
                java.io.ByteArrayOutputStream data=new java.io.ByteArrayOutputStream();
                while ((count=extra.read(buffer))!=-1) data.write(buffer,0,count);
                JSONObject additional=new JSONObject(data.toString("UTF-8"));
                for (String key:NativeAuthLocale.CODES) if (additional.has(key)) locales.put(key,additional.getJSONObject(key));
            }
            try (java.io.InputStream check=getAssets().open("public/native-browser-check.json")) {
                java.io.ByteArrayOutputStream data=new java.io.ByteArrayOutputStream();
                while ((count=check.read(buffer))!=-1) data.write(buffer,0,count);
                JSONObject checks=new JSONObject(data.toString("UTF-8"));
                for (java.util.Iterator<String> codes=locales.keys();codes.hasNext();) {
                    String key=codes.next(); JSONObject extra=checks.getJSONObject(key), dictionary=locales.getJSONObject(key);
                    for (java.util.Iterator<String> keys=extra.keys();keys.hasNext();) { String name=keys.next(); dictionary.put(name,extra.getString(name)); }
                }
            }
            locale=api.euro?NativeAuthLocale.resolve(getSharedPreferences(NativeAuthLocale.PREFERENCES,MODE_PRIVATE).getString(NativeAuthLocale.KEY,""),Locale.getDefault().toLanguageTag()):"ru";
            strings = locales.getJSONObject(locale);
        } catch (Exception error) { throw new IllegalStateException("Bundled authentication translations are missing", error); }
        build();
        if (isProviderCallback(getIntent())) showNotice(t("expired"));
        else if (!getIntent().getBooleanExtra("skipRestore", false) && store.read() != null) restore();
    }

    private String t(String key) { return strings.optString(key, key); }
    private int dp(int size) { return Math.round(size * getResources().getDisplayMetrics().density); }
    private GradientDrawable background(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable(); drawable.setColor(color); drawable.setCornerRadius(dp(radius)); return drawable;
    }
    private TextView text(String value, int size, boolean bold) {
        TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(Color.rgb(20,35,58));
        view.setTypeface(bold ? strongFont : font);
        view.setPadding(0, dp(6), 0, dp(6)); content.addView(view); return view;
    }
    private EditText field(String key, int type) {
        LinearLayout row = new LinearLayout(this); row.setOrientation(LinearLayout.VERTICAL);
        TextView label = new TextView(this); label.setText(t(key)); label.setTextSize(13); label.setTypeface(strongFont); label.setTextColor(0xff435972);
        label.setPadding(0,dp(12),0,dp(6)); row.addView(label);
        EditText view = new EditText(this); view.setHint(t(key)); view.setTextSize(16); view.setInputType(type); view.setTypeface(font); view.setMinHeight(dp(54));
        view.setSingleLine(true); view.setTextColor(Color.rgb(20,35,58)); view.setHintTextColor(Color.rgb(97,113,139));
        view.setPadding(dp(16),dp(14),dp(16),dp(14));
        GradientDrawable bg = background(Color.WHITE, 14); bg.setStroke(dp(1), Color.rgb(168,198,214)); view.setBackground(bg);
        row.addView(view,new LinearLayout.LayoutParams(-1,-2)); content.addView(row); rows.put(view,row);
        translations.put(label,key); fieldKeys.put(view,key); controls.add(view); return view;
    }
    private Button button(String key, Runnable action, boolean primary) {
        Button view = new Button(this); view.setText(t(key)); view.setAllCaps(false); view.setTextSize(15);
        view.setTypeface(strongFont); view.setMinHeight(dp(primary?54:44)); view.setPadding(dp(10),dp(10),dp(10),dp(10));
        view.setStateListAnimator(null); view.setElevation(0);
        view.setTextColor(primary ? Color.WHITE : Color.rgb(37,84,122));
        GradientDrawable bg = primary ? new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
            new int[]{Color.rgb(17,178,216),Color.rgb(110,91,226),Color.rgb(184,66,175)}) : background(Color.rgb(242,248,252),14);
        bg.setCornerRadius(dp(primary?27:14)); view.setBackgroundTintList(null); view.setBackground(bg);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1,-2); params.topMargin=dp(12);
        content.addView(view,params); translations.put(view,key); controls.add(view); view.setOnClickListener(v -> { if (!busy) action.run(); }); return view;
    }
    private void build() {
        try {
            if (android.os.Build.VERSION.SDK_INT>=26) {
                font=new Typeface.Builder(getAssets(),"public/fonts/Manrope.ttf").setFontVariationSettings("'wght' 500").setWeight(500).build();
                strongFont=new Typeface.Builder(getAssets(),"public/fonts/Manrope.ttf").setFontVariationSettings("'wght' 700").setWeight(700).build();
            } else { font=Typeface.createFromAsset(getAssets(),"public/fonts/Manrope.ttf"); strongFont=Typeface.create(font,Typeface.BOLD); }
        } catch (RuntimeException ignored) { font=Typeface.DEFAULT; strongFont=Typeface.DEFAULT_BOLD; }
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        scroll.setBackground(new GradientDrawable(GradientDrawable.Orientation.TL_BR, new int[]{0xffdff4fa,0xffedf5f9,0xffece7fa}));
        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        LinearLayout outer = new LinearLayout(this); outer.setOrientation(LinearLayout.VERTICAL); outer.setPadding(dp(20),dp(24),dp(20),dp(24));
        android.widget.FrameLayout.LayoutParams layout = new android.widget.FrameLayout.LayoutParams(-1,-2,android.view.Gravity.TOP|android.view.Gravity.CENTER_HORIZONTAL);
        frame.addView(outer,layout); scroll.addView(frame); setContentView(scroll);
        ViewCompat.setOnApplyWindowInsetsListener(scroll, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            view.setPadding(insets.left,insets.top,insets.right,insets.bottom); return windowInsets;
        });
        scroll.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob) -> {
            int width=Math.min(dp(560),r-l-scroll.getPaddingLeft()-scroll.getPaddingRight());
            if (layout.width!=width) { layout.width=width; outer.setLayoutParams(layout); }
        });
        LinearLayout brand = new LinearLayout(this); brand.setGravity(android.view.Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this); logo.setContentDescription("Veloxion AI");
        try (java.io.InputStream image=getAssets().open("public/veloxion-logo.png")) { logo.setImageBitmap(BitmapFactory.decodeStream(image)); } catch (Exception ignored) {}
        brand.addView(logo,new LinearLayout.LayoutParams(dp(48),dp(48)));
        content=new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(12),0,0,0);
        text("Veloxion AI",18,true); brandSubtitle=text(api.euro?"EU / "+t("brandSubtitle"):t("brandSubtitle"),11,false); brandSubtitle.setTextColor(0xff61718b);
        brand.addView(content,new LinearLayout.LayoutParams(0,-2,1)); outer.addView(brand);
        if (api.euro) {
            languagePicker=new Spinner(this); languagePicker.setContentDescription(t("language"));
            ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,NativeAuthLocale.LABELS);
            languagePicker.setAdapter(adapter); languagePicker.setBackground(background(0xe6ffffff,14));
            languagePicker.setMinimumHeight(dp(48)); languagePicker.setMinimumWidth(dp(104));
            languagePicker.setSelection(java.util.Arrays.asList(NativeAuthLocale.CODES).indexOf(locale));
            brand.addView(languagePicker,new LinearLayout.LayoutParams(-2,-2)); controls.add(languagePicker);
            languagePicker.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
                public void onNothingSelected(AdapterView<?> parent) {}
                public void onItemSelected(AdapterView<?> parent,View view,int position,long id) {
                    if (!busy && oauthFlow==null) changeLanguage(NativeAuthLocale.CODES[position]);
                }
            });
        }
        content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(20),dp(20),dp(20),dp(20));
        GradientDrawable card=background(0xf5ffffff,26); card.setStroke(dp(1),0xffa3c3d4); content.setBackground(card); content.setElevation(dp(3));
        LinearLayout.LayoutParams cardLayout=new LinearLayout.LayoutParams(-1,-2); cardLayout.topMargin=dp(22); cardLayout.bottomMargin=dp(16); outer.addView(content,cardLayout);
        heading=text("",26,true); intro=text("",14,false); intro.setTextColor(0xff61718b);
        LinearLayout tabs = new LinearLayout(this); tabs.setPadding(dp(4),dp(4),dp(4),dp(4)); tabs.setBackground(background(0xffdfedf3,24));
        loginTab=new Button(this); registerTab=new Button(this);
        Button[] tabButtons={loginTab,registerTab};
        for (int i=0;i<tabButtons.length;i++) {
            Button tab=tabButtons[i]; final boolean registration=i==1; tab.setAllCaps(false); tab.setText(t(registration?"register":"login")); tab.setTextSize(14); tab.setTypeface(strongFont);
            tab.setStateListAnimator(null); tab.setElevation(0);
            tab.setPadding(dp(8),dp(10),dp(8),dp(10)); tab.setMinHeight(dp(44)); tab.setMinimumWidth(0); tab.setBackgroundTintList(null);
            tab.setOnClickListener(v -> selectMode(registration)); tabs.addView(tab,new LinearLayout.LayoutParams(0,-2,1)); controls.add(tab);
        }
        LinearLayout.LayoutParams tabLayout=new LinearLayout.LayoutParams(-1,-2); tabLayout.topMargin=dp(16); tabLayout.bottomMargin=dp(4); content.addView(tabs,tabLayout);
        providerButton=button(api.euro?"googleLogin":"yandexLogin",()->startProvider(api.euro?"google":"yandex"),false);
        GradientDrawable providerBackground=background(Color.WHITE,14); providerBackground.setStroke(dp(1),0xffa8c6d6); providerButton.setBackground(providerBackground);
        if (api.euro) try (java.io.InputStream input=getAssets().open("public/google-g.png")) {
            android.graphics.drawable.BitmapDrawable logoDrawable=new android.graphics.drawable.BitmapDrawable(getResources(),BitmapFactory.decodeStream(input));
            logoDrawable.setBounds(0,0,dp(20),dp(20)); providerButton.setCompoundDrawablesRelative(logoDrawable,null,null,null); providerButton.setCompoundDrawablePadding(dp(12));
        } catch (Exception ignored) {}
        if (!api.euro) {
            vkButton=button("vkLogin",()->startProvider("vk"),false);
            vkButton.setTextColor(Color.WHITE); vkButton.setBackground(background(0xff0077ff,14));
        }
        providerOr=text(t("providerOr"),12,false); translations.put(providerOr,"providerOr"); providerOr.setGravity(android.view.Gravity.CENTER); providerOr.setTextColor(0xff61718b);
        name = field("name", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        identity = field(api.euro ? "email" : "phone", api.euro ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS : InputType.TYPE_CLASS_PHONE);
        identityLabel=(TextView)rows.get(identity).getChildAt(0);
        identity.addTextChangedListener(new TextWatcher() {
            private String previous="", replacement=""; private int start, count; private boolean formatting;
            public void beforeTextChanged(CharSequence s,int at,int length,int after) { if (!formatting) { previous=s.toString(); start=at; count=length; } }
            public void onTextChanged(CharSequence s,int at,int before,int length) { if (!formatting) replacement=s.subSequence(at,at+length).toString(); }
            public void afterTextChanged(Editable value) {
                if (formatting || usesEmail()) return;
                NativePhoneMask.Edit result=NativePhoneMask.edit(previous,start,count,replacement);
                formatting=true; identity.setText(result.text); identity.setSelection(result.selection); formatting=false;
            }
        });
        password = field("password", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        confirm = field("confirm", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        code = field("code", InputType.TYPE_CLASS_NUMBER);
        code.setAutofillHints("smsOTPCode");
        consent = new CheckBox(this); consent.setText(t("consent")); consent.setTypeface(font); consent.setTextSize(13); consent.setChecked(false); consent.setTextColor(0xff344963); consent.setPadding(0,dp(12),0,dp(8)); consent.setMinHeight(dp(48));
        content.addView(consent); translations.put(consent,"consent"); controls.add(consent);
        LinearLayout legal = new LinearLayout(this); legal.setOrientation(LinearLayout.HORIZONTAL);
        String[] keys={"rules","privacy","offer"};
        String[] paths=api.euro ? new String[]{"/service-rules","/privacy-policy","/offer-terms"} : new String[]{"/pravila-servisa","/politika-konfidentsialnosti","/publichnaya-oferta"};
        for (int i=0;i<keys.length;i++) {
            TextView link = new TextView(this); link.setText(t(keys[i]+"Short")); link.setContentDescription(t(keys[i])); link.setTypeface(font); link.setGravity(android.view.Gravity.CENTER); link.setMinHeight(dp(44)); link.setTextColor(0xff276b94); link.setTextSize(12); link.setPadding(dp(2),dp(12),dp(2),dp(12));
            final String path=paths[i]; link.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(api.origin+path))));
            translations.put(link,keys[i]+"Short"); link.setTag(keys[i]); legal.addView(link,new LinearLayout.LayoutParams(0,-2,1));
        }
        content.addView(legal);
        notice = text("",13,false); notice.setPadding(dp(12),dp(12),dp(12),dp(12)); notice.setBackground(background(0xffeaf5fb,12)); notice.setVisibility(View.GONE); notice.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        submit = button("login", this::submit, true);
        resend = button("resend", this::sendCode, false);
        back = button("back", () -> { resetCode(); update(); }, false);
        button("retry", this::restore, false);
        emailMode = button("emailLogin", () -> { emailLogin=!emailLogin; resetCode(); identity.setText(""); password.setText(""); update(); }, false);
        button("other", () -> run(form -> { api.checkSite(); return null; }, ignored -> openWorkspace(true)), false);
        content=outer; TextView offline=text(t("offlineHint"),12,false); translations.put(offline,"offlineHint"); offline.setTextColor(0xff61718b); TextView secure=text(t("secure"),11,false); translations.put(secure,"secure"); secure.setTextColor(0xff61718b); update();
    }

    private void changeLanguage(String next) {
        if (!api.euro || next.equals(locale) || !NativeAuthLocale.supported(next) || busy || oauthFlow!=null) return;
        String noticeKey="";
        for (java.util.Iterator<String> keys=strings.keys();keys.hasNext();) { String key=keys.next(); if (t(key).contentEquals(notice.getText())) noticeKey=key; }
        locale=next; strings=locales.optJSONObject(next);
        getSharedPreferences(NativeAuthLocale.PREFERENCES,MODE_PRIVATE).edit().putString(NativeAuthLocale.KEY,next).apply();
        translations.forEach((view,key)->{ view.setText(t(key)); if (view.getTag() instanceof String) view.setContentDescription(t((String)view.getTag())); });
        fieldKeys.forEach((view,key)->view.setHint(t(key)));
        loginTab.setText(t("login")); registerTab.setText(t("register")); brandSubtitle.setText("EU / "+t("brandSubtitle")); languagePicker.setContentDescription(t("language"));
        if (!noticeKey.isEmpty()) showNotice(t(noticeKey));
        update();
    }

    private void selectMode(boolean registration) {
        if (busy || oauthFlow!=null || registering==registration) return;
        boolean wasEmail=usesEmail(); registering=registration; emailLogin=false;
        if (wasEmail!=usesEmail()) identity.setText("");
        password.setText(""); confirm.setText(""); consent.setChecked(false); resetCode(); update();
    }
    private void showNotice(String message) { notice.setText(message); notice.setVisibility(message.isEmpty()?View.GONE:View.VISIBLE); }
    private void visible(EditText field,boolean show) { rows.get(field).setVisibility(show?View.VISIBLE:View.GONE); }

    private String value(EditText field) { return field.getText().toString().trim(); }
    private boolean usesEmail() { return api.euro || emailLogin; }
    private JSONObject details() throws Exception {
        JSONObject body = new JSONObject().put(usesEmail()?"email":"phone", usesEmail()?value(identity):NativePhoneMask.canonical(value(identity)));
        if (registering) body.put("name",value(name)).put("termsAccepted",true);
        if (usesEmail()) body.put("password",password.getText().toString());
        if (codeStep) body.put("code",value(code));
        return body;
    }
    private String validationKey() {
        boolean identityValid = usesEmail() ? android.util.Patterns.EMAIL_ADDRESS.matcher(value(identity)).matches()
            : NativePhoneMask.complete(value(identity));
        String secret=password.getText().toString();
        if (!identityValid) return usesEmail()?"invalidEmail":"invalidPhone";
        if (registering && value(name).isEmpty()) return "invalidName";
        if (usesEmail() && (secret.isEmpty() || secret.getBytes(StandardCharsets.UTF_8).length>72
            || (registering && (secret.length()<6 || !secret.equals(confirm.getText().toString()))))) return "invalidPassword";
        if (registering && !consent.isChecked()) return "invalidConsent";
        return "";
    }
    private boolean valid() { return validationKey().isEmpty(); }
    private void submit() {
        if (!valid()) { showNotice(t(validationKey())); return; }
        if (codeStep && !value(code).matches("[0-9]{4,8}")) { showNotice(t("invalidCode")); return; }
        if (!codeStep && (!usesEmail() || registering)) { sendCode(); return; }
        run(form -> {
            JSONObject session = api.session(api.request(registering?"/auth/register":"/auth/login",form,null));
            api.validate(session.getString("accessToken")); store.save(session,generation); api.checkSite(); return session;
        }, ignored -> { password.setText(""); confirm.setText(""); code.setText(""); openWorkspace(false); });
    }
    private void sendCode() {
        if (!valid()) { showNotice(t(validationKey())); return; }
        if (SystemClock.elapsedRealtime()<resendAt) { showNotice(t("wait")); return; }
        run(body -> {
            body.remove("password"); body.remove("code");
            return api.request(registering?"/auth/register/request-code":"/auth/login/request-code",body,null);
        }, data -> {
            resendAt=SystemClock.elapsedRealtime()+Math.max(60, Math.min(600, data.optInt("retryAfter",60)))*1000L;
            codeStep=true; update(); showNotice(t("sent")); code.requestFocus();
        });
    }
    private void resetCode() { codeStep=false; if (code!=null) code.setText(""); if (notice!=null) showNotice(""); }
    private void update() {
        boolean editable=!busy && oauthFlow==null;
        controls.forEach(v->v.setEnabled(editable));
        providerButton.setVisibility(codeStep?View.GONE:View.VISIBLE); providerOr.setVisibility(codeStep?View.GONE:View.VISIBLE);
        if (vkButton!=null) vkButton.setVisibility(codeStep?View.GONE:View.VISIBLE);
        heading.setText(t(codeStep?"codeTitle":registering?"registerTitle":"loginTitle")); intro.setText(t(codeStep?"sent":registering?"registerIntro":"loginIntro"));
        loginTab.setSelected(!registering); registerTab.setSelected(registering);
        for (Button tab:new Button[]{loginTab,registerTab}) { tab.setBackground(background(tab.isSelected()?Color.WHITE:Color.TRANSPARENT,20)); tab.setTextColor(tab.isSelected()?0xff14233a:0xff61718b); }
        visible(name,registering && !codeStep); visible(password,usesEmail() && !codeStep); visible(confirm,registering && usesEmail() && !codeStep);
        consent.setVisibility(registering && !codeStep?View.VISIBLE:View.GONE);
        visible(code,codeStep); resend.setVisibility(codeStep?View.VISIBLE:View.GONE); back.setVisibility(codeStep?View.VISIBLE:View.GONE);
        emailMode.setVisibility(!api.euro && !registering && !codeStep?View.VISIBLE:View.GONE); emailMode.setText(t(emailLogin?"phoneLogin":"emailLogin"));
        identityLabel.setText(t(usesEmail()?"email":"phone")); identity.setHint(usesEmail()?"name@example.com":"+7 (999) 123-45-67"); identity.setInputType(usesEmail()?InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS:InputType.TYPE_CLASS_PHONE); identity.setTypeface(font);
        submit.setText(t(codeStep?"continue":usesEmail()&&!registering?"login":"send"));
        identity.setEnabled(editable && !codeStep); name.setEnabled(editable && !codeStep);
    }
    private void startProvider(String provider) {
        if (busy || oauthFlow!=null) return;
        if (registering && !consent.isChecked()) { showNotice(t("invalidConsent")); return; }
        final NativeOAuthFlow flow; final JSONObject body;
        try {
            flow=new NativeOAuthFlow(getPackageName(),provider,AuthSessionStore.revision.get(),SystemClock.elapsedRealtime());
            body=new JSONObject().put("provider",flow.provider).put("platform","android").put("state",flow.state).put("locale",locale)
                .put("codeChallenge",flow.challenge).put("intent",registering?"register":"login").put("termsAccepted",registering && consent.isChecked());
        } catch (Exception ignored) { showNotice(t("server")); return; }
        run(form->api.request("/auth/native/start",body,null), data->{
            try {
                if (flow.revision!=AuthSessionStore.revision.get()) throw new IllegalStateException();
                java.net.URI authorization=flow.authorization(data.getString("authorizationUrl"));
                android.net.Uri url=android.net.Uri.parse((data.has("browserCheckUrl")?flow.browserCheck(data.getString("browserCheckUrl")):authorization).toString());
                oauthFlow=flow; oauthLeft=false; update(); showNotice(t("providerWaiting"));
                CustomTabsIntent tab=new CustomTabsIntent.Builder().setShowTitle(true).build();
                tab.intent.addFlags(Intent.FLAG_ACTIVITY_NO_HISTORY); tab.launchUrl(this,url);
            } catch (Exception ignored) { oauthFlow=null; update(); showNotice(t("providerUnavailable")); }
        });
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!isProviderCallback(intent)) { if (intent.getExtras()!=null) getIntent().putExtras(intent.getExtras()); return; }
        final NativeOAuthFlow flow=oauthFlow;
        if (flow==null || busy) { showNotice(t("expired")); return; }
        final java.util.Map<String,String> callback;
        try {
            callback=flow.callback(intent.getData().toString());
            if (SystemClock.elapsedRealtime()-flow.createdAt>600000 || flow.revision!=AuthSessionStore.revision.get()) throw new IllegalStateException();
        } catch (Exception ignored) { oauthFlow=null; update(); showNotice(t("denied")); return; }
        oauthFlow=null; oauthLeft=false; update();
        if (callback.containsKey("error")) {
            String problem=callback.get("error");
            if (problem.equals("javascript_disabled")) showJavaScriptRequired(flow.provider);
            else if (problem.equals("registration_required")) { selectMode(true); showNotice(t("registrationRequired")); }
            else showNotice(t(problem.equals("cancelled")?"providerCancelled":"denied"));
            return;
        }
        run(form->{
            JSONObject session=api.session(api.request("/auth/native/exchange",new JSONObject().put("code",callback.get("code")).put("codeVerifier",flow.verifier),null));
            api.validate(session.getString("accessToken")); store.save(session,flow.revision); api.checkSite(); return session;
        }, ignored->{ password.setText(""); confirm.setText(""); code.setText(""); openWorkspace(false); });
    }
    private void showJavaScriptRequired(String provider) {
        showNotice(t("javascriptTitle"));
        new androidx.appcompat.app.AlertDialog.Builder(this).setTitle(t("javascriptTitle")).setMessage(t("javascriptAndroid"))
            .setPositiveButton(t("javascriptSettings"),(dialog,which)->{
                try { startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); }
                catch (android.content.ActivityNotFoundException ignored) { showNotice(t("javascriptAndroid")); }
            })
            .setNeutralButton(t("javascriptRetry"),(dialog,which)->startProvider(provider))
            .setNegativeButton(t("back"),null).show();
    }
    private boolean isProviderCallback(Intent intent) {
        android.net.Uri url=intent.getData();
        return url!=null && getPackageName().equals(url.getScheme()) && "oauth".equals(url.getHost()) && "/callback".equals(url.getPath());
    }
    @Override protected void onPause() { if (oauthFlow!=null) oauthLeft=true; super.onPause(); }
    @Override protected void onResume() {
        super.onResume(); final NativeOAuthFlow flow=oauthFlow;
        if (flow!=null && oauthLeft) getWindow().getDecorView().postDelayed(()->{
            if (oauthFlow==flow && !busy && !isFinishing()) { oauthFlow=null; oauthLeft=false; update(); showNotice(t("providerCancelled")); }
        },350);
    }
    private void restore() {
        run(form -> { JSONObject session=api.restore(store); api.checkSite(); return session; }, session -> {
            generation=AuthSessionStore.revision.get();
            if (session!=null) openWorkspace(false); else showNotice(t("login"));
        });
    }
    private interface Task { JSONObject run(JSONObject form) throws Exception; }
    private interface Done { void accept(JSONObject result); }
    private void run(Task task, Done done) {
        if (busy || oauthFlow!=null) return; busy=true; controls.forEach(v->v.setEnabled(false)); showNotice(t("working"));
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
                if (problem==null) { showNotice(""); done.accept(output); } else showNotice(t(problem));
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
