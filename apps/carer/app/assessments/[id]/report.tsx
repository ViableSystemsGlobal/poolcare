import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, AssessmentReportFields, CarerAssessment } from "../../../src/lib/api-client";
import { useToast } from "../../../src/components/Toast";
import { C, Card, Choice, Button, Field, Footer, Notice, PoolThumb, ScreenHeader, useAccent } from "../../../src/ui";

type ImagePickerModule = typeof import("expo-image-picker");
function getImagePicker(): ImagePickerModule | null {
  try {
    return require("expo-image-picker") as ImagePickerModule;
  } catch {
    return null;
  }
}

const POOL_TYPES = ["Skimmer", "Infinity", "Overflow", "Spa", "Other"];
const SURFACES = ["Tile", "Plaster", "Pebble", "Vinyl", "Fibreglass"];
const WATER = ["Chlorine", "Saltwater", "Other"];
const CONDITION = [
  { v: 1, l: "Bad" },
  { v: 2, l: "Poor" },
  { v: 3, l: "Fair" },
  { v: 4, l: "Good" },
  { v: 5, l: "Great" },
];
const PLANS = ["One-off clean-up", "Weekly", "Fortnightly", "Monthly"];

const TESTS: { key: keyof AssessmentReportFields; label: string; unit?: string; min: number; max: number }[] = [
  { key: "ph", label: "pH", min: 0, max: 14 },
  { key: "chlorineFree", label: "Chlorine", unit: "ppm", min: 0, max: 20 },
  { key: "alkalinity", label: "Alkalinity", unit: "ppm", min: 0, max: 500 },
  { key: "calciumHardness", label: "Calcium", unit: "ppm", min: 0, max: 1500 },
  { key: "cyanuricAcid", label: "CYA", unit: "ppm", min: 0, max: 300 },
  { key: "salinity", label: "Salinity", unit: "ppm", min: 0, max: 10000 },
];

type Form = {
  poolType: string;
  surfaceType: string;
  filtrationType: string;
  len: string;
  wid: string;
  dep: string;
  tests: Record<string, string>;
  conditionRating: number | null;
  equipmentNotes: string;
  photoUrls: string[];
  findings: string;
  recommendedPlan: string;
  recommendation: string;
};

const num = (s: string) => {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function fromReport(r: AssessmentReportFields): Form {
  const dims = (r.dimensions || "").match(/[\d.]+/g) || [];
  const tests: Record<string, string> = {};
  TESTS.forEach((t) => {
    const v = r[t.key];
    tests[t.key] = v == null ? "" : String(v);
  });
  return {
    poolType: r.poolType || "",
    surfaceType: r.surfaceType || "",
    filtrationType: r.filtrationType || "",
    len: dims[0] || "",
    wid: dims[1] || "",
    dep: dims[2] || "",
    tests,
    conditionRating: r.conditionRating ?? null,
    equipmentNotes: r.equipmentNotes || "",
    photoUrls: r.photoUrls || [],
    findings: r.findings || "",
    recommendedPlan: r.recommendedPlan || "",
    recommendation: r.recommendation || "",
  };
}

function volumeOf(f: Form) {
  const l = num(f.len), w = num(f.wid), d = num(f.dep);
  return l && w && d ? Math.round(l * w * d * 1000) : null;
}

function toPayload(f: Form): Partial<AssessmentReportFields> {
  const l = num(f.len), w = num(f.wid), d = num(f.dep);
  const p: any = {
    poolType: f.poolType || undefined,
    surfaceType: f.surfaceType || undefined,
    filtrationType: f.filtrationType || undefined,
    dimensions: l || w || d ? `${f.len || "?"} × ${f.wid || "?"} × ${f.dep || "?"} m` : undefined,
    volumeL: volumeOf(f) ?? undefined,
    conditionRating: f.conditionRating ?? undefined,
    equipmentNotes: f.equipmentNotes.trim() || undefined,
    photoUrls: f.photoUrls,
    findings: f.findings.trim() || undefined,
    recommendedPlan: f.recommendedPlan || undefined,
    recommendation: f.recommendation.trim() || undefined,
  };
  TESTS.forEach((t) => {
    const v = num(f.tests[t.key] || "");
    if (v != null) p[t.key] = v;
  });
  return p;
}

export default function AssessmentReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accent } = useAccent();
  const { showToast } = useToast();
  const [a, setA] = useState<CarerAssessment | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [uploading, setUploading] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Form | null>(null);

  useEffect(() => {
    api
      .getAssessment(id)
      .then((r) => {
        setA(r);
        const f = fromReport(r.report);
        setForm(f);
        latest.current = f;
        if (r.status === "COMPLETED") router.replace(`/assessments/${id}` as any);
      })
      .catch((e) => showToast(e?.message || "Couldn't load the assessment", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveNow = useCallback(async () => {
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    setSaveState("saving");
    try {
      await api.saveAssessmentDraft(id, toPayload(latest.current));
      setSaveState("saved");
    } catch {
      dirty.current = true;
      setSaveState("error");
    }
  }, [id]);

  // Save the draft on the way out
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (dirty.current && latest.current) api.saveAssessmentDraft(id, toPayload(latest.current)).catch(() => {});
    },
    [id],
  );

  const update = (patch: Partial<Form>) => {
    setForm((prev) => {
      const next = { ...(prev as Form), ...patch };
      latest.current = next;
      return next;
    });
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 1500);
  };

  const addPhoto = () => {
    Alert.alert("Add photo", undefined, [
      { text: "Take photo", onPress: () => pick("camera") },
      { text: "Choose from gallery", onPress: () => pick("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const pick = async (source: "camera" | "library") => {
    const IP = getImagePicker();
    if (!IP) return showToast("The photo picker isn't available", "error");
    const perm = source === "camera" ? await IP.requestCameraPermissionsAsync() : await IP.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return showToast(source === "camera" ? "Camera access is needed" : "Photo access is needed", "warning");
    const res =
      source === "camera"
        ? await IP.launchCameraAsync({ quality: 0.7 })
        : await IP.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsMultipleSelection: true, selectionLimit: 6 });
    if (res.canceled) return;
    for (const asset of res.assets) {
      setUploading((n) => n + 1);
      try {
        const ext = (asset.uri.split(".").pop() || "jpg").toLowerCase();
        const { url } = await api.uploadAssessmentPhoto(id, asset.uri, `assessment_${Date.now()}.${ext}`, ext === "png" ? "image/png" : "image/jpeg");
        const cur = latest.current as Form;
        update({ photoUrls: [...cur.photoUrls, url] });
      } catch (e: any) {
        showToast(e?.message || "A photo didn't upload", "error");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const removePhoto = (url: string) => {
    const cur = latest.current as Form;
    update({ photoUrls: cur.photoUrls.filter((u) => u !== url) });
  };

  const missing = form
    ? [
        !form.poolType && "pool type",
        !form.conditionRating && "overall condition",
        !form.findings.trim() && "what you found",
      ].filter(Boolean) as string[]
    : [];

  const outOfRange = form
    ? TESTS.filter((t) => {
        const v = num(form.tests[t.key] || "");
        return v != null && (v < t.min || v > t.max);
      })
    : [];

  const submit = () => {
    if (!form) return;
    if (missing.length || outOfRange.length) {
      setShowErrors(true);
      showToast(missing.length ? `Add ${missing.join(", ")}` : `Check ${outOfRange.map((t) => t.label).join(", ")}`, "warning");
      return;
    }
    Alert.alert("Submit report?", "The office will price it and follow up with the prospect. You can't edit it after this.", [
      { text: "Keep editing", style: "cancel" },
      {
        text: "Submit",
        onPress: async () => {
          setSubmitting(true);
          if (timer.current) clearTimeout(timer.current);
          try {
            await api.submitAssessment(id, toPayload(form));
            dirty.current = false;
            showToast("Report submitted", "success");
            router.replace(`/assessments/${id}` as any);
          } catch (e: any) {
            showToast(e?.message || "Couldn't submit. Your draft is saved.", "error");
          } finally {
            setSubmitting(false);
          }
        },
      },
    ]);
  };

  const vol = form ? volumeOf(form) : null;
  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft saved" : saveState === "error" ? "Not saved — offline?" : "";

  return (
    <View style={styles.container}>
      <ScreenHeader
        eyebrow="Assessment"
        title={a?.prospectName || "Report"}
        right={
          saveLabel ? (
            <View style={styles.savePill}>
              {saveState === "saving" ? <ActivityIndicator size="small" color={C.muted} /> : (
                <Ionicons name={saveState === "error" ? "cloud-offline-outline" : "checkmark-circle"} size={14} color={saveState === "error" ? C.warnInk : accent} />
              )}
              <Text style={[styles.saveText, saveState === "error" && { color: C.warnInk }]}>{saveLabel}</Text>
            </View>
          ) : null
        }
      />
      {!form ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <Text style={{ color: C.muted }}>Loading…</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {a?.locationAt ? (
              <Notice tone="accent" icon="location">
                Location pinned{a.address ? ` · ${a.address}` : ""}
              </Notice>
            ) : (
              <Notice tone="warn" icon="location-outline">
                No location pin — the office will use the address on file.
              </Notice>
            )}

            {/* 1 · Pool details */}
            <Section n={1} title="Pool details">
              <Label text="Pool type" error={showErrors && !form.poolType} />
              <Choices options={POOL_TYPES} value={form.poolType} onChange={(v) => update({ poolType: v })} />
              <Label text="Surface" />
              <Choices options={SURFACES} value={form.surfaceType} onChange={(v) => update({ surfaceType: v })} />
              <Label text="Water" />
              <Choices options={WATER} value={form.filtrationType} onChange={(v) => update({ filtrationType: v })} />
              <Label text="Size (length × width × average depth, metres)" />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {(["len", "wid", "dep"] as const).map((k, i) => [
                  i > 0 ? (
                    <Text key={`x${k}`} style={{ color: C.muted, fontSize: 16 }}>
                      ×
                    </Text>
                  ) : null,
                  <TextInput
                    key={k}
                    style={styles.dimInput}
                    value={form[k]}
                    onChangeText={(v) => update({ [k]: v } as any)}
                    keyboardType="decimal-pad"
                    placeholder={["Length", "Width", "Depth"][i]}
                    placeholderTextColor={C.faint}
                    accessibilityLabel={["Length in metres", "Width in metres", "Average depth in metres"][i]}
                  />,
                ])}
              </View>
              <Text style={styles.hint}>{vol ? `≈ ${vol.toLocaleString()} L — volume worked out for you` : "Volume is worked out from the size"}</Text>
            </Section>

            {/* 2 · Water test */}
            <Section n={2} title="Water test" note="Leave blank anything you didn't measure.">
              <View style={styles.grid}>
                {TESTS.map((t) => {
                  const v = num(form.tests[t.key] || "");
                  const bad = v != null && (v < t.min || v > t.max);
                  return (
                    <View key={t.key} style={styles.cell}>
                      <Text style={styles.cellLabel}>
                        {t.label}
                        {t.unit ? <Text style={{ color: C.faint, fontWeight: "400" }}> {t.unit}</Text> : null}
                      </Text>
                      <TextInput
                        style={[styles.cellInput, bad && { borderColor: C.danger }]}
                        value={form.tests[t.key]}
                        onChangeText={(val) => update({ tests: { ...form.tests, [t.key]: val } })}
                        keyboardType="decimal-pad"
                        placeholder="–"
                        placeholderTextColor={C.faint}
                        accessibilityLabel={t.label}
                      />
                      {bad ? <Text style={styles.cellErr}>{t.min}–{t.max}</Text> : null}
                    </View>
                  );
                })}
              </View>
            </Section>

            {/* 3 · Condition & equipment */}
            <Section n={3} title="Condition & equipment">
              <Label text="Overall condition" error={showErrors && !form.conditionRating} />
              <View style={{ flexDirection: "row", gap: 6 }}>
                {CONDITION.map((c) => {
                  const on = form.conditionRating === c.v;
                  return (
                    <TouchableOpacity
                      key={c.v}
                      onPress={() => update({ conditionRating: c.v })}
                      style={[styles.cond, on ? { backgroundColor: accent, borderColor: accent } : null]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${c.v}, ${c.l}`}
                    >
                      <Text style={[styles.condN, on && { color: "#ffffff" }]}>{c.v}</Text>
                      <Text style={[styles.condL, on && { color: "#ffffff" }]}>{c.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Field
                style={{ marginTop: 14 }}
                label="Equipment"
                placeholder="Pump, filter, heater, lights — what's there and how it runs"
                value={form.equipmentNotes}
                onChangeText={(v) => update({ equipmentNotes: v })}
                multiline
              />
            </Section>

            {/* 4 · Photos */}
            <Section n={4} title="Photos" note="Whole pool, water close-up, equipment, any damage.">
              <View style={styles.photos}>
                {form.photoUrls.map((u) => (
                  <View key={u}>
                    <PoolThumb uri={u} size={84} />
                    <TouchableOpacity style={styles.photoX} onPress={() => removePhoto(u)} accessibilityLabel="Remove photo" hitSlop={8}>
                      <Ionicons name="close" size={14} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {Array.from({ length: uploading }).map((_, i) => (
                  <View key={`u${i}`} style={[styles.addTile, { borderStyle: "solid" }]}>
                    <ActivityIndicator color={accent} />
                  </View>
                ))}
                <TouchableOpacity style={styles.addTile} onPress={addPhoto} accessibilityLabel="Add photo">
                  <Ionicons name="camera-outline" size={22} color={C.muted} />
                  <Text style={styles.addText}>Add</Text>
                </TouchableOpacity>
              </View>
            </Section>

            {/* 5 · Findings & recommendation */}
            <Section n={5} title="Findings & recommendation">
              <Field
                label="What you found"
                placeholder="Water colour, algae, debris, leaks, safety issues…"
                value={form.findings}
                onChangeText={(v) => update({ findings: v })}
                multiline
                error={showErrors && !form.findings.trim() ? "Tell the office what you found" : null}
              />
              <Label text="Recommended plan" />
              <Choices options={PLANS} value={form.recommendedPlan} onChange={(v) => update({ recommendedPlan: v })} />
              <Field
                style={{ marginTop: 14 }}
                label="Notes for the office"
                placeholder="First-visit work, repairs, anything the client asked for"
                value={form.recommendation}
                onChangeText={(v) => update({ recommendation: v })}
                multiline
              />
              <Text style={[styles.hint, { marginTop: 12 }]}>
                <Ionicons name="lock-closed-outline" size={12} color={C.muted} /> Pricing is done by the office from your report.
              </Text>
            </Section>
          </ScrollView>
          <Footer>
            <Button title="Submit report" icon="send" onPress={submit} loading={submitting} disabled={uploading > 0} />
          </Footer>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function Section({ n, title, note, children }: { n: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={styles.secTitle}>
        {n} · {title}
      </Text>
      {note ? <Text style={[styles.hint, { marginTop: 2 }]}>{note}</Text> : null}
      <Card padded style={{ marginTop: 10 }}>
        {children}
      </Card>
    </View>
  );
}

function Label({ text, error }: { text: string; error?: boolean }) {
  return (
    <Text style={[styles.label, error && { color: C.dangerInk }]}>
      {text}
      {error ? " — required" : ""}
    </Text>
  );
}

function Choices({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => (
        <Choice key={o} label={o} selected={value === o} onPress={() => onChange(value === o ? "" : o)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  savePill: { flexDirection: "row", alignItems: "center", gap: 4 },
  saveText: { fontSize: 12, color: C.muted, fontWeight: "500" },
  secTitle: { fontSize: 12, fontWeight: "600", letterSpacing: 0.7, textTransform: "uppercase", color: C.muted },
  label: { fontSize: 13, fontWeight: "600", color: C.ink, marginTop: 14, marginBottom: 8 },
  hint: { fontSize: 12, color: C.muted, marginTop: 8 },
  dimInput: { flex: 1, minWidth: 0, width: 0, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border, textAlign: "center", fontSize: 16, color: C.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  cell: { width: "33.33%", padding: 4 },
  cellLabel: { fontSize: 12, fontWeight: "600", color: C.ink, marginBottom: 4 },
  cellInput: { minWidth: 0, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.border, textAlign: "center", fontSize: 16, color: C.ink },
  cellErr: { fontSize: 11, color: C.dangerInk, marginTop: 2, textAlign: "center" },
  cond: { flex: 1, height: 58, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  condN: { fontSize: 17, fontWeight: "700", color: C.ink },
  condL: { fontSize: 11, color: C.muted, marginTop: 1 },
  photos: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoX: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(17,24,39,0.75)", alignItems: "center", justifyContent: "center" },
  addTile: { width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: C.border, alignItems: "center", justifyContent: "center", gap: 2 },
  addText: { fontSize: 12, color: C.muted, fontWeight: "600" },
});
