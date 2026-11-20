import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking, Platform, RefreshControl } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { api, CarerAssessment } from "../../../src/lib/api-client";
import { useToast } from "../../../src/components/Toast";
import {
  C,
  Card,
  Chip,
  Avatar,
  Button,
  Footer,
  IconButton,
  EmptyState,
  Notice,
  PoolThumb,
  useAccent,
  dayLabel,
  fmtTime,
} from "../../../src/ui";

const RECORDS = ["Pool details", "Water test", "Condition", "Equipment", "Photos", "Recommendation"];

export default function AssessmentBriefScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accent, tint } = useAccent();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [a, setA] = useState<CarerAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setA(await api.getAssessment(id));
    } catch (e: any) {
      setError(e?.message || "Couldn't load this assessment");
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const directions = () => {
    if (!a) return;
    const target = a.lat != null && a.lng != null ? `${a.lat},${a.lng}` : a.address;
    if (!target) {
      showToast("No address on file — call the prospect", "warning");
      return;
    }
    const q = encodeURIComponent(target);
    const url = Platform.OS === "ios" ? `maps://?daddr=${q}` : `google.navigation:q=${q}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${q}`));
  };

  const call = () => a?.phone && Linking.openURL(`tel:${a.phone}`);
  const message = () => {
    if (!a?.phone) return;
    const digits = a.phone.replace(/[^\d+]/g, "").replace(/^\+/, "");
    Linking.openURL(`https://wa.me/${digits}`).catch(() => Linking.openURL(`sms:${a.phone}`));
  };

  const start = async () => {
    if (!a) return;
    if (a.locationAt) {
      router.push(`/assessments/${a.id}/report` as any);
      return;
    }
    setStarting(true);
    try {
      let loc: { lat: number; lng: number } | undefined;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const pos = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            new Promise<null>((r) => setTimeout(() => r(null), 12000)),
          ]);
          if (pos) loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        }
      } catch {}
      if (!loc) showToast("Couldn't get your location — starting without a pin", "warning");
      const updated = await api.startAssessment(a.id, loc);
      setA(updated);
      router.push(`/assessments/${a.id}/report` as any);
    } catch (e: any) {
      showToast(e?.message || "Couldn't start the assessment", "error");
    } finally {
      setStarting(false);
    }
  };

  if (error && !a) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60, paddingHorizontal: 16 }]}>
        <EmptyState icon="alert-circle-outline" title="Couldn't open assessment" body={error} action="Try again" onAction={load} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const done = a?.status === "COMPLETED";
  const photos = a?.report.photoUrls || [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 190 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: tint, paddingTop: insets.top }]}>
          <View style={[styles.road, { top: 120, transform: [{ rotate: "-8deg" }] }]} />
          <View style={[styles.road, { top: 40, left: 120, width: 14, height: 260, transform: [{ rotate: "18deg" }] }]} />
          <View style={[styles.pin, { backgroundColor: C.ink }]}>
            <Ionicons name="clipboard" size={16} color="#ffffff" />
          </View>
          <View style={[styles.heroBar, { top: insets.top + 8 }]}>
            <IconButton icon="chevron-back" label="Back" variant="white" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
            <TouchableOpacity style={styles.dirBtn} onPress={directions} accessibilityRole="button">
              <Ionicons name="navigate-outline" size={16} color={C.ink} />
              <Text style={styles.dirText}>Directions</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sheet}>
          {!a ? (
            <Text style={{ color: C.muted, paddingVertical: 24 }}>Loading…</Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Chip label="Assessment" tone="dark" />
                {done ? <Chip label="Submitted" tone="accent" icon="checkmark" /> : null}
                {a.scheduledAt ? (
                  <Text style={styles.when}>
                    {dayLabel(a.scheduledAt)} · {fmtTime(a.scheduledAt)}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.title}>{a.prospectName}</Text>
              {a.address ? <Text style={styles.sub}>{a.address}</Text> : <Text style={styles.sub}>No address on file</Text>}

              {/* Contact + brief */}
              <Card style={{ marginTop: 16 }}>
                <View style={styles.contact}>
                  <Avatar name={a.contactName || a.prospectName} size={40} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.contactName} numberOfLines={1}>
                      {a.contactName || a.prospectName}
                    </Text>
                    <Text style={styles.contactSub} numberOfLines={1}>
                      {a.phone || "No phone on file"}
                    </Text>
                  </View>
                  {a.phone ? (
                    <>
                      <IconButton icon="logo-whatsapp" label="Message prospect" variant="outline" onPress={message} />
                      <IconButton icon="call-outline" label="Call prospect" variant="outline" onPress={call} />
                    </>
                  ) : null}
                </View>
                <View style={styles.briefBlock}>
                  <Text style={styles.blockLabel}>Brief from the office</Text>
                  <Text style={styles.blockText}>{a.brief || "No brief added — use the enquiry details below."}</Text>
                  {a.assignedByName ? <Text style={styles.blockMeta}>Assigned by {a.assignedByName}</Text> : null}
                </View>
                {a.leadNotes ? (
                  <View style={styles.briefBlock}>
                    <Text style={styles.blockLabel}>From the enquiry</Text>
                    <Text style={styles.blockText}>{a.leadNotes}</Text>
                  </View>
                ) : null}
              </Card>

              {done ? (
                <Card style={{ marginTop: 12, padding: 14 }}>
                  <Text style={styles.blockLabel}>Your report</Text>
                  <Text style={[styles.blockText, { marginTop: 4 }]}>
                    {[a.report.poolType, a.report.dimensions, a.report.conditionRating ? `Condition ${a.report.conditionRating}/5` : null, a.report.recommendedPlan]
                      .filter(Boolean)
                      .join(" · ") || "Submitted"}
                  </Text>
                  {a.report.findings ? <Text style={[styles.blockText, { marginTop: 6 }]}>{a.report.findings}</Text> : null}
                  {photos.length ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 10 }}>
                      {photos.map((p) => (
                        <PoolThumb key={p} uri={p} size={64} />
                      ))}
                    </ScrollView>
                  ) : null}
                  {a.assessedAt ? <Text style={styles.blockMeta}>Submitted {dayLabel(a.assessedAt)} · {fmtTime(a.assessedAt)}</Text> : null}
                </Card>
              ) : (
                <Card style={{ marginTop: 12, padding: 14 }}>
                  <Text style={styles.blockLabel}>You'll record</Text>
                  <View style={styles.tags}>
                    {RECORDS.map((r) => (
                      <Chip key={r} label={r} />
                    ))}
                  </View>
                </Card>
              )}

              {!done && a.locationAt ? (
                <Notice tone="accent" icon="location" style={{ marginTop: 12 }}>
                  Location pinned{a.address ? ` · ${a.address}` : ""}. Your draft is saved as you go.
                </Notice>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {a && !done ? (
        <Footer>
          <Button
            title={a.locationAt ? "Continue report" : "Start assessment"}
            icon={a.locationAt ? "create-outline" : "location-outline"}
            onPress={start}
            loading={starting}
          />
          <Text style={styles.footHint}>{a.locationAt ? "Pick up where you left off" : "Pins your location to the site as you start"}</Text>
        </Footer>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  hero: { height: 240, overflow: "hidden" },
  road: { position: "absolute", left: -20, width: 460, height: 14, backgroundColor: "rgba(255,255,255,0.75)", borderRadius: 7 },
  pin: { position: "absolute", left: "55%", top: 120, width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  heroBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  dirBtn: { height: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", gap: 6, elevation: 3, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  dirText: { fontSize: 14, fontWeight: "600", color: C.ink },
  sheet: { marginTop: -24, backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  when: { fontSize: 13, color: C.muted },
  title: { fontSize: 24, fontWeight: "700", color: C.ink, marginTop: 8, letterSpacing: -0.2 },
  sub: { fontSize: 14, color: C.muted, marginTop: 2 },
  contact: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  contactName: { fontSize: 15, fontWeight: "600", color: C.ink },
  contactSub: { fontSize: 13, color: C.muted },
  briefBlock: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  blockLabel: { fontSize: 13, fontWeight: "600", color: C.ink },
  blockText: { fontSize: 14, color: C.body, lineHeight: 20, marginTop: 2 },
  blockMeta: { fontSize: 12, color: C.muted, marginTop: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  footHint: { textAlign: "center", fontSize: 12, color: C.muted, marginTop: 8 },
});
