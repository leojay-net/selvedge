package net.selvedge.wallet.theme

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object SelvedgeColor {
    val primary = Color(0xFF1E3A5F)
    val primaryHover = Color(0xFF16304F)
    val primaryActive = Color(0xFF102640)
    val onPrimary = Color(0xFFFFFFFF)
    val neutral0 = Color(0xFFFFFFFF)
    val neutral50 = Color(0xFFF6F5F2)
    val neutral100 = Color(0xFFECEAE4)
    val neutral300 = Color(0xFFC9C5BA)
    val neutral500 = Color(0xFF7A766B)
    val neutral700 = Color(0xFF46433B)
    val neutral900 = Color(0xFF1B1A17)
    val safe = Color(0xFF2E6B4F)
    val caution = Color(0xFF8A5A00)
    val danger = Color(0xFFB3261E)
    val dangerSurface = Color(0xFFFBEDEC)
    val cautionSurface = Color(0xFFF8F0DE)
    val safeSurface = Color(0xFFE8F1EC)
}

object SelvedgeSpace {
    val s4 = 4.dp
    val s8 = 8.dp
    val s12 = 12.dp
    val s16 = 16.dp
    val s24 = 24.dp
    val s32 = 32.dp
    val s48 = 48.dp
    val s64 = 64.dp
}

object SelvedgeRadius {
    val small = 4.dp
    val medium = 8.dp
    val large = 12.dp
}

object SelvedgeLayout {
    val minimumTouchTarget = 48.dp
    val contentMaximumWidth = 640.dp
    val tabletBreakpoint = 600.dp
    val iconSize = 24.dp
    val iconStrokeWidth = 1.75f
    val borderWidth = 1.dp
    val focusRingWidth = 2.dp
}

class SelvedgeMotion(val shortMillis: Int, val mediumMillis: Int, val longMillis: Int, val reduced: Boolean) {
    companion object {
        const val SHORT_MILLIS = 120
        const val MEDIUM_MILLIS = 200
        const val LONG_MILLIS = 320

        fun standard() = SelvedgeMotion(SHORT_MILLIS, MEDIUM_MILLIS, LONG_MILLIS, reduced = false)
        fun reduced() = SelvedgeMotion(0, 0, 0, reduced = true)
    }
}

val LocalSelvedgeMotion = staticCompositionLocalOf { SelvedgeMotion.standard() }
