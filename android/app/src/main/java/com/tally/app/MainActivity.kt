package com.tally.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview

/**
 * This is the whole app for now.
 *
 * It exists to prove the pipeline, not to be a feature: checkout -> Gradle ->
 * Android SDK -> Compose -> APK, all inside GitHub Actions, with a real test
 * running along the way. Later agents replace this screen; they should not
 * need to touch the build configuration to do it.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TallyTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    PipelineCheckScreen()
                }
            }
        }
    }
}

@Composable
fun PipelineCheckScreen() {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(text = stringResourceAppName(), style = MaterialTheme.typography.headlineMedium)
        Text(text = "v${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodyMedium)
    }
}

// Kept as a plain literal rather than androidx' stringResource() so this file
// has no dependency on a Compose-resources API surface beyond what's already
// pinned above -- one less thing that can shift under CI's exact dependency
// resolution.
private fun stringResourceAppName(): String = "Tally"

@Composable
fun TallyTheme(content: @Composable () -> Unit) {
    MaterialTheme(content = content)
}

@Preview(showBackground = true)
@Composable
fun PipelineCheckScreenPreview() {
    TallyTheme {
        PipelineCheckScreen()
    }
}
