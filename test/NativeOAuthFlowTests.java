import io.veloxion.app.NativeOAuthFlow;
import io.veloxion.app.NativeAuthLocale;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

public final class NativeOAuthFlowTests {
    interface Operation { void run() throws Exception; }
    static void check(boolean value) { if (!value) throw new AssertionError("Native OAuth contract failed"); }
    static void rejects(Operation operation) throws Exception {
        try { operation.run(); } catch (Exception expected) { return; }
        throw new AssertionError("Unsafe OAuth value accepted");
    }
    public static void main(String[] args) throws Exception {
        for (String bundle:new String[]{"eu.veloxion.app","io.veloxion.app"}) {
            NativeOAuthFlow flow=new NativeOAuthFlow(bundle,7,123);
            check(flow.state.matches("[A-Za-z0-9_-]{43}") && flow.verifier.matches("[A-Za-z0-9_-]{43}"));
            check(!flow.state.equals(flow.verifier));
            check(flow.challenge.equals(Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(flow.verifier.getBytes(StandardCharsets.US_ASCII)))));
            String base=bundle+"://oauth/callback?state="+flow.state, code="a".repeat(43);
            check(flow.callback(base+"&code="+code).get("code").equals(code));
            check(flow.callback(base+"&error=cancelled").get("error").equals("cancelled"));
            check(flow.callback(base+"&error=javascript_disabled").get("error").equals("javascript_disabled"));
            String host=bundle.equals("eu.veloxion.app")?"veloxion.eu":"api.veloxion.io";
            String browser="https://"+host+"/api/auth/native/browser-check?state=native_"+"a".repeat(43);
            check(flow.browserCheck(browser).getHost().equals(host));
            for (String bad:new String[]{browser.replace("https:","http:"),browser.replace(host,"evil.invalid"),browser+"&next=private",browser+"#fragment",browser.replace("browser-check","other"),browser.replace(host,"user@"+host),browser.replace(host,host+":444")}) rejects(()->flow.browserCheck(bad));
            rejects(()->flow.callback(base+"&code="+code+"&code="+code));
            rejects(()->flow.callback(base+"&code="+code+"&error=denied"));
            rejects(()->flow.callback(base+"&token=private"));
            rejects(()->flow.callback(base+"&code="+code+"#fragment"));
            rejects(()->flow.callback(base.replace("state="+flow.state,"state=invalid")+"&code="+code));
            rejects(()->flow.callback(base.replace("://oauth/","://user@oauth/")+"&code="+code));
            rejects(()->flow.callback(base.replace(bundle,"foreign.app")+"&code="+code));
            String authorize=flow.provider.equals("google")?"https://accounts.google.com/o/oauth2/v2/auth":"https://oauth.yandex.ru/authorize";
            check(flow.authorization(authorize).getScheme().equals("https"));
            rejects(()->flow.authorization(authorize.replace("https:","http:")));
            rejects(()->flow.authorization(authorize.replace(".com/",".com.evil.invalid/").replace(".ru/",".ru.evil.invalid/")));
        }
        NativeOAuthFlow vk=new NativeOAuthFlow("io.veloxion.app","vk",7,123);
        check(vk.authorization("https://id.vk.com/authorize").getHost().equals("id.vk.com"));
        rejects(()->vk.authorization("https://oauth.yandex.ru/authorize"));
        rejects(()->new NativeOAuthFlow("eu.veloxion.app","vk",7,123));
        rejects(()->new NativeOAuthFlow("io.veloxion.app","google",7,123));
        for (String code:NativeAuthLocale.CODES) check(NativeAuthLocale.resolve(code,"ru-RU").equals(code));
        check(NativeAuthLocale.resolve("ru","ru-RU").equals("en"));
        check(NativeAuthLocale.resolve("","de-DE").equals("de"));
        check(NativeAuthLocale.resolve("bad","zh_Hans_CN").equals("zh"));
        check(NativeAuthLocale.resolve("fr","de-DE").equals("fr"));
        System.out.println("Java OAuth: PKCE, state, callbacks, errors and region isolation passed");
    }
}
