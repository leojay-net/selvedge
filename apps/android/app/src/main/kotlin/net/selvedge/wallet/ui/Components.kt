package net.selvedge.wallet.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import net.selvedge.engine.RiskVerdict
import net.selvedge.wallet.brand.AppIcon
import net.selvedge.wallet.brand.iconVector
import net.selvedge.wallet.theme.LocalSelvedgeMotion
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeLayout
import net.selvedge.wallet.theme.SelvedgeRadius
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeType

enum class ButtonKind { PRIMARY, SECONDARY, DANGER, QUIET }

private const val SPINNER_SWEEP_DEGREES = 270f
private const val SPINNER_ROTATION_MILLIS = 900
private const val FULL_ROTATION_DEGREES = 360f

private data class ButtonPalette(val container: Color, val pressed: Color, val content: Color, val border: Color?)

private fun paletteFor(kind: ButtonKind): ButtonPalette = when (kind) {
    ButtonKind.PRIMARY -> ButtonPalette(SelvedgeColor.primary, SelvedgeColor.primaryActive, SelvedgeColor.onPrimary, null)
    ButtonKind.DANGER -> ButtonPalette(SelvedgeColor.danger, Color(0xFF8F1E18), SelvedgeColor.onPrimary, null)
    ButtonKind.SECONDARY -> ButtonPalette(SelvedgeColor.neutral0, SelvedgeColor.neutral100, SelvedgeColor.primary, SelvedgeColor.neutral300)
    ButtonKind.QUIET -> ButtonPalette(Color.Transparent, SelvedgeColor.neutral100, SelvedgeColor.primary, null)
}

@Composable
fun SelvedgeIcon(icon: AppIcon, color: Color, modifier: Modifier = Modifier, size: Dp = SelvedgeLayout.iconSize, description: String? = null) {
    val semanticsModifier = if (description == null) Modifier.clearAndSetSemantics { } else Modifier.semantics { contentDescription = description }
    Image(imageVector = iconVector(icon, color), contentDescription = null, modifier = modifier.size(size).then(semanticsModifier))
}

@Composable
fun Spinner(color: Color, modifier: Modifier = Modifier, size: Dp = 20.dp) {
    val motion = LocalSelvedgeMotion.current
    if (motion.reduced) {
        BasicText(text = "Working", style = SelvedgeType.caption.copy(color = color), modifier = modifier)
        return
    }
    val transition = rememberInfiniteTransition(label = "spinner")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = FULL_ROTATION_DEGREES,
        animationSpec = infiniteRepeatable(tween(SPINNER_ROTATION_MILLIS, easing = androidx.compose.animation.core.LinearEasing), RepeatMode.Restart),
        label = "spinnerRotation",
    )
    Canvas(modifier.size(size).rotate(rotation).clearAndSetSemantics { }) {
        val strokeWidth = SelvedgeLayout.iconStrokeWidth.dp.toPx()
        drawArc(color, 0f, SPINNER_SWEEP_DEGREES, false, style = Stroke(strokeWidth, cap = StrokeCap.Round))
    }
}

@Composable
fun SelvedgeButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    kind: ButtonKind = ButtonKind.PRIMARY,
    enabled: Boolean = true,
    loading: Boolean = false,
    icon: AppIcon? = null,
) {
    val palette = paletteFor(kind)
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val focused by interactions.collectIsFocusedAsState()
    val motion = LocalSelvedgeMotion.current
    val active = enabled && !loading
    val containerTarget = when {
        !enabled -> SelvedgeColor.neutral100
        pressed -> palette.pressed
        else -> palette.container
    }
    val container by animateColorAsState(containerTarget, tween(motion.shortMillis), label = "buttonContainer")
    val contentColor = if (enabled) palette.content else SelvedgeColor.neutral500
    val shape = RoundedCornerShape(SelvedgeRadius.medium)
    val outline = when {
        focused -> BorderStroke(SelvedgeLayout.focusRingWidth, if (kind == ButtonKind.DANGER) SelvedgeColor.danger else SelvedgeColor.primary)
        palette.border != null && enabled -> BorderStroke(SelvedgeLayout.borderWidth, palette.border)
        else -> null
    }
    val focusSpacing = if (focused) 2.dp else 0.dp
    Box(
        modifier = modifier
            .heightIn(min = SelvedgeLayout.minimumTouchTarget)
            .padding(focusSpacing)
            .clip(shape)
            .background(container, shape)
            .let { base -> if (outline != null) base.border(outline, shape) else base }
            .clickable(interactionSource = interactions, indication = null, enabled = active, role = Role.Button, onClick = onClick)
            .semantics {
                if (!enabled) disabled()
                if (loading) stateDescription = "Working"
            }
            .padding(horizontal = SelvedgeSpace.s16, vertical = SelvedgeSpace.s12),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
            if (loading) Spinner(contentColor) else if (icon != null) SelvedgeIcon(icon, contentColor)
            BasicText(text = label, style = SelvedgeType.button.copy(color = contentColor))
        }
    }
}

@Composable
fun IconAction(icon: AppIcon, description: String, onClick: () -> Unit, modifier: Modifier = Modifier, tint: Color = SelvedgeColor.neutral900) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    val pressed by interactions.collectIsPressedAsState()
    val shape = RoundedCornerShape(SelvedgeRadius.medium)
    Box(
        modifier = modifier
            .size(SelvedgeLayout.minimumTouchTarget)
            .clip(shape)
            .background(if (pressed) SelvedgeColor.neutral100 else Color.Transparent, shape)
            .let { base -> if (focused) base.border(SelvedgeLayout.focusRingWidth, SelvedgeColor.primary, shape) else base }
            .clickable(interactionSource = interactions, indication = null, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        SelvedgeIcon(icon, tint)
    }
}

@Composable
fun SelvedgeField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    helper: String? = null,
    errorMessage: String? = null,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    mono: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    val borderColor = when {
        errorMessage != null -> SelvedgeColor.danger
        focused -> SelvedgeColor.primary
        else -> SelvedgeColor.neutral300
    }
    val borderWidth = if (focused || errorMessage != null) SelvedgeLayout.focusRingWidth else SelvedgeLayout.borderWidth
    val shape = RoundedCornerShape(SelvedgeRadius.medium)
    val textStyle: TextStyle = (if (mono) SelvedgeType.mono else SelvedgeType.body).copy(color = if (enabled) SelvedgeColor.neutral900 else SelvedgeColor.neutral500)
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4)) {
        BasicText(text = label, style = SelvedgeType.smallStrong)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = singleLine,
            textStyle = textStyle,
            cursorBrush = SolidColor(SelvedgeColor.primary),
            keyboardOptions = keyboardOptions,
            interactionSource = interactions,
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = SelvedgeLayout.minimumTouchTarget)
                .background(if (enabled) SelvedgeColor.neutral0 else SelvedgeColor.neutral100, shape)
                .border(borderWidth, borderColor, shape)
                .padding(horizontal = SelvedgeSpace.s12, vertical = SelvedgeSpace.s12)
                .semantics {
                    contentDescription = label
                    if (errorMessage != null) error(errorMessage)
                },
        )
        if (errorMessage != null) {
            BasicText(text = errorMessage, style = SelvedgeType.small.copy(color = SelvedgeColor.danger), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
        } else if (helper != null) {
            BasicText(text = helper, style = SelvedgeType.small.copy(color = SelvedgeColor.neutral700))
        }
    }
}

@Composable
fun SelvedgeCard(modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable () -> Unit) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    val pressed by interactions.collectIsPressedAsState()
    val shape = RoundedCornerShape(SelvedgeRadius.large)
    val base = modifier
        .fillMaxWidth()
        .clip(shape)
        .background(if (pressed) SelvedgeColor.neutral100 else SelvedgeColor.neutral0, shape)
        .border(if (focused) SelvedgeLayout.focusRingWidth else SelvedgeLayout.borderWidth, if (focused) SelvedgeColor.primary else SelvedgeColor.neutral300, shape)
    val interactive = if (onClick != null) base.clickable(interactionSource = interactions, indication = null, role = Role.Button, onClick = onClick) else base
    Box(interactive.padding(SelvedgeSpace.s16)) { content() }
}

data class VerdictStyle(val label: String, val color: Color, val surface: Color, val icon: AppIcon)

fun verdictStyle(verdict: RiskVerdict): VerdictStyle = when (verdict) {
    RiskVerdict.SAFE -> VerdictStyle("Safe", SelvedgeColor.safe, SelvedgeColor.safeSurface, AppIcon.SHIELD)
    RiskVerdict.CAUTION -> VerdictStyle("Caution", SelvedgeColor.caution, SelvedgeColor.cautionSurface, AppIcon.WARNING)
    RiskVerdict.DANGER -> VerdictStyle("Danger", SelvedgeColor.danger, SelvedgeColor.dangerSurface, AppIcon.WARNING)
}

@Composable
fun VerdictBadge(verdict: RiskVerdict, modifier: Modifier = Modifier) {
    val style = verdictStyle(verdict)
    val shape = RoundedCornerShape(SelvedgeRadius.small)
    Row(
        modifier = modifier
            .background(style.surface, shape)
            .padding(horizontal = SelvedgeSpace.s8, vertical = SelvedgeSpace.s4)
            .semantics(mergeDescendants = true) { contentDescription = "Verdict: ${style.label}" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4),
    ) {
        SelvedgeIcon(style.icon, style.color, size = 16.dp)
        BasicText(text = style.label, style = SelvedgeType.caption.copy(color = style.color))
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    BasicText(text = text, style = SelvedgeType.heading, modifier = modifier.semantics { heading() })
}

@Composable
fun StatusBanner(message: String, color: Color, surface: Color, icon: AppIcon, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(SelvedgeRadius.medium)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(surface, shape)
            .border(SelvedgeLayout.borderWidth, color, shape)
            .padding(SelvedgeSpace.s12)
            .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12),
    ) {
        SelvedgeIcon(icon, color)
        BasicText(text = message, style = SelvedgeType.small.copy(color = SelvedgeColor.neutral900), modifier = Modifier.weight(1f))
    }
}

@Composable
fun EmptyState(title: String, message: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = SelvedgeSpace.s48, horizontal = SelvedgeSpace.s24),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s12),
    ) {
        net.selvedge.wallet.brand.SelvedgeMark(48.dp, color = SelvedgeColor.neutral300)
        BasicText(text = title, style = SelvedgeType.title)
        BasicText(text = message, style = SelvedgeType.body)
        if (action != null) {
            Spacer(Modifier.height(SelvedgeSpace.s8))
            action()
        }
    }
}

@Composable
fun FactRow(label: String, value: String, modifier: Modifier = Modifier, mono: Boolean = false) {
    Column(modifier = modifier.fillMaxWidth().semantics(mergeDescendants = true) { }, verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4)) {
        BasicText(text = label, style = SelvedgeType.caption)
        BasicText(text = value, style = if (mono) SelvedgeType.mono.copy(color = SelvedgeColor.neutral900) else SelvedgeType.bodyStrong)
    }
}

@Composable
fun Divider(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().height(SelvedgeLayout.borderWidth).background(SelvedgeColor.neutral100))
}
