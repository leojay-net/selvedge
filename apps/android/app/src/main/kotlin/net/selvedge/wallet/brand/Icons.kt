package net.selvedge.wallet.brand

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.dp
import net.selvedge.wallet.theme.SelvedgeLayout

private const val ICON_GRID = 24f

enum class AppIcon { AGENTS, ACTIVITY, SETTINGS, SHIELD, WARNING, REVOKE, BACK, PLUS, CLOSE, CHECK, KEY, WALLET }

private fun strokeIcon(name: String, color: Color, draw: PathBuilder.() -> Unit): ImageVector =
    ImageVector.Builder(name, 24.dp, 24.dp, ICON_GRID, ICON_GRID)
        .path(
            stroke = SolidColor(color),
            strokeLineWidth = SelvedgeLayout.iconStrokeWidth,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
            pathBuilder = draw,
        )
        .build()

fun iconVector(icon: AppIcon, color: Color): ImageVector = when (icon) {
    AppIcon.AGENTS -> strokeIcon("Agents", color) {
        moveTo(12f, 4f); lineTo(19f, 8f); lineTo(19f, 16f); lineTo(12f, 20f); lineTo(5f, 16f); lineTo(5f, 8f); close()
        moveTo(12f, 10f); lineTo(12f, 14f)
        moveTo(9.5f, 12f); lineTo(14.5f, 12f)
    }
    AppIcon.ACTIVITY -> strokeIcon("Activity", color) {
        moveTo(3f, 12f); lineTo(7f, 12f); lineTo(10f, 5f); lineTo(14f, 19f); lineTo(17f, 12f); lineTo(21f, 12f)
    }
    AppIcon.SETTINGS -> strokeIcon("Settings", color) {
        moveTo(4f, 7f); lineTo(20f, 7f)
        moveTo(4f, 17f); lineTo(20f, 17f)
        moveTo(9f, 4.5f); lineTo(9f, 9.5f)
        moveTo(15f, 14.5f); lineTo(15f, 19.5f)
    }
    AppIcon.SHIELD -> strokeIcon("Shield", color) {
        moveTo(12f, 3f); lineTo(19f, 6f); lineTo(19f, 12f)
        curveTo(19f, 16f, 16f, 19f, 12f, 21f)
        curveTo(8f, 19f, 5f, 16f, 5f, 12f)
        lineTo(5f, 6f); close()
        moveTo(9f, 12f); lineTo(11.25f, 14.25f); lineTo(15f, 9.75f)
    }
    AppIcon.WARNING -> strokeIcon("Warning", color) {
        moveTo(12f, 4f); lineTo(21f, 19f); lineTo(3f, 19f); close()
        moveTo(12f, 10f); lineTo(12f, 14f)
        moveTo(12f, 16.5f); lineTo(12f, 16.6f)
    }
    AppIcon.REVOKE -> strokeIcon("Revoke", color) {
        moveTo(12f, 3.5f)
        arcTo(8.5f, 8.5f, 0f, true, true, 12f, 20.5f)
        arcTo(8.5f, 8.5f, 0f, true, true, 12f, 3.5f)
        moveTo(6f, 6f); lineTo(18f, 18f)
    }
    AppIcon.BACK -> strokeIcon("Back", color) {
        moveTo(19f, 12f); lineTo(5f, 12f)
        moveTo(11f, 6f); lineTo(5f, 12f); lineTo(11f, 18f)
    }
    AppIcon.PLUS -> strokeIcon("Plus", color) {
        moveTo(12f, 5f); lineTo(12f, 19f)
        moveTo(5f, 12f); lineTo(19f, 12f)
    }
    AppIcon.CLOSE -> strokeIcon("Close", color) {
        moveTo(6f, 6f); lineTo(18f, 18f)
        moveTo(18f, 6f); lineTo(6f, 18f)
    }
    AppIcon.CHECK -> strokeIcon("Check", color) {
        moveTo(5f, 12.5f); lineTo(10f, 17.5f); lineTo(19f, 7f)
    }
    AppIcon.KEY -> strokeIcon("Key", color) {
        moveTo(8f, 15f)
        arcTo(4f, 4f, 0f, true, true, 8.01f, 15f)
        moveTo(11f, 12f); lineTo(20f, 3f)
        moveTo(16f, 7f); lineTo(18.5f, 9.5f)
    }
    AppIcon.WALLET -> strokeIcon("Wallet", color) {
        moveTo(4f, 7f); lineTo(18f, 7f); lineTo(18f, 19f); lineTo(4f, 19f); close()
        moveTo(18f, 11f); lineTo(21f, 11f); lineTo(21f, 15f); lineTo(18f, 15f)
        moveTo(7f, 4f); lineTo(15f, 4f)
    }
}
