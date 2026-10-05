package com.genilink.citationreceiver;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;

public final class ShareActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        capture(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        capture(intent);
    }

    private void capture(Intent intent) {
        try {
            SharedPreferences prefs = getSharedPreferences(ArmReceiver.PREFS, 0);
            String nonce = prefs.getString("nonce", null);
            long armedAt = prefs.getLong("armed_at_ms", 0);
            long now = System.currentTimeMillis();
            if (nonce == null || now - armedAt > 60000 || intent == null ||
                    !Intent.ACTION_SEND.equals(intent.getAction())) return;

            JSONObject result = new JSONObject();
            result.put("nonce", nonce);
            result.put("captured_at_ms", now);
            result.put("text", intent.getStringExtra(Intent.EXTRA_TEXT));
            result.put("subject", intent.getStringExtra(Intent.EXTRA_SUBJECT));
            result.put("html_text", intent.getStringExtra(Intent.EXTRA_HTML_TEXT));
            JSONArray items = new JSONArray();
            ClipData clip = intent.getClipData();
            if (clip != null) {
                for (int i = 0; i < clip.getItemCount(); i++) {
                    CharSequence text = clip.getItemAt(i).getText();
                    if (text != null) items.put(text.toString());
                }
            }
            result.put("clip_texts", items);
            prefs.edit().putString("result", result.toString()).commit();
        } catch (Exception ignored) {
            // The gateway times out and keeps this source unresolved.
        } finally {
            finish();
        }
    }
}
