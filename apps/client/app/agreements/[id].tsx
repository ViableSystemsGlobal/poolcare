import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../src/lib/api-client";
import { useTheme } from "../../src/contexts/ThemeContext";

const FREQ: Record<string, string> = {
  once_week: "Once a week",
  weekly: "Once a week",
  twice_week: "Twice a week",
  thrice_week: "Three times a week",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};
const DAYS: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

const money = (cents: number | null | undefined, cur = "GHS") =>
  cents == null ? "—" : `${cur} ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const day = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/**
 * Review and accept the service agreement + Schedule B (contract cl. 11.4,
 * 30.7). Accepting in the app is the client's written acceptance.
 */
export default function AgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColor } = useTheme();
  const [agreement, setAgreement] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .getAgreement(id)
      .then(setAgreement)
      .catch((e: any) => Alert.alert("Error", e?.message || "Couldn't load the agreement"))
      .finally(() => setLoading(false));
  }, [id]);

  const accept = async () => {
    setSubmitting(true);
    try {
      const updated = await api.acceptAgreement(id, name.trim());
      setAgreement(updated);
      Alert.alert("Accepted", "Thank you. A copy of what you accepted stays here in the app.");
    } catch (e: any) {
      Alert.alert("Couldn't accept", e?.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const b = agreement?.scheduleB || {};
  const cur = b.currency || "GHS";
  const rows: Array<[string, string]> = agreement
    ? [
        ["Service property", [b.serviceProperty, b.address].filter(Boolean).join(" · ") || "—"],
        ["Service package", b.servicePackage || "—"],
        ["Payment", b.termMonths ? `${b.paymentMode}, ${b.termMonths} months in advance` : b.paymentMode || "—"],
        ["Monthly rate", money(b.monthlyRateCents, cur)],
        ...(b.termAmountCents != null ? ([["Amount per term", money(b.termAmountCents, cur)]] as Array<[string, string]>) : []),
        [
          "Service",
          `${FREQ[b.frequency] || b.frequency || "—"}${
            b.serviceDays ? ` (${String(b.serviceDays).split(",").map((d: string) => DAYS[d] || d).join(", ")})` : ""
          }`,
        ],
        ...(b.contractedVisitsPerTerm != null
          ? ([["Contracted visits per term", String(b.contractedVisitsPerTerm)]] as Array<[string, string]>)
          : []),
        ["Emergency cleaning visits", `${b.emergencyVisitsPerMonth || 0} per month`],
        ["Chemical allowance", b.chemicalAllowanceCents != null ? `${money(b.chemicalAllowanceCents, cur)} per month` : "Not included"],
        ["Renewal", b.autoRenew ? "Automatic (14 days' notice of the price)" : "Manual — no obligation to renew"],
        ...(b.servicePeriodStart
          ? ([["Service period", `${day(b.servicePeriodStart)} – ${day(b.servicePeriodEnd)}`]] as Array<[string, string]>)
          : []),
        [
          "Authorised app users",
          (b.authorisedUsers || []).length
            ? b.authorisedUsers.map((u: any) => [u.name, u.contact].filter(Boolean).join(" · ")).join("\n")
            : "The account holder",
        ],
        ...(b.specialConditions ? ([["Special conditions", b.specialConditions]] as Array<[string, string]>) : []),
      ]
    : [];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Agreement</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      ) : !agreement ? (
        <View style={styles.center}>
          <Text style={styles.muted}>Agreement not found.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.intro}>
              Please read the PoolCare service agreement and check your plan details (Schedule B) below.
            </Text>

            {agreement.documentUrl && (
              <TouchableOpacity style={styles.docLink} onPress={() => Linking.openURL(agreement.documentUrl)}>
                <Ionicons name="document-text-outline" size={20} color={themeColor} />
                <Text style={[styles.docLinkText, { color: themeColor }]}>
                  Read the full agreement (version {agreement.version})
                </Text>
                <Ionicons name="open-outline" size={16} color={themeColor} />
              </TouchableOpacity>
            )}

            <Text style={styles.sectionTitle}>Schedule B — your plan</Text>
            <View style={styles.card}>
              {rows.map(([label, value], i) => (
                <View key={label} style={[styles.row, i < rows.length - 1 && styles.rowBorder]}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
            </View>

            {agreement.status === "accepted" ? (
              <View style={styles.acceptedBox}>
                <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                <Text style={styles.acceptedText}>
                  Accepted by {agreement.acceptedName} on{" "}
                  {new Date(agreement.acceptedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            ) : agreement.status === "superseded" ? (
              <Text style={styles.muted}>This version has been replaced by a newer one.</Text>
            ) : (
              <View style={styles.acceptBox}>
                <TouchableOpacity style={styles.checkRow} onPress={() => setAgreed(!agreed)}>
                  <Ionicons name={agreed ? "checkbox" : "square-outline"} size={22} color={agreed ? themeColor : "#9ca3af"} />
                  <Text style={styles.checkText}>
                    I have read the service agreement and agree to it and to the plan details above.
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.nameInput}
                  placeholder="Type your full name to sign"
                  placeholderTextColor="#9ca3af"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
                <TouchableOpacity
                  style={[styles.acceptBtn, { backgroundColor: themeColor }, (!agreed || name.trim().length < 3 || submitting) && { opacity: 0.5 }]}
                  disabled={!agreed || name.trim().length < 3 || submitting}
                  onPress={accept}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.acceptBtnText}>Accept agreement</Text>}
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 20, paddingBottom: 60, gap: 14 },
  intro: { fontSize: 15, color: "#374151", lineHeight: 22 },
  muted: { fontSize: 14, color: "#6b7280" },
  docLink: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  docLinkText: { flex: 1, fontSize: 15, fontWeight: "600" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  card: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14 },
  row: { paddingVertical: 12, gap: 2 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  rowLabel: { fontSize: 12, color: "#6b7280" },
  rowValue: { fontSize: 15, color: "#111827", fontWeight: "500" },
  acceptBox: { backgroundColor: "#fff", borderRadius: 12, padding: 14, gap: 12 },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkText: { flex: 1, fontSize: 14, color: "#374151", lineHeight: 20 },
  nameInput: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, fontSize: 15, color: "#111827" },
  acceptBtn: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  acceptBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  acceptedBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#f0fdf4", borderRadius: 12, padding: 14 },
  acceptedText: { flex: 1, fontSize: 14, color: "#166534" },
});
