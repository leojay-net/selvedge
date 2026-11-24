package net.selvedge.wallet.theme

import android.provider.Settings
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext

private const val ANIMATIONS_DISABLED_SCALE = 0f

@Composable
fun SelvedgeTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val motion = remember(context) {
        val animatorScale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        if (animatorScale == ANIMATIONS_DISABLED_SCALE) SelvedgeMotion.reduced() else SelvedgeMotion.standard()
    }
    CompositionLocalProvider(LocalSelvedgeMotion provides motion, content = content)
}
