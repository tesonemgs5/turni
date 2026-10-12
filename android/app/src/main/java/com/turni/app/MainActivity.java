package com.turni.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // il plugin del widget va registrato PRIMA di super.onCreate
        registerPlugin(TurniWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
