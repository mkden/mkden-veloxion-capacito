package io.veloxion.app;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeSessionRestoreTest {
    @Test public void restoreRefreshAndFailurePreserveTheRightAccount() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        AuthSessionStore store=new AuthSessionStore(context);
        assertNull("Use an isolated emulator without a real signed-in account",store.read());
        try {
            store.save(new JSONObject().put("accessToken","old-fixture").put("refreshToken","refresh-fixture"),AuthSessionStore.revision.get());
            NativeAuthApi valid=new NativeAuthApi(context) {
                @Override JSONObject request(String path,JSONObject body,String token) throws Exception {
                    assertEquals("/me",path); return new JSONObject().put("user",new JSONObject().put("id",1));
                }
            };
            assertEquals("old-fixture",valid.restore(store).getString("accessToken"));
            assertEquals("refresh-fixture",new AuthSessionStore(context).read().getString("refreshToken"));
            int[] calls={0};
            NativeAuthApi refresh=new NativeAuthApi(context) {
                @Override JSONObject request(String path,JSONObject body,String token) throws Exception {
                    calls[0]++;
                    if (path.equals("/auth/refresh")) return new JSONObject().put("accessToken","new-fixture").put("refreshToken","new-refresh");
                    if (calls[0]==1) throw new Failure("denied",401);
                    return new JSONObject().put("user",new JSONObject().put("id",1));
                }
            };
            assertEquals("new-fixture",refresh.restore(store).getString("accessToken")); assertEquals(3,calls[0]);
            NativeAuthApi outage=new NativeAuthApi(context) {
                @Override JSONObject request(String path,JSONObject body,String token) throws Exception {throw new Failure("offline",0);}
            };
            try {outage.restore(store); fail("Outage accepted");} catch(NativeAuthApi.Failure expected) {assertEquals(0,expected.status);}
            assertEquals("new-refresh",store.read().getString("refreshToken"));
            NativeAuthApi lateFailure=new NativeAuthApi(context) {
                @Override JSONObject request(String path,JSONObject body,String token) throws Exception {
                    store.clear(); store.save(new JSONObject().put("accessToken","another-account").put("refreshToken","another-refresh"),AuthSessionStore.revision.get());
                    throw new Failure("denied",403);
                }
            };
            try {lateFailure.restore(store); fail("Late failure accepted");} catch(NativeAuthApi.Failure expected) { }
            assertEquals("another-account",store.read().getString("accessToken"));
            NativeAuthApi logout=new NativeAuthApi(context) {
                @Override JSONObject request(String path,JSONObject body,String token) throws Exception {store.clear(); return new JSONObject().put("user",new JSONObject().put("id",1));}
            };
            try {logout.restore(store); fail("Logged-out session restored");} catch(NativeAuthApi.Failure expected) {assertEquals("expired",expected.key);}
            assertNull(store.read());
        } finally {store.clear();}
    }
}
