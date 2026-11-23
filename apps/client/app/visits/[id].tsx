import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/lib/api-client";
import { fixUrlForMobile } from "../../src/lib/network-utils";
import { useTheme } from "../../src/contexts/ThemeContext";

/*
 * Visit report: what a client sees after (and before) a visit.
 * Reads top to bottom as: what happened (hero + summary), is my water OK
 * (readings against the pool's own ranges), proof (photos), detail (work done,
 * chemicals), then the client's part (rate, get the PDF, flag a problem).
 */

const C = {
  bg: "#f9fafb",
  card: "#ffffff",
  ink: "#111827",
  body: "#374151",
  muted: "#6b7280",
  faint: "#9ca3af",
  line: "#f3f4f6",
  soft: "#f3f4f6",
  good: "#15803d",
  goodBg: "#dcfce7",
  warn: "#b45309",
  warnBg: "#fef3c7",
  bad: "#b91c1c",
  badBg: "#fee2e2",
  star: "#fbbf24",
};
const TZ_OPTS = { timeZone: "Africa/Accra" } as const;
const HERO_ART = require("../../assets/home-card.png");

type Status = "scheduled" | "in_progress" | "completed" | "cancelled";
type ReadingRow = { key: string; label: string; value: number; display: string; ok: boolean | null; min: number; max: number; unit: string };
type AiReport = { summary: string; sections: Array<{ title: string; body: string }>; recommendations: string[] };

interface Visit {
  id: string;
  status: Status;
  start: Date | null;
  end: Date | null;
  windowStart: Date | null;
  windowEnd: Date | null;
  pool: { name: string; address: string; photo: string | null };
  carer: { name: string; phone: string; photo: string | null } | null;
  readings: ReadingRow[];
  tasks: string[];
  chemicals: Array<{ name: string; qty: string }>;
  photos: Array<{ url: string; label: string }>;
  ai: AiReport | null;
  rating: number | null;
  review: { status: "in_review" | "accepted" | "disputed" | "resolved" | null; until: string | null; note: string | null; resolution: string | null };
}

const time = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", ...TZ_OPTS });
const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...TZ_OPTS });
const firstName = (n?: string | null) => (n || "").trim().split(/\s+/)[0] || "";

function toStatus(jobStatus?: string, completedAt?: string | null): Status {
  if (completedAt || jobStatus === "completed") return "completed";
  if (jobStatus === "cancelled") return "cancelled";
  if (jobStatus === "in_progress" || jobStatus === "on_site" || jobStatus === "en_route") return "in_progress";
  return "scheduled";
}

function tasksFrom(checklist: any): string[] {
  const raw = Array.isArray(checklist) ? checklist : checklist && typeof checklist === "object" ? Object.values(checklist) : [];
  return (raw as any[])
    .filter((i) => i && i.completed !== false && i.skipped !== true && i.notApplicable !== true)
    .map((i) => String(i.task || i.label || i.title || i.name || ""))
    .filter(Boolean);
}

function transform(data: any): Visit {
  const job = data.job || {};
  const pool = job.pool || {};
  const carer = job.assignedCarer;
  const photos = (data.photos || [])
    .map((p: any) => ({ url: fixUrlForMobile(p.url || p.imageUrl || p), label: String(p.label || "").replace(/^photo_/, "") }))
    .filter((p: any) => !!p.url);
  // Before photos first, then after, then the rest
  const rank = (l: string) => (l === "before" ? 0 : l === "after" ? 1 : 2);
  photos.sort((a: any, b: any) => rank(a.label) - rank(b.label));

  return {
    id: data.id,
    status: toStatus(job.status, data.completedAt),
    start: data.arrivedAt || data.startedAt ? new Date(data.arrivedAt || data.startedAt) : null,
    end: data.completedAt ? new Date(data.completedAt) : null,
    windowStart: job.windowStart ? new Date(job.windowStart) : null,
    windowEnd: job.windowEnd ? new Date(job.windowEnd) : null,
    pool: {
      name: pool.name || "Your pool",
      address: pool.address || "",
      photo: pool.photos?.[0]?.url || pool.photos?.[0] || pool.imageUrls?.[0] || null,
    },
    carer: carer ? { name: carer.name || "Your carer", phone: carer.phone || "", photo: carer.imageUrl || null } : null,
    readings: Array.isArray(data.readingsSummary) ? data.readingsSummary : [],
    tasks: tasksFrom(data.checklist),
    chemicals: (data.chemicals || [])
      .filter((c: any) => c?.chemical)
      .map((c: any) => ({ name: c.chemical, qty: c.qty != null ? `${c.qty}${c.unit ? ` ${c.unit}` : ""}` : "" })),
    photos,
    ai: data.aiReport && data.aiReport.summary ? data.aiReport : null,
    rating: data.rating ?? null,
    review: {
      status: data.reportStatus ?? null,
      until: data.reportReviewUntil ?? null,
      note: data.reportDisputeNote ?? null,
      resolution: data.reportDisputeResolution ?? null,
    },
  };
}

export default function VisitReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { themeColor } = useTheme();
  const { width } = useWindowDimensions();

  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showFull, setShowFull] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const [rating, setRating] = useState<number | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingMsg, setRatingMsg] = useState<string | null>(null);

  const [pdfState, setPdfState] = useState<{ busy: boolean; msg: string | null; ok: boolean }>({ busy: false, msg: null, ok: true });

  const [flagOpen, setFlagOpen] = useState(false);
  const [flagText, setFlagText] = useState("");
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      let data: any;
      try {
        data = await api.getVisit(id);
      } catch (e: any) {
        // Upcoming visits may only exist as a job so far
        if (/not found/i.test(e?.message || "")) {
          const job: any = await api.getJob(id);
          data = { id: job.id, job, readingsSummary: [] };
        } else {
          throw e;
        }
      }
      const v = transform(data);
      setVisit(v);
      setRating(v.rating);
    } catch (e: any) {
      if (/not found/i.test(e?.message || "")) setNotFound(true);
      else setError(e?.message || "Couldn't load this visit.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const rate = async (stars: number) => {
    if (!visit || ratingBusy) return;
    const previous = rating;
    setRating(stars);
    setRatingBusy(true);
    setRatingMsg(null);
    try {
      await api.reviewVisit(visit.id, { rating: stars });
      setRatingMsg("Thanks, your rating was saved.");
    } catch (e: any) {
      setRating(previous);
      setRatingMsg(e?.message || "Couldn't save your rating. Try again.");
    } finally {
      setRatingBusy(false);
    }
  };

  const emailPdf = async () => {
    if (!visit || pdfState.busy) return;
    setPdfState({ busy: true, msg: null, ok: true });
    try {
      const res = await api.emailVisitReport(visit.id);
      setPdfState({ busy: false, msg: `Sent to ${res.to}`, ok: true });
    } catch (e: any) {
      setPdfState({ busy: false, msg: e?.message || "Couldn't send the PDF. Try again.", ok: false });
    }
  };

  const submitFlag = async () => {
    if (!visit || flagBusy) return;
    const text = flagText.trim();
    if (!text) {
      setFlagError("Tell us what's wrong.");
      return;
    }
    setFlagBusy(true);
    setFlagError(null);
    try {
      await api.disputeVisitReport(visit.id, text);
      setVisit({ ...visit, review: { ...visit.review, status: "disputed", note: text } });
      setFlagText("");
      setFlagOpen(false);
    } catch (e: any) {
      setFlagError(e?.message || "Couldn't send. Try again.");
    } finally {
      setFlagBusy(false);
    }
  };

  const derived = useMemo(() => {
    if (!visit) return null;
    const off = visit.readings.filter((r) => r.ok === false);
    const mins = visit.start && visit.end ? Math.round((visit.end.getTime() - visit.start.getTime()) / 60000) : null;
    const when = visit.end || visit.windowStart;
    const span =
      visit.start && visit.end
        ? `${time(visit.start)}–${time(visit.end)}`
        : visit.windowStart && visit.windowEnd
        ? `${time(visit.windowStart)}–${time(visit.windowEnd)}`
        : visit.end
        ? time(visit.end)
        : "";
    const carerFirst = firstName(visit.carer?.name);
    const fallbackSummary =
      visit.status === "completed"
        ? [
            `${carerFirst || "Your carer"} serviced your pool${mins && mins > 0 ? ` in ${mins} minutes` : ""}.`,
            visit.readings.length
              ? off.length
                ? `${off.map((r) => r.label).join(" and ")} ${off.length > 1 ? "were" : "was"} outside the healthy range, so the water was treated.`
                : "All water readings were in the healthy range."
              : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "";
    const heroPhoto = visit.photos.find((p) => p.label === "after")?.url || visit.photos[0]?.url || visit.pool.photo || null;
    return { off, mins, when, span, carerFirst, fallbackSummary, heroPhoto };
  }, [visit]);

  // ── Loading / errors ─────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <TopBar />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
        </View>
      </SafeAreaView>
    );
  }
  if (notFound || error || !visit || !derived) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <TopBar />
        <View style={styles.center}>
          <View style={[styles.emptyIcon, { backgroundColor: themeColor + "14" }]}>
            <Ionicons name={notFound ? "document-text-outline" : "cloud-offline-outline"} size={30} color={themeColor} />
          </View>
          <Text style={styles.emptyTitle}>{notFound ? "Visit not found" : "Couldn't load this visit"}</Text>
          <Text style={styles.emptyBody}>
            {notFound ? "It may have been cancelled or moved." : error || "Check your connection and try again."}
          </Text>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColor }]} onPress={() => { setLoading(true); setNotFound(false); load(); }}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const done = visit.status === "completed";
  const summary = visit.ai?.summary?.trim() || derived.fallbackSummary;
  const hasMore = !!visit.ai && ((visit.ai.sections || []).length > 0 || (visit.ai.recommendations || []).length > 0);
  const shownTasks = showAllTasks ? visit.tasks : visit.tasks.slice(0, 5);
  const tile = (width - 32 - 10) / 2;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={themeColor} />}
      >
        {/* ── Hero ── */}
        <View style={styles.heroWrap}>
          <View style={styles.hero}>
            {derived.heroPhoto ? (
              <>
                <Image source={{ uri: derived.heroPhoto }} style={styles.fill} contentFit="cover" cachePolicy="disk" />
                <LinearGradient colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.25)", "rgba(0,0,0,0.72)"]} style={styles.fill} />
              </>
            ) : (
              <LinearGradient colors={[themeColor, themeColor + "cc"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
                <View style={styles.decor1} />
                <View style={styles.decor2} />
                <Image source={HERO_ART} style={styles.heroArt} contentFit="cover" />
              </LinearGradient>
            )}
            <View style={styles.heroBody}>
              <StatusPill visit={visit} off={derived.off.length} />
              <Text style={styles.heroTitle} numberOfLines={2}>{visit.pool.name}</Text>
              <Text style={styles.heroSub}>
                {[derived.when ? day(derived.when) : null, derived.span || null].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Carer ── */}
        {visit.carer && (
          <View style={[styles.card, styles.carerRow]}>
            {visit.carer.photo ? (
              <Image source={{ uri: fixUrlForMobile(visit.carer.photo) }} style={styles.avatar} contentFit="cover" cachePolicy="disk" />
            ) : (
              <View style={[styles.avatar, { backgroundColor: themeColor + "18" }]}>
                <Text style={[styles.avatarText, { color: themeColor }]}>
                  {visit.carer.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.carerLabel}>{done ? "Serviced by" : "Your carer"}</Text>
              <Text style={styles.carerName} numberOfLines={1}>{visit.carer.name}</Text>
            </View>
            {derived.mins && derived.mins > 0 && done ? (
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={13} color={C.muted} />
                <Text style={styles.metaChipText}>{derived.mins} min</Text>
              </View>
            ) : null}
            {!!visit.carer.phone && (
              <TouchableOpacity
                style={[styles.callBtn, { backgroundColor: themeColor + "14" }]}
                onPress={() => Linking.openURL(`tel:${visit.carer!.phone}`)}
                accessibilityLabel={`Call ${visit.carer.name}`}
              >
                <Ionicons name="call" size={16} color={themeColor} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Not done yet ── */}
        {!done && (
          <View style={[styles.card, styles.pending]}>
            <Ionicons
              name={visit.status === "in_progress" ? "water-outline" : visit.status === "cancelled" ? "close-circle-outline" : "calendar-outline"}
              size={22}
              color={visit.status === "cancelled" ? C.bad : themeColor}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.pendingTitle}>
                {visit.status === "in_progress" ? "Your pool is being serviced" : visit.status === "cancelled" ? "This visit was cancelled" : "Visit booked"}
              </Text>
              <Text style={styles.pendingBody}>
                {visit.status === "cancelled"
                  ? "Contact us if you'd like to rebook."
                  : "Your water readings, photos and a short report will appear here when the visit is done."}
              </Text>
            </View>
          </View>
        )}

        {/* ── Summary (AI report) ── */}
        {done && !!summary && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Summary</Text>
              {visit.ai && (
                <View style={[styles.tag, { backgroundColor: themeColor + "14" }]}>
                  <Ionicons name="sparkles" size={11} color={themeColor} />
                  <Text style={[styles.tagText, { color: themeColor }]}>Report</Text>
                </View>
              )}
            </View>
            <Text style={styles.summary}>{summary}</Text>

            {hasMore && showFull && (
              <View style={styles.full}>
                {(visit.ai!.sections || []).map((s, i) => (
                  <View key={i} style={{ marginBottom: 12 }}>
                    <Text style={styles.sectionTitle}>{s.title}</Text>
                    <Text style={styles.sectionBody}>{s.body}</Text>
                  </View>
                ))}
                {(visit.ai!.recommendations || []).length > 0 && (
                  <View>
                    <Text style={styles.sectionTitle}>Next steps</Text>
                    {visit.ai!.recommendations.map((r, i) => (
                      <View key={i} style={styles.recRow}>
                        <View style={[styles.recDot, { backgroundColor: themeColor }]} />
                        <Text style={styles.sectionBody}>{r}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            {hasMore && (
              <TouchableOpacity onPress={() => setShowFull((v) => !v)} style={styles.linkRow} hitSlop={8}>
                <Text style={[styles.link, { color: themeColor }]}>{showFull ? "Show less" : "Read the full report"}</Text>
                <Ionicons name={showFull ? "chevron-up" : "chevron-down"} size={15} color={themeColor} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Water ── */}
        {visit.readings.length > 0 && (
          <>
            <SectionTitle title="Water" note={derived.off.length ? `${derived.off.length} adjusted` : "All healthy"} />
            <View style={styles.tiles}>
              {visit.readings.slice(0, 6).map((r) => (
                <ReadingTile key={r.key} r={r} width={tile} />
              ))}
            </View>
          </>
        )}

        {/* ── Photos ── */}
        {visit.photos.length > 0 && (
          <>
            <SectionTitle title="Photos" note={`${visit.photos.length}`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {visit.photos.map((p, i) => (
                <Pressable key={i} onPress={() => setViewer(i)} style={styles.photo} accessibilityLabel={`Open ${p.label || "photo"} ${i + 1}`}>
                  <Image source={{ uri: p.url }} style={styles.fill} contentFit="cover" cachePolicy="disk" />
                  {!!p.label && (
                    <View style={styles.photoLabel}>
                      <Text style={styles.photoLabelText}>{p.label.toUpperCase()}</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Work done ── */}
        {done && visit.tasks.length > 0 && (
          <>
            <SectionTitle title="Work done" note={`${visit.tasks.length}`} />
            <View style={styles.card}>
              {shownTasks.map((t, i) => (
                <View key={i} style={[styles.taskRow, i > 0 && styles.hairline]}>
                  <View style={styles.tick}>
                    <Ionicons name="checkmark" size={13} color={C.good} />
                  </View>
                  <Text style={styles.taskText}>{t}</Text>
                </View>
              ))}
              {visit.tasks.length > 5 && (
                <TouchableOpacity onPress={() => setShowAllTasks((v) => !v)} style={[styles.linkRow, { marginTop: 8 }]} hitSlop={8}>
                  <Text style={[styles.link, { color: themeColor }]}>{showAllTasks ? "Show less" : `Show all ${visit.tasks.length}`}</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ── Chemicals ── */}
        {visit.chemicals.length > 0 && (
          <>
            <SectionTitle title="Chemicals added" />
            <View style={styles.card}>
              {visit.chemicals.map((c, i) => (
                <View key={i} style={[styles.chemRow, i > 0 && styles.hairline]}>
                  <Text style={styles.chemName}>{c.name}</Text>
                  <Text style={styles.chemQty}>{c.qty}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Your part ── */}
        {done && (
          <>
            <SectionTitle title="How did we do?" />
            <View style={[styles.card, { alignItems: "center" }]}>
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity key={n} onPress={() => rate(n)} disabled={ratingBusy} hitSlop={6} accessibilityLabel={`Rate ${n} star${n > 1 ? "s" : ""}`}>
                    <Ionicons name={rating && n <= rating ? "star" : "star-outline"} size={34} color={rating && n <= rating ? C.star : "#d1d5db"} />
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.rateHint}>
                {ratingMsg || (rating ? ["", "Poor", "Fair", "Good", "Great", "Excellent"][rating] + " · tap to change" : "Tap a star to rate this visit")}
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.card, styles.actionRow]}
              onPress={emailPdf}
              disabled={pdfState.busy}
              activeOpacity={0.8}
            >
              <View style={[styles.actionIcon, { backgroundColor: themeColor + "14" }]}>
                {pdfState.busy ? <ActivityIndicator size="small" color={themeColor} /> : <Ionicons name="mail-outline" size={18} color={themeColor} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>Email me the PDF</Text>
                <Text style={[styles.actionSub, pdfState.msg && !pdfState.ok && { color: C.bad }]}>
                  {pdfState.msg || "The full report with readings and photos"}
                </Text>
              </View>
              {pdfState.msg && pdfState.ok ? (
                <Ionicons name="checkmark-circle" size={20} color={C.good} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={C.faint} />
              )}
            </TouchableOpacity>

            <ReviewBlock
              visit={visit}
              themeColor={themeColor}
              onFlag={() => { setFlagError(null); setFlagOpen(true); }}
            />
          </>
        )}
      </ScrollView>

      {/* Photo viewer */}
      <Modal visible={viewer !== null} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          {viewer !== null && (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              contentOffset={{ x: viewer * width, y: 0 }}
            >
              {visit.photos.map((p, i) => (
                <View key={i} style={{ width, justifyContent: "center" }}>
                  <Image source={{ uri: p.url }} style={{ width, height: width * 1.2 }} contentFit="contain" />
                  {!!p.label && <Text style={styles.viewerLabel}>{p.label.toUpperCase()}</Text>}
                </View>
              ))}
            </ScrollView>
          )}
          <TouchableOpacity style={styles.viewerClose} onPress={() => setViewer(null)} accessibilityLabel="Close photo">
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Flag an inaccuracy */}
      <Modal visible={flagOpen} transparent animationType="slide" onRequestClose={() => setFlagOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Something looks wrong?</Text>
            <Text style={styles.sheetBody}>Tell us what in this report doesn't match what you saw. We'll look into it and reply in the app.</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g. the pH doesn't match my own test"
              placeholderTextColor={C.faint}
              multiline
              value={flagText}
              onChangeText={setFlagText}
              textAlignVertical="top"
            />
            {!!flagError && <Text style={styles.inputError}>{flagError}</Text>}
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setFlagOpen(false)}>
                <Text style={styles.secondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: themeColor, flex: 1 }]} onPress={submitFlag} disabled={flagBusy}>
                {flagBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────

function TopBar() {
  return (
    <View style={styles.topBar}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back" hitSlop={8}>
        <Ionicons name="arrow-back" size={20} color={C.ink} />
      </TouchableOpacity>
      <Text style={styles.topTitle}>Visit report</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function StatusPill({ visit, off }: { visit: Visit; off: number }) {
  let icon: any = "checkmark-circle";
  let label = "Done";
  if (visit.status === "completed") {
    if (visit.readings.length) {
      label = off ? "Done · water treated" : "Done · water healthy";
      icon = off ? "flask" : "checkmark-circle";
    }
  } else if (visit.status === "in_progress") {
    label = "In progress";
    icon = "water";
  } else if (visit.status === "cancelled") {
    label = "Cancelled";
    icon = "close-circle";
  } else {
    label = "Booked";
    icon = "calendar";
  }
  return (
    <View style={styles.heroPill}>
      <Ionicons name={icon} size={13} color="#fff" />
      <Text style={styles.heroPillText}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionHeadTitle}>{title}</Text>
      {!!note && <Text style={styles.sectionHeadNote}>{note}</Text>}
    </View>
  );
}

function ReadingTile({ r, width }: { r: ReadingRow; width: number }) {
  const hasRange = r.ok !== null;
  // Where the value sits on the healthy range (clamped so the marker stays visible)
  const span = r.max - r.min || 1;
  const pos = Math.min(1, Math.max(0, (r.value - (r.min - span * 0.5)) / (span * 2)));
  return (
    <View style={[styles.tile, { width }]}>
      <Text style={styles.tileLabel} numberOfLines={1}>{r.label}</Text>
      <Text style={styles.tileValue}>{r.display}</Text>
      {hasRange ? (
        <>
          <View style={styles.rangeTrack}>
            <View style={[styles.rangeBand, { backgroundColor: C.goodBg }]} />
            <View style={[styles.rangeMarker, { left: `${pos * 100}%`, backgroundColor: r.ok ? C.good : C.warn }]} />
          </View>
          <Text style={[styles.tileFoot, { color: r.ok ? C.good : C.warn }]}>
            {r.ok ? "In range" : "Adjusted"} · {r.min}–{r.max}
          </Text>
        </>
      ) : (
        <Text style={styles.tileFoot}>Measured</Text>
      )}
    </View>
  );
}

function ReviewBlock({ visit, themeColor, onFlag }: { visit: Visit; themeColor: string; onFlag: () => void }) {
  const r = visit.review;
  if (r.status === "disputed" || r.status === "resolved") {
    return (
      <View style={[styles.card, { backgroundColor: r.status === "resolved" ? "#f0fdf4" : "#fffbeb" }]}>
        <Text style={styles.reviewTitle}>{r.status === "resolved" ? "We've looked into it" : "You flagged this report"}</Text>
        {!!r.note && <Text style={styles.reviewBody}>"{r.note}"</Text>}
        <Text style={[styles.reviewBody, { marginTop: 6, color: C.muted }]}>
          {r.status === "resolved" ? r.resolution || "Resolved." : "We're looking into it and will reply in the app."}
        </Text>
      </View>
    );
  }
  if (r.status === "in_review") {
    const until = r.until ? new Date(r.until).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...TZ_OPTS }) : null;
    return (
      <TouchableOpacity onPress={onFlag} style={styles.flagRow} hitSlop={6}>
        <Ionicons name="flag-outline" size={15} color={C.muted} />
        <Text style={styles.flagText}>
          Something wrong? <Text style={{ color: themeColor, fontWeight: "700" }}>Let us know</Text>
          {until ? ` by ${until}` : ""}
        </Text>
      </TouchableOpacity>
    );
  }
  if (r.status === "accepted") {
    return (
      <View style={styles.flagRow}>
        <Ionicons name="shield-checkmark-outline" size={15} color={C.faint} />
        <Text style={styles.flagText}>Report accepted</Text>
      </View>
    );
  }
  return null;
}

// ── Styles ─────────────────────────────────────────────────────────

const lift = {
  shadowColor: "#111827",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 3,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  fill: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },

  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, alignItems: "center", justifyContent: "center", ...lift },
  topTitle: { fontSize: 17, fontWeight: "800", color: C.ink },

  heroWrap: { borderRadius: 22, marginTop: 6, marginBottom: 12, backgroundColor: C.card, ...lift, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  hero: { height: 200, borderRadius: 22, overflow: "hidden", justifyContent: "flex-end" },
  heroBody: { padding: 20 },
  heroPill: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "rgba(17,24,39,0.42)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 10 },
  heroPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  heroTitle: { color: "#fff", fontSize: 26, fontWeight: "800", letterSpacing: -0.4 },
  heroSub: { color: "rgba(255,255,255,0.9)", fontSize: 14, marginTop: 4, fontWeight: "500" },
  heroArt: { position: "absolute", right: -10, bottom: -10, width: 150, height: 150, opacity: 0.95, borderRadius: 20 },
  decor1: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.08)", top: -70, right: -50 },
  decor2: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.06)", bottom: -50, left: 40 },

  card: { backgroundColor: C.card, borderRadius: 20, padding: 16, marginBottom: 12, ...lift },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "800", color: C.ink },

  carerRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarText: { fontSize: 15, fontWeight: "800" },
  carerLabel: { fontSize: 12, color: C.muted, fontWeight: "600" },
  carerName: { fontSize: 16, color: C.ink, fontWeight: "800", marginTop: 1 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.soft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  metaChipText: { fontSize: 12, fontWeight: "700", color: C.body },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },

  pending: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  pendingTitle: { fontSize: 15, fontWeight: "800", color: C.ink },
  pendingBody: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 3 },

  tag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: 11, fontWeight: "800" },
  summary: { fontSize: 15.5, lineHeight: 24, color: C.ink },
  full: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: C.ink, marginBottom: 3 },
  sectionBody: { fontSize: 14, lineHeight: 21, color: C.body, flex: 1 },
  recRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 6 },
  recDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 12, alignSelf: "flex-start" },
  link: { fontSize: 14, fontWeight: "700" },

  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 12, marginBottom: 10, paddingHorizontal: 2 },
  sectionHeadTitle: { fontSize: 18, fontWeight: "800", color: C.ink },
  sectionHeadNote: { fontSize: 13, fontWeight: "600", color: C.muted },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  tile: { backgroundColor: C.card, borderRadius: 18, padding: 14, ...lift },
  tileLabel: { fontSize: 11, fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  tileValue: { fontSize: 24, fontWeight: "800", color: C.ink, marginTop: 4, letterSpacing: -0.4 },
  rangeTrack: { height: 6, borderRadius: 3, backgroundColor: C.soft, marginTop: 12, overflow: "visible" },
  rangeBand: { position: "absolute", left: "25%", width: "50%", top: 0, bottom: 0, borderRadius: 3 },
  rangeMarker: { position: "absolute", top: -3, width: 12, height: 12, marginLeft: -6, borderRadius: 6, borderWidth: 2, borderColor: "#fff" },
  tileFoot: { fontSize: 12, fontWeight: "700", color: C.muted, marginTop: 10 },

  photoRow: { gap: 10, paddingBottom: 14 },
  photo: { width: 150, height: 190, borderRadius: 18, overflow: "hidden", backgroundColor: C.soft },
  photoLabel: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(255,255,255,0.9)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  photoLabelText: { fontSize: 10, fontWeight: "800", color: C.ink, letterSpacing: 0.5 },

  taskRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  hairline: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#e5e7eb" },
  tick: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.goodBg, alignItems: "center", justifyContent: "center" },
  taskText: { flex: 1, fontSize: 15, color: C.body },
  chemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, gap: 12 },
  chemName: { flex: 1, fontSize: 15, color: C.body },
  chemQty: { fontSize: 15, fontWeight: "800", color: C.ink },

  stars: { flexDirection: "row", gap: 8, marginTop: 4 },
  rateHint: { fontSize: 13, color: C.muted, marginTop: 10, fontWeight: "600" },

  actionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 15, fontWeight: "800", color: C.ink },
  actionSub: { fontSize: 13, color: C.muted, marginTop: 2 },

  reviewTitle: { fontSize: 15, fontWeight: "800", color: C.ink, marginBottom: 6 },
  reviewBody: { fontSize: 14, color: C.body, lineHeight: 20 },
  flagRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  flagText: { fontSize: 13, color: C.muted },

  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: C.ink },
  emptyBody: { fontSize: 14, color: C.muted, textAlign: "center", lineHeight: 20, marginBottom: 8 },
  primaryBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14, backgroundColor: C.soft, alignItems: "center" },
  secondaryBtnText: { color: C.body, fontSize: 15, fontWeight: "700" },

  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center" },
  viewerLabel: { color: "#fff", textAlign: "center", marginTop: 12, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  viewerClose: { position: "absolute", top: 56, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },

  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 18 },
  sheetTitle: { fontSize: 19, fontWeight: "800", color: C.ink },
  sheetBody: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 6, marginBottom: 16 },
  input: { backgroundColor: C.bg, borderRadius: 14, padding: 14, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: "#e5e7eb", minHeight: 110 },
  inputError: { color: C.bad, fontSize: 13, marginTop: 8 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 16 },
});
