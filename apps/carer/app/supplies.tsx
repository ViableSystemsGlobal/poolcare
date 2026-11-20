import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../src/lib/api-client";
import { useToast } from "../src/components/Toast";
import {
  C,
  Card,
  Row,
  Chip,
  Choice,
  Button,
  Field,
  TabHeader,
  Segmented,
  SectionHeader,
  EmptyState,
  PoolThumb,
  TAB_BAR_CLEARANCE,
  useAccent,
  dayLabel,
  fmtTime,
  localDateKey,
  shadow,
} from "../src/ui";

interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  uom: string;
  stockItems?: Array<{ available: number }>;
}

interface SupplyRequest {
  id: string;
  status: string;
  priority: string;
  items: Array<{ name: string; quantity: number; unit?: string }>;
  notes: string | null;
  requestedAt: string;
}

interface TodayJob {
  id: string;
  poolName: string;
  address: string;
  at: Date;
  imageUrl?: string;
}

type CartItem = { productId: string; name: string; quantity: number; unit: string };

const CATEGORIES = [
  { value: "chemicals", label: "Chemicals" },
  { value: "equipment", label: "Equipment" },
  { value: "tools", label: "Tools" },
  { value: "consumables", label: "Consumables" },
];

const REQUEST_STATUS: Record<string, { label: string; tone: "warn" | "accent" | "neutral" | "danger"; icon: any }> = {
  pending: { label: "Pending", tone: "warn", icon: "time-outline" },
  approved: { label: "Approved", tone: "accent", icon: "checkmark" },
  fulfilled: { label: "Delivered", tone: "neutral", icon: "checkmark-done" },
  rejected: { label: "Declined", tone: "danger", icon: "close" },
};

export default function SuppliesScreen() {
  const { accent, tint } = useAccent();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [tab, setTab] = useState<"request" | "history">("request");
  const [products, setProducts] = useState<Product[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [jobs, setJobs] = useState<TodayJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [forJob, setForJob] = useState<TodayJob | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchAll = useCallback(async () => {
    const [p, r, j]: any[] = await Promise.all([
      api.getProducts({ limit: 100, isActive: "true" }).catch(() => null),
      api.getSupplyRequests({ limit: 50 }).catch(() => null),
      api.getJobs({ date: localDateKey(new Date()) }).catch(() => null),
    ]);
    if (p) setProducts(p?.items || []);
    if (r) setRequests(r?.items || []);
    const jl: any[] = Array.isArray(j) ? j : j?.items || [];
    setJobs(
      jl
        .filter((x) => !["cancelled", "completed", "failed"].includes(x.status))
        .map((x) => ({
          id: x.id,
          poolName: x.pool?.name || "Pool visit",
          address: x.pool?.address || "",
          at: new Date(x.windowStart),
          imageUrl: x.pool?.imageUrls?.[0],
        })),
    );
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)) &&
        (!category || p.category === category),
    );
  }, [products, query, category]);

  const qty = (id: string) => cart.find((c) => c.productId === id)?.quantity || 0;
  const setQty = (p: Product, n: number) => {
    setCart((prev) => {
      if (n <= 0) return prev.filter((c) => c.productId !== p.id);
      const has = prev.find((c) => c.productId === p.id);
      if (has) return prev.map((c) => (c.productId === p.id ? { ...c, quantity: n } : c));
      return [...prev, { productId: p.id, name: p.name, quantity: n, unit: p.uom }];
    });
  };
  const stock = (p: Product) => p.stockItems?.reduce((s, i) => s + (i.available || 0), 0) ?? 0;
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const pending = requests.filter((r) => r.status === "pending").length;

  const submit = async () => {
    if (!cart.length) return;
    setSubmitting(true);
    try {
      const context = forJob ? `For job: ${forJob.poolName}${forJob.address ? ` at ${forJob.address}` : ""}` : "";
      await api.createSupplyRequest({
        items: cart.map((c) => ({ name: c.name, quantity: c.quantity, unit: c.unit })),
        priority: urgent ? "urgent" : "normal",
        notes: [context, notes.trim()].filter(Boolean).join("\n") || undefined,
      });
      showToast("Request sent to the store", "success");
      setCart([]);
      setNotes("");
      setUrgent(false);
      setForJob(null);
      setReviewOpen(false);
      setTab("history");
      fetchAll();
    } catch (e: any) {
      showToast(e?.message || "Couldn't send the request. Try again.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        fetchAll();
      }}
      tintColor={accent}
    />
  );

  return (
    <View style={styles.container}>
      <TabHeader eyebrow="Store" title="Supplies" />
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "request", label: "Request" },
            { value: "history", label: pending ? `My requests · ${pending}` : "My requests" },
          ]}
        />
      </View>

      {loading ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <Text style={{ color: C.muted }}>Loading…</Text>
        </View>
      ) : tab === "request" ? (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom + (cartCount ? 76 : 0) }}
          refreshControl={refresh}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* What is it for */}
          <SectionHeader title="Request for" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => setForJob(null)}
              style={[styles.forCard, !forJob ? { borderColor: accent, backgroundColor: tint } : null]}
              accessibilityState={{ selected: !forJob }}
            >
              <View style={[styles.forIcon, { backgroundColor: !forJob ? accent : C.bg }]}>
                <Ionicons name="cube-outline" size={18} color={!forJob ? "#ffffff" : C.muted} />
              </View>
              <Text style={styles.forTitle}>General stock</Text>
              <Text style={styles.forSub}>Not tied to a job</Text>
            </TouchableOpacity>
            {jobs.map((j) => {
              const on = forJob?.id === j.id;
              return (
                <TouchableOpacity
                  key={j.id}
                  onPress={() => setForJob(j)}
                  style={[styles.forCard, on ? { borderColor: accent, backgroundColor: tint } : null]}
                  accessibilityState={{ selected: on }}
                >
                  <PoolThumb uri={j.imageUrl} size={36} radius={10} />
                  <Text style={styles.forTitle} numberOfLines={1}>
                    {j.poolName}
                  </Text>
                  <Text style={styles.forSub}>
                    {dayLabel(j.at)} · {fmtTime(j.at)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <SectionHeader title="Catalogue" />
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={C.faint} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search chlorine, pH minus, brushes…"
              placeholderTextColor={C.faint}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={C.faint} />
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
            <Choice label="All" selected={!category} onPress={() => setCategory(null)} />
            {CATEGORIES.map((c) => (
              <Choice key={c.value} label={c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
            ))}
          </ScrollView>

          {filtered.length === 0 ? (
            <EmptyState icon="search-outline" title="No products found" body={query ? `Nothing matches “${query}”.` : "The store catalogue is empty."} />
          ) : (
            <Card>
              {filtered.map((p, i) => {
                const n = qty(p.id);
                const s = stock(p);
                return (
                  <Row key={p.id} first={i === 0}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.pName} numberOfLines={2}>
                        {p.name}
                      </Text>
                      <Text style={[styles.pMeta, s <= 0 && { color: C.warnInk }]}>
                        {s > 0 ? `${s} ${p.uom} in store` : "Out of stock — you can still request"}
                      </Text>
                    </View>
                    {n > 0 ? (
                      <View style={styles.stepper}>
                        <TouchableOpacity onPress={() => setQty(p, n - 1)} style={styles.stepBtn} accessibilityLabel={`Remove one ${p.name}`}>
                          <Ionicons name={n === 1 ? "trash-outline" : "remove"} size={18} color={C.ink} />
                        </TouchableOpacity>
                        <Text style={styles.stepNum}>{n}</Text>
                        <TouchableOpacity onPress={() => setQty(p, n + 1)} style={styles.stepBtn} accessibilityLabel={`Add one ${p.name}`}>
                          <Ionicons name="add" size={18} color={C.ink} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => setQty(p, 1)}
                        style={[styles.addBtn, { backgroundColor: tint }]}
                        accessibilityLabel={`Add ${p.name}`}
                      >
                        <Ionicons name="add" size={18} color={accent} />
                        <Text style={{ color: accent, fontWeight: "600", fontSize: 14 }}>Add</Text>
                      </TouchableOpacity>
                    )}
                  </Row>
                );
              })}
            </Card>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
          refreshControl={refresh}
          showsVerticalScrollIndicator={false}
        >
          {requests.length === 0 ? (
            <EmptyState icon="document-text-outline" title="No requests yet" body="Requests you send to the store show up here." action="Make a request" onAction={() => setTab("request")} />
          ) : (
            <Card>
              {requests.map((r, i) => {
                const st = REQUEST_STATUS[r.status] || { label: r.status, tone: "neutral" as const, icon: "help-outline" };
                return (
                  <Row key={r.id} first={i === 0} top>
                    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Chip label={st.label} tone={st.tone} icon={st.icon} />
                        {r.priority === "urgent" ? <Chip label="Urgent" tone="danger" /> : null}
                        <Text style={[styles.pMeta, { marginLeft: "auto", marginTop: 0 }]}>{dayLabel(r.requestedAt)}</Text>
                      </View>
                      <Text style={styles.reqItems}>
                        {r.items.map((it) => `${it.quantity} ${it.unit || "×"} ${it.name}`).join(" · ")}
                      </Text>
                      {r.notes ? (
                        <Text style={styles.pMeta} numberOfLines={2}>
                          {r.notes}
                        </Text>
                      ) : null}
                    </View>
                  </Row>
                );
              })}
            </Card>
          )}
        </ScrollView>
      )}

      {/* Cart bar, floating above the tab bar */}
      {tab === "request" && cartCount > 0 ? (
        <View style={[styles.cartBar, shadow, { bottom: Math.max(insets.bottom, 10) + 12 + 66 + 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cartTitle}>
              {cartCount} item{cartCount === 1 ? "" : "s"}
            </Text>
            <Text style={styles.cartSub} numberOfLines={1}>
              {forJob ? `For ${forJob.poolName}` : "General stock"}
            </Text>
          </View>
          <Button title="Review" size="md" iconRight="arrow-forward" onPress={() => setReviewOpen(true)} style={{ paddingHorizontal: 20 }} />
        </View>
      ) : null}

      {/* Review sheet */}
      <Modal visible={reviewOpen} animationType="slide" transparent onRequestClose={() => setReviewOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setReviewOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={styles.grabber} />
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Text style={styles.sheetTitle}>Review request</Text>
              <TouchableOpacity onPress={() => setReviewOpen(false)} accessibilityLabel="Close" hitSlop={10} style={{ marginLeft: "auto" }}>
                <Ionicons name="close" size={24} color={C.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.cartSub}>{forJob ? `For ${forJob.poolName}${forJob.address ? ` · ${forJob.address}` : ""}` : "General stock"}</Text>

            <ScrollView style={{ maxHeight: 260, marginTop: 12 }}>
              <Card style={{ backgroundColor: C.bg, shadowOpacity: 0, elevation: 0 }}>
                {cart.map((c, i) => {
                  const p = products.find((x) => x.id === c.productId);
                  return (
                    <Row key={c.productId} first={i === 0}>
                      <Text style={[styles.pName, { flex: 1 }]} numberOfLines={2}>
                        {c.name}
                      </Text>
                      <View style={styles.stepper}>
                        <TouchableOpacity onPress={() => p && setQty(p, c.quantity - 1)} style={[styles.stepBtn, { backgroundColor: C.card }]} accessibilityLabel={`Remove one ${c.name}`}>
                          <Ionicons name={c.quantity === 1 ? "trash-outline" : "remove"} size={18} color={C.ink} />
                        </TouchableOpacity>
                        <Text style={styles.stepNum}>{c.quantity}</Text>
                        <TouchableOpacity onPress={() => p && setQty(p, c.quantity + 1)} style={[styles.stepBtn, { backgroundColor: C.card }]} accessibilityLabel={`Add one ${c.name}`}>
                          <Ionicons name="add" size={18} color={C.ink} />
                        </TouchableOpacity>
                      </View>
                    </Row>
                  );
                })}
              </Card>
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <Choice label="Normal" selected={!urgent} onPress={() => setUrgent(false)} />
              <Choice label="Urgent — needed today" selected={urgent} onPress={() => setUrgent(true)} />
            </View>
            <Field
              style={{ marginTop: 12 }}
              placeholder="Note for the store (optional)"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <Button
              title={cart.length ? "Send request" : "Nothing to send"}
              onPress={submit}
              loading={submitting}
              disabled={!cart.length}
              style={{ marginTop: 16 }}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  forCard: { width: 148, padding: 12, borderRadius: 16, backgroundColor: C.card, borderWidth: 1.5, borderColor: "transparent", gap: 4 },
  forIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  forTitle: { fontSize: 14, fontWeight: "600", color: C.ink, marginTop: 6 },
  forSub: { fontSize: 12, color: C.muted },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 48, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 0 },
  pName: { fontSize: 15, fontWeight: "600", color: C.ink },
  pMeta: { fontSize: 13, color: C.muted, marginTop: 2 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, height: 40, paddingHorizontal: 14, borderRadius: 12 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  stepNum: { minWidth: 22, textAlign: "center", fontSize: 16, fontWeight: "700", color: C.ink },
  reqItems: { fontSize: 14, color: C.ink, lineHeight: 20 },
  cartBar: { position: "absolute", left: 14, right: 14, backgroundColor: C.card, borderRadius: 20, padding: 10, paddingLeft: 18, flexDirection: "row", alignItems: "center", gap: 12 },
  cartTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  cartSub: { fontSize: 13, color: C.muted },
  overlay: { flex: 1, backgroundColor: "rgba(16,35,26,0.35)" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
});
