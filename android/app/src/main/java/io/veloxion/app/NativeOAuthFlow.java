package io.veloxion.app;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;

/** Device-held proof for a single system-browser login. Nothing is persisted or sent through the WebView. */
public final class NativeOAuthFlow {
    public final String state, verifier, challenge, scheme, provider;
    public final int revision;
    public final long createdAt;
    private static String encode(byte[] input) {
        String alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        StringBuilder out=new StringBuilder(); int buffer=0, bits=0;
        for (byte value:input) { buffer=(buffer<<8)|(value&255); bits+=8; while (bits>=6) { bits-=6; out.append(alphabet.charAt((buffer>>>bits)&63)); } }
        if (bits>0) out.append(alphabet.charAt((buffer<<(6-bits))&63));
        return out.toString();
    }
    private static String random() { byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes); return encode(bytes); }
    public NativeOAuthFlow(String bundle, int revision, long createdAt) throws Exception {
        if (!bundle.equals("eu.veloxion.app") && !bundle.equals("io.veloxion.app")) throw new IllegalArgumentException("Unknown region");
        scheme=bundle; provider=bundle.equals("eu.veloxion.app")?"google":"yandex";
        this.revision=revision; this.createdAt=createdAt; state=random(); verifier=random();
        challenge=encode(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
    }
    public URI authorization(String raw) throws Exception {
        URI url=new URI(raw);
        String host=provider.equals("google")?"accounts.google.com":"oauth.yandex.ru";
        String path=provider.equals("google")?"/o/oauth2/v2/auth":"/authorize";
        if (!"https".equals(url.getScheme()) || !host.equals(url.getHost()) || !path.equals(url.getPath())
            || url.getUserInfo()!=null || (url.getPort()!=-1 && url.getPort()!=443) || url.getFragment()!=null) throw new IllegalArgumentException("Invalid provider URL");
        return url;
    }
    public Map<String,String> callback(String raw) throws Exception {
        URI url=new URI(raw);
        if (raw.length()>4096 || !scheme.equals(url.getScheme()) || !"oauth".equals(url.getHost()) || !"/callback".equals(url.getPath())
            || url.getUserInfo()!=null || url.getPort()!=-1 || url.getFragment()!=null || url.getRawQuery()==null) throw new IllegalArgumentException("Invalid callback");
        Map<String,String> params=new HashMap<>();
        for (String pair:url.getRawQuery().split("&")) {
            String[] parts=pair.split("=",2);
            if (parts.length!=2) throw new IllegalArgumentException("Invalid callback");
            String key=URLDecoder.decode(parts[0],"UTF-8"), value=URLDecoder.decode(parts[1],"UTF-8");
            if ((!key.equals("state") && !key.equals("code") && !key.equals("error")) || params.put(key,value)!=null) throw new IllegalArgumentException("Invalid callback");
        }
        String received=params.get("state");
        if (received==null || !MessageDigest.isEqual(state.getBytes(StandardCharsets.US_ASCII),received.getBytes(StandardCharsets.UTF_8))) throw new IllegalArgumentException("Invalid state");
        if (params.containsKey("code")==params.containsKey("error")) throw new IllegalArgumentException("Invalid callback");
        if (params.containsKey("code") && !params.get("code").matches("[A-Za-z0-9_-]{43}")) throw new IllegalArgumentException("Invalid code");
        if (params.containsKey("error") && !params.get("error").matches("cancelled|denied|registration_required")) throw new IllegalArgumentException("Invalid error");
        return params;
    }
}
