package net.selvedge.wallet

import android.graphics.Bitmap
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.io.FileOutputStream
import net.selvedge.wallet.theme.SelvedgeTheme

object ScreenSizes {
    val phone = DpSize(360.dp, 780.dp)
    val tablet = DpSize(840.dp, 900.dp)
}

@Composable
fun SizedScreen(size: DpSize, content: @Composable () -> Unit) {
    SelvedgeTheme { Box(Modifier.requiredSize(size)) { content() } }
}

object ScreenshotSink {
    private const val DIRECTORY_NAME = "screenshots"
    private const val PNG_QUALITY = 100

    fun directory(): File {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(requireNotNull(context.getExternalFilesDir(null)) { "External files directory is unavailable" }, DIRECTORY_NAME)
        check(directory.exists() || directory.mkdirs()) { "Could not create ${directory.absolutePath}" }
        return directory
    }

    fun save(node: SemanticsNodeInteraction, name: String): Bitmap {
        val bitmap = node.captureToImage().asAndroidBitmap()
        FileOutputStream(File(directory(), "$name.png")).use { stream -> check(bitmap.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, stream)) { "Could not encode $name" } }
        return bitmap
    }

    fun containsColor(bitmap: Bitmap, argb: Int, minimumPixels: Int): Boolean {
        var matches = 0
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        for (pixel in pixels) if (pixel == argb) matches += 1
        return matches >= minimumPixels
    }
}
