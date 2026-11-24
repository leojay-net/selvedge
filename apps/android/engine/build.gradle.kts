plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(libs.serialization.json)
    testImplementation(libs.junit)
    testImplementation(kotlin("test-junit"))
}

tasks.test {
    useJUnit()
    systemProperty("selvedge.vectors", rootDir.resolve("../../vectors").canonicalPath)
    testLogging {
        events("failed")
        showStandardStreams = false
    }
}
