package com.tally.app.ui.theme

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Every glyph the app draws, hand-built with [Canvas] rather than pulled
 * from an icon-font dependency. This app declares no extra UI libraries
 * (CONSTRAINTS), and material-icons-extended is a large, separately
 * versioned dependency this build can't compile-check locally — a handful
 * of simple line-drawn shapes over the exact strokes/geometry we need is
 * both smaller and more predictable to get right on the first CI run.
 *
 * Every glyph fills whatever size its caller passes via `modifier` (usually
 * `Modifier.size(24.dp)`) and scales its own geometry off the actual canvas
 * size — nothing here is a fixed-pixel shape.
 */
object TallyIcons {

    @Composable
    fun Home(modifier: Modifier = Modifier, tint: Color = TallyColors.Ink1, strokeWidth: Dp = 2.dp) {
        Canvas(modifier = modifier) {
            val w = size.width
            val h = size.height
            val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val roof = Path().apply {
                moveTo(w * 0.08f, h * 0.52f)
                lineTo(w * 0.5f, h * 0.1f)
                lineTo(w * 0.92f, h * 0.52f)
            }
            drawPath(roof, color = tint, style = stroke)
            val body = Path().apply {
                moveTo(w * 0.22f, h * 0.46f)
                lineTo(w * 0.22f, h * 0.88f)
                lineTo(w * 0.78f, h * 0.88f)
                lineTo(w * 0.78f, h * 0.46f)
            }
            drawPath(body, color = tint, style = stroke)
        }
    }

    @Composable
    fun Add(modifier: Modifier = Modifier, tint: Color = TallyColors.Ink1, strokeWidth: Dp = 2.5.dp) {
        Canvas(modifier = modifier) {
            val w = size.width
            val h = size.height
            val stroke = strokeWidth.toPx()
            drawLine(
                color = tint,
                start = Offset(w * 0.5f, h * 0.18f),
                end = Offset(w * 0.5f, h * 0.82f),
                strokeWidth = stroke,
                cap = StrokeCap.Round,
            )
            drawLine(
                color = tint,
                start = Offset(w * 0.18f, h * 0.5f),
                end = Offset(w * 0.82f, h * 0.5f),
                strokeWidth = stroke,
                cap = StrokeCap.Round,
            )
        }
    }

    @Composable
    fun Menu(modifier: Modifier = Modifier, tint: Color = TallyColors.Ink1, strokeWidth: Dp = 2.dp) {
        Canvas(modifier = modifier) {
            val w = size.width
            val h = size.height
            val stroke = strokeWidth.toPx()
            val ys = listOf(h * 0.28f, h * 0.5f, h * 0.72f)
            for (y in ys) {
                drawLine(
                    color = tint,
                    start = Offset(w * 0.16f, y),
                    end = Offset(w * 0.84f, y),
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
            }
        }
    }

    /** Right-pointing chevron — the row-disclosure indicator throughout the app. */
    @Composable
    fun ChevronRight(modifier: Modifier = Modifier, tint: Color = TallyColors.Ink3, strokeWidth: Dp = 2.dp) {
        Canvas(modifier = modifier) {
            val w = size.width
            val h = size.height
            val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val path = Path().apply {
                moveTo(w * 0.36f, h * 0.2f)
                lineTo(w * 0.68f, h * 0.5f)
                lineTo(w * 0.36f, h * 0.8f)
            }
            drawPath(path, color = tint, style = stroke)
        }
    }

    /** Left-pointing chevron — back navigation. */
    @Composable
    fun ChevronLeft(modifier: Modifier = Modifier, tint: Color = TallyColors.Ink1, strokeWidth: Dp = 2.dp) {
        Canvas(modifier = modifier) {
            val w = size.width
            val h = size.height
            val stroke = Stroke(width = strokeWidth.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val path = Path().apply {
                moveTo(w * 0.64f, h * 0.2f)
                lineTo(w * 0.32f, h * 0.5f)
                lineTo(w * 0.64f, h * 0.8f)
            }
            drawPath(path, color = tint, style = stroke)
        }
    }

    @Composable
    fun Search(modifier: Modifier = Modifier, tint: Color = TallyColors.Ink3, strokeWidth: Dp = 2.dp) {
        Canvas(modifier = modifier) {
            val w = size.width
            val h = size.height
            val stroke = strokeWidth.toPx()
            val radius = minOf(w, h) * 0.28f
            val center = Offset(w * 0.42f, h * 0.42f)
            drawCircle(color = tint, radius = radius, center = center, style = Stroke(width = stroke))
            val handleStart = Offset(
                center.x + radius * 0.72f,
                center.y + radius * 0.72f,
            )
            drawLine(
                color = tint,
                start = handleStart,
                end = Offset(w * 0.86f, h * 0.86f),
                strokeWidth = stroke,
                cap = StrokeCap.Round,
            )
        }
    }
}
