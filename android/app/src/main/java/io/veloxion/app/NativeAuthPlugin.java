package io.veloxion.app;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

@CapacitorPlugin(name = "VeloxionAuth")
public class NativeAuthPlugin extends Plugin {
    private final java.util.concurrent.ExecutorService worker=java.util.concurrent.Executors.newSingleThreadExecutor();
    private boolean trusted() {
        String current=getBridge().getWebView().getUrl();
        if (current==null) return false;
        Uri uri=Uri.parse(current);
        String host=new NativeAuthApi(getContext()).euro?"veloxion.eu":"veloxion.io";
        return "https".equals(uri.getScheme()) && (uri.getPort()==-1 || uri.getPort()==443)
            && (host.equals(uri.getHost()) || ("www."+host).equals(uri.getHost()));
    }
    @PluginMethod public void getSession(PluginCall call) {
        getActivity().runOnUiThread(() -> getSessionOnMain(call));
    }
    @PluginMethod public void getLocale(PluginCall call) {
        getActivity().runOnUiThread(()->{
            if (!trusted()) { call.reject("Untrusted origin"); return; }
            String locale=new NativeAuthApi(getContext()).euro?NativeAuthLocale.resolve(getContext().getSharedPreferences(NativeAuthLocale.PREFERENCES,0).getString(NativeAuthLocale.KEY,""),java.util.Locale.getDefault().toLanguageTag()):"ru";
            JSObject result=new JSObject(); result.put("locale",locale); call.resolve(result);
        });
    }
    @PluginMethod public void setLocale(PluginCall call) {
        getActivity().runOnUiThread(()->{
            String locale=call.getString("locale","");
            if (!trusted() || !new NativeAuthApi(getContext()).euro || !NativeAuthLocale.supported(locale)) { call.reject("Invalid locale or origin"); return; }
            getContext().getSharedPreferences(NativeAuthLocale.PREFERENCES,0).edit().putString(NativeAuthLocale.KEY,locale).apply(); call.resolve();
        });
    }
    private void getSessionOnMain(PluginCall call) {
        if (!trusted()) { call.reject("Untrusted origin"); return; }
        boolean allowWeb=getActivity().getIntent().getBooleanExtra("webAuthAllowed",false);
        boolean begin=allowWeb && !getActivity().getIntent().getBooleanExtra("webAuthStarted",false);
        if (allowWeb) getActivity().getIntent().putExtra("webAuthStarted",true);
        worker.execute(()->{
            try {
                JSONObject saved=allowWeb?null:new NativeAuthApi(getContext()).restore(new AuthSessionStore(getContext()));
                JSObject result=new JSObject(); result.put("accessToken",saved==null?"":saved.optString("accessToken"));
                result.put("validated",!allowWeb); result.put("webAuthAllowed",allowWeb); result.put("beginWebAuth",begin);
                call.resolve(result);
            } catch (Exception ignored) { call.reject("Could not restore session"); }
        });
    }
    @PluginMethod public void completeHandoff(PluginCall call) {
        getActivity().runOnUiThread(()->{
            if (!trusted()) { call.reject("Untrusted origin"); return; }
            ((MainActivity)getActivity()).completeNativeSessionHandoff(); call.resolve();
        });
    }
    @PluginMethod public void adoptSession(PluginCall call) {
        getActivity().runOnUiThread(() -> adoptSessionOnMain(call));
    }
    private void adoptSessionOnMain(PluginCall call) {
        if (!trusted()) { call.reject("Untrusted origin"); return; }
        String token=call.getString("accessToken", "");
        int revision=AuthSessionStore.revision.get();
        worker.execute(() -> {
            try {
                NativeAuthApi api=new NativeAuthApi(getContext()); api.validate(token);
                AuthSessionStore store=new AuthSessionStore(getContext()); JSONObject previous=store.read();
                JSONObject session=new JSONObject().put("accessToken",token).put("refreshToken",previous!=null && token.equals(previous.optString("accessToken"))?previous.optString("refreshToken"):"");
                store.save(session,revision);
                getActivity().runOnUiThread(() -> { getActivity().getIntent().putExtra("webAuthAllowed",false); call.resolve(); });
            } catch (Exception ignored) { call.reject("Could not validate session"); }
        });
    }
    @PluginMethod public void showLogin(PluginCall call) {
        getActivity().runOnUiThread(() -> showLoginOnMain(call));
    }
    private void showLoginOnMain(PluginCall call) {
        // The bundled error page may return to the native form, but may never read a token.
        String url=getBridge().getWebView().getUrl();
        boolean local=url!=null && (url.startsWith("https://localhost/") || url.startsWith("http://localhost/"));
        if (!trusted() && !local) { call.reject("Untrusted origin"); return; }
        if (Boolean.TRUE.equals(call.getBoolean("clearSession",false))) {
            new AuthSessionStore(getContext()).clear();
            android.webkit.CookieManager.getInstance().removeAllCookies(null);
            android.webkit.CookieManager.getInstance().flush();
        }
        getActivity().runOnUiThread(() -> {
            getActivity().startActivity(new Intent(getActivity(),NativeAuthActivity.class).putExtra("skipRestore",true).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK|Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve(); getActivity().finish();
        });
    }
    @Override protected void handleOnDestroy() { worker.shutdownNow(); }
}
