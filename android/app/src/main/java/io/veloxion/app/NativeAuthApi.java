package io.veloxion.app;

import android.content.Context;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

class NativeAuthApi {
    final boolean euro;
    final String origin;
    final String api;
    NativeAuthApi(Context context) {
        euro = context.getPackageName().equals("eu.veloxion.app");
        if (!euro && !context.getPackageName().equals("io.veloxion.app")) throw new IllegalStateException("Unknown app region");
        origin = euro ? "https://veloxion.eu" : "https://veloxion.io";
        api = euro ? origin + "/api" : "https://api.veloxion.io/api";
    }

    static final class Failure extends Exception {
        final String key;
        final int status;
        Failure(String key, int status) { super(key); this.key = key; this.status = status; }
    }

    JSONObject request(String path, JSONObject body, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(api + path).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setInstanceFollowRedirects(false);
        connection.setRequestMethod(body == null ? "GET" : "POST");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-store");
        if (token != null) connection.setRequestProperty("Authorization", "Bearer " + checkedToken(token));
        try {
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            }
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new Failure(status == 429 ? "rate" : status >= 500 || status < 400 ? "server" : "denied", status);
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int size;
                while ((size = input.read(buffer)) != -1) {
                    if (output.size() + size > 262144) throw new Failure("server", status);
                    output.write(buffer, 0, size);
                }
                JSONObject envelope = new JSONObject(output.toString("UTF-8"));
                JSONObject data = envelope.optJSONObject("data");
                if (!envelope.optBoolean("success") || data == null) throw new Failure("server", status);
                return data;
            }
        } catch (Failure failure) { throw failure; }
        catch (java.io.IOException failure) { throw new Failure("offline", 0); }
        finally { connection.disconnect(); }
    }

    static String checkedToken(String token) throws Failure {
        if (token == null || token.isEmpty() || token.length() > 16384 || token.contains("\r") || token.contains("\n")) throw new Failure("denied", 401);
        return token;
    }

    JSONObject session(JSONObject data) throws Exception {
        return new JSONObject().put("accessToken", checkedToken(data.optString("accessToken", data.optString("token"))))
            .put("refreshToken", data.optString("refreshToken", ""));
    }

    void validate(String token) throws Exception {
        JSONObject user = request("/me", null, token).optJSONObject("user");
        if (user == null || user.optLong("id") <= 0 || user.optBoolean("is_blocked") || user.optInt("is_blocked") == 1) throw new Failure("denied", 403);
    }

    JSONObject restore(AuthSessionStore store) throws Exception {
        int revision = AuthSessionStore.revision.get();
        JSONObject saved = store.read();
        if (saved == null) return null;
        try { validate(saved.optString("accessToken")); }
        catch (Failure error) {
            if (error.status != 401) {
                if (error.status == 403 || error.status == 404) store.clear(revision);
                throw error;
            }
            if (saved.optString("refreshToken").isEmpty()) { store.clear(revision); throw error; }
            try {
                saved = session(request("/auth/refresh", new JSONObject().put("refreshToken", saved.getString("refreshToken")), null));
                validate(saved.getString("accessToken"));
                store.save(saved, revision);
            } catch (Failure refreshError) {
                if (refreshError.status == 400 || refreshError.status == 401 || refreshError.status == 403 || refreshError.status == 404) store.clear(revision);
                throw refreshError;
            }
        }
        if (AuthSessionStore.revision.get()!=revision) throw new Failure("expired",0);
        return saved;
    }

    void checkSite() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(origin + "/auth").openConnection();
        connection.setRequestMethod("HEAD");
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000); connection.setInstanceFollowRedirects(false);
        try { if (connection.getResponseCode() != 200) throw new Failure("server", 503); }
        catch (java.io.IOException error) { throw new Failure("offline", 0); }
        finally { connection.disconnect(); }
    }
}
