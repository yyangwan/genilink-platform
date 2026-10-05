package com.genilink.citationreceiver;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;

public final class CaptureProvider extends ContentProvider {
    @Override
    public boolean onCreate() { return true; }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        MatrixCursor cursor = new MatrixCursor(new String[] {"payload"});
        String nonce = uri.getLastPathSegment();
        if (nonce == null || !nonce.matches("[a-f0-9]{32}")) return cursor;
        android.content.SharedPreferences prefs = getContext().getSharedPreferences(ArmReceiver.PREFS, 0);
        if (!nonce.equals(prefs.getString("nonce", null))) return cursor;
        String result = prefs.getString("result", null);
        if (uri.getPathSegments().size() > 1 && "status".equals(uri.getPathSegments().get(0))) {
            cursor.addRow(new Object[] {result == null ? "armed" : "captured"});
            return cursor;
        }
        if (result == null) return cursor;
        try {
            JSONObject data = new JSONObject(result);
            long age = System.currentTimeMillis() - data.getLong("captured_at_ms");
            if (!nonce.equals(data.getString("nonce")) || age < 0 || age > 60000) return cursor;
            String encoded = Base64.encodeToString(result.getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
            cursor.addRow(new Object[] {encoded});
            prefs.edit().remove("nonce").remove("result").remove("armed_at_ms").commit();
        } catch (Exception ignored) {
            prefs.edit().remove("nonce").remove("result").remove("armed_at_ms").commit();
        }
        return cursor;
    }

    @Override public String getType(Uri uri) { return "vnd.android.cursor.item/vnd.genilink.citation"; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { throw new UnsupportedOperationException(); }
}
