package io.veloxion.app;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.SystemClock;
import android.provider.Settings;
import android.widget.EditText;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.lang.reflect.Field;
import static org.junit.Assert.*;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.action.ViewActions.click;
import static androidx.test.espresso.assertion.ViewAssertions.matches;
import static androidx.test.espresso.matcher.RootMatchers.isDialog;
import static androidx.test.espresso.matcher.ViewMatchers.isDisplayed;
import static androidx.test.espresso.matcher.ViewMatchers.withText;

@RunWith(AndroidJUnit4.class)
public class NativeBrowserCheckTest {
    private static Object field(Object instance,String name) throws Exception {
        Field field=instance.getClass().getDeclaredField(name); field.setAccessible(true); return field.get(instance);
    }
    @Test public void disabledJavaScriptShowsNativeSettingsDialogWithoutDiscardingInput() throws Exception {
        Instrumentation runner=InstrumentationRegistry.getInstrumentation();
        android.content.Context context=runner.getTargetContext();
        assertNull(new AuthSessionStore(context).read());
        NativeAuthActivity activity=(NativeAuthActivity)runner.startActivitySync(new Intent(context,NativeAuthActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(new IntentFilter(Settings.ACTION_SETTINGS),null,true);
        runner.addMonitor(monitor);
        try {
            runner.runOnMainSync(()->{
                try {
                    ((EditText)field(activity,"identity")).setText(context.getPackageName().equals("eu.veloxion.app")?"qa@example.invalid":"+7 (912) 345-67-89");
                    ((EditText)field(activity,"password")).setText("fixture-not-a-real-password");
                    NativeOAuthFlow flow=new NativeOAuthFlow(context.getPackageName(),AuthSessionStore.revision.get(),SystemClock.elapsedRealtime());
                    Field pending=NativeAuthActivity.class.getDeclaredField("oauthFlow"); pending.setAccessible(true); pending.set(activity,flow);
                    activity.onNewIntent(new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(context.getPackageName()+"://oauth/callback?state="+flow.state+"&error=javascript_disabled")));
                } catch(Exception error) { throw new AssertionError(error); }
            });
            JSONObject labels=(JSONObject)field(activity,"strings");
            onView(withText(labels.getString("javascriptTitle"))).inRoot(isDialog()).check(matches(isDisplayed()));
            onView(withText(labels.getString("javascriptRetry"))).inRoot(isDialog()).check(matches(isDisplayed()));
            assertNull(field(activity,"oauthFlow"));
            assertEquals("fixture-not-a-real-password",((EditText)field(activity,"password")).getText().toString());
            onView(withText(labels.getString("javascriptSettings"))).inRoot(isDialog()).perform(click());
            assertEquals(1,monitor.getHits());
        } finally {runner.removeMonitor(monitor); runner.runOnMainSync(activity::finish);}
    }
}
