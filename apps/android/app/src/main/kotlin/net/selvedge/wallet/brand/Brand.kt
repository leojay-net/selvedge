package net.selvedge.wallet.brand

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.BasicText
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeType

private const val MARK_GRID = 24f
private const val MARK_STROKE = 2f
private const val WARP_TOP = 4f
private const val WARP_BOTTOM = 20f
private const val WEFT_LEFT = 3f
private const val WEFT_RIGHT = 18f
private const val WEFT_TOP = 9f
private const val WEFT_BOTTOM = 15f
private const val WEFT_LOOP_RADIUS = 3f
private val WARP_POSITIONS = listOf(5f, 9f, 13f)

/** Vertical warp threads closed on the right by a looped weft: the selvedge edge of woven cloth. */
fun selvedgeMark(color: Color): ImageVector {
    val builder = ImageVector.Builder(
        name = "SelvedgeMark",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = MARK_GRID,
        viewportHeight = MARK_GRID,
    )
    for (warpX in WARP_POSITIONS) {
        builder.path(
            stroke = SolidColor(color),
            strokeLineWidth = MARK_STROKE,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ) {
            moveTo(warpX, WARP_TOP)
            lineTo(warpX, WARP_BOTTOM)
        }
    }
    builder.path(
        stroke = SolidColor(color),
        strokeLineWidth = MARK_STROKE,
        strokeLineCap = StrokeCap.Round,
        strokeLineJoin = StrokeJoin.Round,
    ) {
        moveTo(WEFT_LEFT, WEFT_TOP)
        lineTo(WEFT_RIGHT, WEFT_TOP)
        arcTo(WEFT_LOOP_RADIUS, WEFT_LOOP_RADIUS, 0f, false, true, WEFT_RIGHT, WEFT_BOTTOM)
        lineTo(WEFT_LEFT, WEFT_BOTTOM)
    }
    return builder.build()
}

@Composable
fun SelvedgeMark(size: Dp, modifier: Modifier = Modifier, color: Color = SelvedgeColor.primary) {
    Image(
        imageVector = selvedgeMark(color),
        contentDescription = null,
        modifier = modifier.size(size).clearAndSetSemantics { },
    )
}

@Composable
fun SelvedgeWordmark(modifier: Modifier = Modifier, markSize: Dp = 32.dp) {
    Row(
        modifier = modifier.semantics { contentDescription = "Selvedge" },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SelvedgeMark(markSize)
        Spacer(Modifier.width(SelvedgeSpace.s8))
        BasicText(text = "Selvedge", style = SelvedgeType.title)
    }
}
