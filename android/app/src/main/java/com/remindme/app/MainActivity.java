package com.remindme.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReminderSoundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
