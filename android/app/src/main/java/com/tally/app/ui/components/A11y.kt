package com.tally.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

/** Deliverable 7's floor, everywhere: "Every interactive element >= 48dp
 *  with a real content description." One helper so every tappable element
 *  in the app enforces the same minimum instead of each screen guessing. */
val MinTouchTarget = 48.dp

/**
 * A clickable modifier that guarantees the 48x48dp minimum touch target and
 * (optionally) an explicit accessibility label — for icon-only controls
 * where the visible content alone wouldn't tell TalkBack what the control
 * does (e.g. a bare chevron or a keypad digit).
 *
 * The parameter is named `description`, not `contentDescription` — inside
 * this function body a nested `Modifier.semantics { }` lambda has an
 * implicit `SemanticsPropertyReceiver` receiver that ALSO exposes a
 * `contentDescription` member, and a same-named parameter there risks
 * resolving to itself instead of the outer value. Different name, no
 * ambiguity, anywhere this is called from.
 */
@Composable
fun Modifier.a11yClickable(
    description: String? = null,
    role: Role = Role.Button,
    onClick: () -> Unit,
): Modifier = this
    .sizeIn(minWidth = MinTouchTarget, minHeight = MinTouchTarget)
    .then(
        if (description != null) {
            Modifier.semantics { contentDescription = description }
        } else {
            Modifier
        }
    )
    .clickable(role = role, onClick = onClick)

/**
 * Rows and tiles that are already well over 48dp by content (list rows,
 * category tiles) don't need the size floor — this variant just adds the
 * click target and an optional label, still fully keyboard/TalkBack
 * reachable via the normal `clickable` semantics.
 */
@Composable
fun Modifier.a11yRow(
    description: String? = null,
    role: Role = Role.Button,
    onClick: () -> Unit,
): Modifier = this
    .then(
        if (description != null) {
            Modifier.semantics { contentDescription = description }
        } else {
            Modifier
        }
    )
    .clickable(role = role, onClick = onClick)
