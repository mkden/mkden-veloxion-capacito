package io.veloxion.app;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private android.widget.LinearLayout loadingPanel;
    private android.widget.TextView loadingMessage;
    private android.widget.ProgressBar loadingSpinner;
    private android.widget.Button retryWorkspace;
    private final android.os.Handler loadingHandler=new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable loadingExpired=()->{
        if (loadingPanel==null || loadingPanel.getVisibility()!=android.view.View.VISIBLE) return;
        loadingSpinner.setVisibility(android.view.View.GONE); loadingMessage.setText(label("offline")); retryWorkspace.setVisibility(android.view.View.VISIBLE);
    };
    private org.json.JSONObject loadingLabels=new org.json.JSONObject();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAuthPlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        installLoadingPanel(webView);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            enqueueDownload(url, userAgent, contentDisposition, mimeType)
        );

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    private String label(String key) { return loadingLabels.optString(key,key); }

    private void installLoadingPanel(WebView webView) {
        boolean euro=new NativeAuthApi(this).euro;
        String locale=euro?NativeAuthLocale.resolve(getSharedPreferences(NativeAuthLocale.PREFERENCES,0).getString(NativeAuthLocale.KEY,""),java.util.Locale.getDefault().toLanguageTag()):"ru";
        for (String file:euro?new String[]{"native-auth","native-auth-euro"}:new String[]{"native-auth"}) {
            try (java.io.InputStream input=getAssets().open("public/"+file+".json")) {
                java.io.ByteArrayOutputStream bytes=new java.io.ByteArrayOutputStream(); byte[] buffer=new byte[4096]; int count;
                while ((count=input.read(buffer))!=-1) bytes.write(buffer,0,count);
                org.json.JSONObject dictionary=new org.json.JSONObject(bytes.toString("UTF-8")).optJSONObject(locale);
                if (dictionary!=null) for (java.util.Iterator<String> keys=dictionary.keys();keys.hasNext();) {String key=keys.next(); loadingLabels.put(key,dictionary.getString(key));}
            } catch (Exception ignored) { }
        }
        android.widget.FrameLayout root=getWindow().getDecorView().findViewById(android.R.id.content);
        loadingPanel=new android.widget.LinearLayout(this); loadingPanel.setOrientation(android.widget.LinearLayout.VERTICAL); loadingPanel.setGravity(android.view.Gravity.CENTER);
        loadingPanel.setPadding(40,40,40,40); loadingPanel.setBackgroundColor(android.graphics.Color.rgb(237,245,249)); loadingPanel.setClickable(true);
        android.widget.TextView brand=new android.widget.TextView(this); brand.setText("VELOXION AI"); brand.setTextSize(20); brand.setTypeface(null,android.graphics.Typeface.BOLD); brand.setTextColor(android.graphics.Color.rgb(20,35,58)); loadingPanel.addView(brand);
        loadingSpinner=new android.widget.ProgressBar(this); loadingPanel.addView(loadingSpinner);
        loadingMessage=new android.widget.TextView(this); loadingMessage.setTextSize(16); loadingMessage.setGravity(android.view.Gravity.CENTER); loadingMessage.setPadding(12,24,12,24); loadingPanel.addView(loadingMessage);
        retryWorkspace=new android.widget.Button(this); retryWorkspace.setText(label("retry")); retryWorkspace.setOnClickListener(v->{beginLoading(); webView.reload();}); loadingPanel.addView(retryWorkspace);
        android.widget.Button back=new android.widget.Button(this); back.setText(label("back")); back.setOnClickListener(v->{startActivity(new android.content.Intent(this,NativeAuthActivity.class).putExtra("skipRestore",true).addFlags(android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK|android.content.Intent.FLAG_ACTIVITY_NEW_TASK));finish();}); loadingPanel.addView(back);
        root.addView(loadingPanel,new android.widget.FrameLayout.LayoutParams(-1,-1)); beginLoading();
    }

    private void beginLoading() {
        loadingPanel.setVisibility(android.view.View.VISIBLE); loadingSpinner.setVisibility(android.view.View.VISIBLE); loadingMessage.setText(label("working")); retryWorkspace.setVisibility(android.view.View.GONE);
        loadingHandler.removeCallbacks(loadingExpired); loadingHandler.postDelayed(loadingExpired,35000);
    }

    void completeNativeSessionHandoff() {
        loadingHandler.removeCallbacks(loadingExpired); if (loadingPanel!=null) loadingPanel.setVisibility(android.view.View.GONE);
    }

    @Override public void onDestroy() {loadingHandler.removeCallbacksAndMessages(null);super.onDestroy();}

    private void enqueueDownload(String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimeType);
            request.addRequestHeader("User-Agent", userAgent);

            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isBlank()) {
                request.addRequestHeader("Cookie", cookies);
            }

            request.setTitle(fileName);
            request.setDescription(getPackageName().equals("eu.veloxion.app") ? "Downloading from Veloxion AI" : "Скачивание из Veloxion AI");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            } else {
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, fileName);
            }

            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, getPackageName().equals("eu.veloxion.app") ? "File added to downloads" : "Файл добавлен в загрузки", Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(this, getPackageName().equals("eu.veloxion.app") ? "Could not download the file" : "Не удалось скачать файл", Toast.LENGTH_LONG).show();
        }
    }
}
