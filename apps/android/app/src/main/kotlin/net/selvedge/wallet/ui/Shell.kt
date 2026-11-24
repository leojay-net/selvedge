package net.selvedge.wallet.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import net.selvedge.wallet.brand.AppIcon
import net.selvedge.wallet.brand.SelvedgeWordmark
import net.selvedge.wallet.theme.SelvedgeColor
import net.selvedge.wallet.theme.SelvedgeLayout
import net.selvedge.wallet.theme.SelvedgeSpace
import net.selvedge.wallet.theme.SelvedgeType

enum class Tab(val label: String, val icon: AppIcon, val destination: Destination) {
    AGENTS("Agents", AppIcon.AGENTS, Destination.Agents),
    ACTIVITY("Activity", AppIcon.ACTIVITY, Destination.Activity),
    SETTINGS("Settings", AppIcon.SETTINGS, Destination.Settings),
}

@Composable
private fun TabItem(tab: Tab, selected: Boolean, onSelect: () -> Unit, modifier: Modifier = Modifier) {
    val interactions = remember { MutableInteractionSource() }
    val focused by interactions.collectIsFocusedAsState()
    val tint = if (selected) SelvedgeColor.primary else SelvedgeColor.neutral700
    Column(
        modifier = modifier
            .heightIn(min = SelvedgeLayout.minimumTouchTarget)
            .background(if (focused) SelvedgeColor.neutral100 else Color.Transparent)
            .clickable(interactionSource = interactions, indication = null, role = Role.Tab, onClick = onSelect)
            .semantics { this.selected = selected }
            .padding(vertical = SelvedgeSpace.s8, horizontal = SelvedgeSpace.s12),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s4),
    ) {
        SelvedgeIcon(tab.icon, tint)
        BasicText(text = tab.label, style = SelvedgeType.caption.copy(color = tint))
    }
}

@Composable
fun TabShell(selectedTab: Tab, onSelect: (Tab) -> Unit, content: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().background(SelvedgeColor.neutral50).windowInsetsPadding(WindowInsets.safeDrawing)) {
        val wide = maxWidth >= SelvedgeLayout.tabletBreakpoint
        if (wide) {
            Row(Modifier.fillMaxSize()) {
                Column(
                    Modifier.fillMaxHeight().width(112.dp).background(SelvedgeColor.neutral0).padding(vertical = SelvedgeSpace.s24, horizontal = SelvedgeSpace.s8),
                    verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    net.selvedge.wallet.brand.SelvedgeMark(40.dp)
                    Spacer(Modifier.height(SelvedgeSpace.s16))
                    Tab.entries.forEach { tab -> TabItem(tab, tab == selectedTab, { onSelect(tab) }) }
                }
                Column(Modifier.weight(1f).fillMaxHeight()) { content() }
            }
        } else {
            Column(Modifier.fillMaxSize()) {
                Column(Modifier.weight(1f).fillMaxWidth()) { content() }
                Row(Modifier.fillMaxWidth().background(SelvedgeColor.neutral0), horizontalArrangement = Arrangement.SpaceEvenly) {
                    Tab.entries.forEach { tab -> TabItem(tab, tab == selectedTab, { onSelect(tab) }, Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
fun ScreenColumn(
    modifier: Modifier = Modifier,
    background: Color = SelvedgeColor.neutral50,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier.fillMaxSize().background(background).verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = Modifier.widthIn(max = SelvedgeLayout.contentMaximumWidth).fillMaxWidth().padding(PaddingValues(SelvedgeSpace.s16)),
            verticalArrangement = Arrangement.spacedBy(SelvedgeSpace.s16),
            content = content,
        )
    }
}

@Composable
fun TopBarWithBack(title: String, onBack: () -> Unit, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(SelvedgeSpace.s8)) {
        IconAction(AppIcon.BACK, "Back", onBack)
        net.selvedge.wallet.ui.SectionTitle(title)
    }
}

@Composable
fun BrandHeader(modifier: Modifier = Modifier) {
    SelvedgeWordmark(modifier.fillMaxWidth().padding(vertical = SelvedgeSpace.s8))
}
