package com.tally.app.ui.menu

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tally.app.ui.components.TallyBackHeader
import com.tally.app.ui.theme.TallyColors
import com.tally.app.ui.theme.TallyType

/**
 * A real, reachable destination for every Menu row whose full feature isn't
 * built yet — never a dead tap. One heading, a short explanation, and a way
 * back. Once each feature lands under `com.tally.app.ui`, its Menu row
 * points at the real screen instead of here.
 */
@Composable
fun PlaceholderScreen(title: String, subtitle: String, onBack: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(TallyColors.Ground)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        TallyBackHeader(onBack = onBack)

        Text(
            text = title,
            style = TallyType.Title,
            color = TallyColors.Ink1,
            modifier = Modifier.semantics(mergeDescendants = false) { heading() },
        )
        Text(text = subtitle, style = MaterialTheme.typography.bodyMedium, color = TallyColors.Ink2)
        Text(
            text = "This part of Tally isn't built yet — it'll live here once it is.",
            style = MaterialTheme.typography.bodyMedium,
            color = TallyColors.Ink3,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}
