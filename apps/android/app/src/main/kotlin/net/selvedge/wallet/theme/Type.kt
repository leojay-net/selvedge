@file:OptIn(ExperimentalTextApi::class)

package net.selvedge.wallet.theme

import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import net.selvedge.wallet.R

private const val FRAUNCES_OPTICAL_SIZE = 48f

private fun displayFont(weight: FontWeight) = Font(
    R.font.fraunces_variable,
    weight,
    variationSettings = FontVariation.Settings(
        FontVariation.weight(weight.weight),
        FontVariation.Setting("opsz", FRAUNCES_OPTICAL_SIZE),
    ),
)

private fun textFont(weight: FontWeight) = Font(
    R.font.inter_variable,
    weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

private fun monoFont(weight: FontWeight) = Font(
    R.font.jetbrains_mono_variable,
    weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val DisplayFamily = FontFamily(displayFont(FontWeight.Normal), displayFont(FontWeight.SemiBold))
val TextFamily = FontFamily(textFont(FontWeight.Normal), textFont(FontWeight.Medium), textFont(FontWeight.SemiBold))
val MonoFamily = FontFamily(monoFont(FontWeight.Normal), monoFont(FontWeight.Medium))

private const val TABULAR_FIGURES = "tnum"

object SelvedgeType {
    val caption = TextStyle(fontFamily = TextFamily, fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium, color = SelvedgeColor.neutral700)
    val small = TextStyle(fontFamily = TextFamily, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal, color = SelvedgeColor.neutral700)
    val smallStrong = small.copy(fontWeight = FontWeight.SemiBold, color = SelvedgeColor.neutral900)
    val body = TextStyle(fontFamily = TextFamily, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Normal, color = SelvedgeColor.neutral700)
    val bodyStrong = body.copy(fontWeight = FontWeight.SemiBold, color = SelvedgeColor.neutral900)
    val title = TextStyle(fontFamily = DisplayFamily, fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold, color = SelvedgeColor.neutral900)
    val heading = TextStyle(fontFamily = DisplayFamily, fontSize = 24.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold, color = SelvedgeColor.neutral900)
    val large = TextStyle(fontFamily = DisplayFamily, fontSize = 32.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold, color = SelvedgeColor.neutral900)
    val hero = TextStyle(fontFamily = DisplayFamily, fontSize = 44.sp, lineHeight = 52.sp, fontWeight = FontWeight.SemiBold, color = SelvedgeColor.neutral900)
    val amount = TextStyle(fontFamily = TextFamily, fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = TABULAR_FIGURES, color = SelvedgeColor.neutral900)
    val mono = TextStyle(fontFamily = MonoFamily, fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Normal, fontFeatureSettings = TABULAR_FIGURES, color = SelvedgeColor.neutral700)
    val monoSmall = mono.copy(fontSize = 12.sp, lineHeight = 16.sp)
    val button = TextStyle(fontFamily = TextFamily, fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold, color = SelvedgeColor.onPrimary)
}
