package com.tally.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.tally.app.ui.nav.TallyApp
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyTheme

/**
 * Entry point. All real UI lives under `com.tally.app.ui` — this class only
 * wires the theme and the app shell ([TallyApp]) into the Activity.
 *
 * [TallyApp] defaults to an in-memory demo [com.tally.app.ui.data.TallyDataSource]
 * (see that package's doc comments) until the money/vault agents' modules are
 * wired in for real — nothing here should need to change for that swap; it
 * happens by passing a real `TallyDataSource` implementation into `TallyApp(...)`.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TallyTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = TallyColors.Ground) {
                    TallyApp()
                }
            }
        }
    }
}
