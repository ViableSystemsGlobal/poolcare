import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from "react-native";

/**
 * Catches render/lifecycle errors anywhere below it and shows the message
 * instead of the app closing. A React Native crash otherwise gives the user a
 * blank close and gives us nothing to work from — this turns "it crashes" into
 * a copyable stack trace.
 *
 * Note this catches JS errors only. Native crashes still close the app and
 * surface in TestFlight → Feedback → Crashes.
 */
type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    this.setState({ info: info?.componentStack ?? null });
    // Keep it in the device log too, for adb logcat / Console.app.
    console.error("[ErrorBoundary]", error?.message, error?.stack, info?.componentStack);
  }

  private report() {
    const { error, info } = this.state;
    return [
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Error: ${error?.message ?? "unknown"}`,
      "",
      error?.stack ?? "(no stack)",
      "",
      "Component stack:",
      info ?? "(none)",
    ].join("\n");
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children as React.ReactElement;

    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Something broke</Text>
        <Text style={styles.sub}>
          Long-press the text below to select and copy it, then send it to
          the team — it says exactly what failed.
        </Text>

        <ScrollView style={styles.box} contentContainerStyle={{ padding: 12 }}>
          <Text selectable style={styles.mono}>{this.report()}</Text>
        </ScrollView>

        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => this.setState({ error: null, info: null })}
          >
            <Text style={styles.btnPrimaryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#f4f5f2", padding: 20, paddingTop: 70 },
  title: { fontSize: 24, fontWeight: "700", color: "#10231a" },
  sub: { fontSize: 14, color: "#5b6b62", marginTop: 6, marginBottom: 16, lineHeight: 20 },
  box: { flex: 1, backgroundColor: "#ffffff", borderRadius: 18 },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11, color: "#3c4a42", lineHeight: 16 },
  row: { flexDirection: "row", gap: 10, marginTop: 16, marginBottom: 10 },
  btn: { flex: 1, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#dfe3dc" },
  btnText: { fontSize: 16, color: "#10231a" },
  btnPrimary: { backgroundColor: "#2f6a47", borderColor: "#2f6a47" },
  btnPrimaryText: { fontSize: 16, color: "#ffffff", fontWeight: "600" },
});
