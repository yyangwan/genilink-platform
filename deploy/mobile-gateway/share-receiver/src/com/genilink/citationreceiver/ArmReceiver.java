package com.genilink.citationreceiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public final class ArmReceiver extends BroadcastReceiver {
    static final String PREFS = "capture";
    static final String ACTION_ARM = "com.genilink.citationreceiver.ARM";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_ARM.equals(intent.getAction())) return;
        String nonce = intent.getStringExtra("nonce");
        if (nonce == null || !nonce.matches("[a-f0-9]{32}")) return;
        SharedPreferences.Editor editor = context.getSharedPreferences(PREFS, 0).edit();
        editor.putString("nonce", nonce);
        editor.putLong("armed_at_ms", System.currentTimeMillis());
        editor.remove("result");
        editor.commit();
    }
}
