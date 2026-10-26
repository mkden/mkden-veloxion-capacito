package io.veloxion.app;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AuthSessionStore {
    static final AtomicInteger revision = new AtomicInteger();
    private final Context context;
    private static final String PREFS = "veloxion_native_auth";
    AuthSessionStore(Context context) { this.context = context.getApplicationContext(); }

    private SecretKey key() throws Exception {
        String alias = context.getPackageName() + ".auth.v1";
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(alias)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(alias, null);
    }

    synchronized JSONObject read() {
        try {
            String saved = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("session", null);
            if (saved == null) return null;
            JSONObject wrapped = new JSONObject(saved);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(wrapped.getString("iv"), Base64.NO_WRAP)));
            return new JSONObject(new String(cipher.doFinal(Base64.decode(wrapped.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
        } catch (Exception ignored) { clear(); return null; }
    }

    void save(JSONObject session, int expectedRevision) throws Exception {
        synchronized (AuthSessionStore.class) {
            if (revision.get() != expectedRevision) throw new IllegalStateException("Session changed");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            JSONObject wrapped = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .put("data", Base64.encodeToString(cipher.doFinal(session.toString().getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
            if (!context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("session", wrapped.toString()).commit())
                throw new IllegalStateException("Secure storage unavailable");
        }
    }

    void clear(int expectedRevision) {
        synchronized (AuthSessionStore.class) { if (revision.get()==expectedRevision) clear(); }
    }

    void clear() {
        synchronized (AuthSessionStore.class) {
            revision.incrementAndGet();
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        }
    }
}
