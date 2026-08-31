package com.remindme.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ReminderSound — lets the user pick one of the phone's ringtones/notification
 * sounds for in-app reminder alerts.
 *
 * Exposed to the web app as window.Capacitor.Plugins.ReminderSound with:
 *   pick()      — opens the system ringtone picker; resolves { name, uri }
 *   play()      — plays the previously picked ringtone (if any)
 *   getCurrent()— resolves { name, uri } or null
 */
@CapacitorPlugin(name = "ReminderSound")
public class ReminderSoundPlugin extends Plugin {

    private static final int RINGTONE_PICK_REQUEST = 4210;
    private static final String PREFS = "RemindMe";
    private static final String KEY_URI = "reminder_ringtone_uri";
    private static final String KEY_NAME = "reminder_ringtone_name";

    private PluginCall pendingPickCall = null;

    @PluginMethod
    public void pick(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }
        if (pendingPickCall != null) {
            call.reject("A ringtone picker is already open");
            return;
        }
        Intent intent = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_TITLE, "Choose a reminder sound");
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        intent.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, true);
        String current = prefs().getString(KEY_URI, null);
        if (current != null) {
            intent.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(current));
        }
        pendingPickCall = call;
        try {
            activity.startActivityForResult(intent, RINGTONE_PICK_REQUEST);
        } catch (Exception ex) {
            pendingPickCall = null;
            call.reject("Could not open the ringtone picker: " + ex.getMessage());
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String uriStr = prefs().getString(KEY_URI, null);
        if (uriStr != null) {
            try {
                Ringtone ringtone = RingtoneManager.getRingtone(getContext(), Uri.parse(uriStr));
                if (ringtone != null) ringtone.play();
            } catch (Exception ignored) { }
        }
        call.resolve();
    }

    @PluginMethod
    public void getCurrent(PluginCall call) {
        String uriStr = prefs().getString(KEY_URI, null);
        if (uriStr == null) {
            call.resolve(null);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("name", prefs().getString(KEY_NAME, "Custom sound"));
        ret.put("uri", uriStr);
        call.resolve(ret);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != RINGTONE_PICK_REQUEST || pendingPickCall == null) return;

        PluginCall call = pendingPickCall;
        pendingPickCall = null;

        if (resultCode == Activity.RESULT_OK && data != null) {
            Uri uri = data.getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if (uri == null) {
                // User picked "Silent" (no URI) — clear the selection
                prefs().edit().remove(KEY_URI).remove(KEY_NAME).apply();
                call.resolve(new JSObject());
                return;
            }
            String name = "Custom sound";
            try {
                Ringtone r = RingtoneManager.getRingtone(getContext(), uri);
                if (r != null && r.getTitle(getContext()) != null) name = r.getTitle(getContext());
            } catch (Exception ignored) { }
            prefs().edit().putString(KEY_URI, uri.toString()).putString(KEY_NAME, name).apply();
            JSObject ret = new JSObject();
            ret.put("name", name);
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } else {
            call.reject("cancelled");
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
