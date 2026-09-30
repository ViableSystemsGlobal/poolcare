import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api-client";

interface StockItem {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  lowAt: number | null;
  movements?: Array<{ id: string; type: string; qty: number; createdAt: string }>;
}

const ENTRY_UNITS = ["kg", "g", "L", "ml", "pcs"];
const baseUnit = (u: string) => (u === "g" ? "kg" : u === "ml" ? "L" : u);
const fmtQty = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Chemicals the client keeps at the pool (service agreement cl. 7.1). The
 * client records purchases and corrects counts; visits draw it down; a low
 * level triggers a restock reminder.
 */
export default function ChemicalStockCard({ poolId, themeColor }: { poolId: string; themeColor: string }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [rates, setRates] = useState<Array<{ key: string; label: string; unit: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [saving, setSaving] = useState(false);
  // add form
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const [lowAt, setLowAt] = useState("");
  // edit form
  const [count, setCount] = useState("");
  const [editLow, setEditLow] = useState("");

  const load = () =>
    api
      .getChemicalStock(poolId)
      .then((d: any) => setItems(d || []))
      .catch(() => undefined)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.getChemicalRates().then(setRates).catch(() => undefined);
  }, [poolId]);

  const existing = items.find((i) => i.name.toLowerCase() === name.trim().toLowerCase());

  const saveAdd = async () => {
    setSaving(true);
    try {
      await api.addChemicalStock(poolId, {
        name: name.trim(),
        unit,
        qty: parseFloat(qty),
        lowAt: !existing && lowAt ? parseFloat(lowAt) : undefined,
      });
      setAdding(false);
      setName("");
      setQty("");
      setLowAt("");
      load();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.adjustChemicalStock(poolId, editing.id, {
        onHand: count === "" ? undefined : parseFloat(count),
        lowAt: editLow === "" ? null : parseFloat(editLow),
      });
      setEditing(null);
      load();
    } catch (e: any) {
      Alert.alert("Couldn't save", e?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const remove = (item: StockItem) =>
    Alert.alert(`Remove ${item.name}?`, "It will no longer be tracked.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await api.removeChemicalStock(poolId, item.id).catch(() => undefined);
          setEditing(null);
          load();
        },
      },
    ]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>My chemicals</Text>
        <TouchableOpacity onPress={() => setAdding(true)}>
          <Text style={[styles.link, { color: themeColor }]}>Add purchase</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={themeColor} />
      ) : items.length === 0 ? (
        <Text style={styles.muted}>
          Keep track of the chemicals you store at the pool. Our carers use them on each visit and we&apos;ll remind you
          when something runs low.
        </Text>
      ) : (
        items.map((item, i) => {
          const low = item.lowAt != null && item.onHand <= item.lowAt;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, i < items.length - 1 && styles.rowBorder]}
              onPress={() => {
                setEditing(item);
                setCount(fmtQty(item.onHand));
                setEditLow(item.lowAt != null ? fmtQty(item.lowAt) : "");
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.lowAt != null && <Text style={styles.sub}>Remind me at {fmtQty(item.lowAt)} {item.unit}</Text>}
              </View>
              <Text style={[styles.qty, low && { color: item.onHand === 0 ? "#dc2626" : "#d97706" }]}>
                {fmtQty(item.onHand)} {item.unit}
              </Text>
              {low && <Text style={[styles.badge, { color: item.onHand === 0 ? "#dc2626" : "#d97706" }]}>{item.onHand === 0 ? "Out" : "Low"}</Text>}
            </TouchableOpacity>
          );
        })
      )}

      {/* Add purchase */}
      <Modal visible={adding} animationType="slide" onRequestClose={() => setAdding(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add purchase</Text>
            <TouchableOpacity onPress={() => setAdding(false)}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Chemical</Text>
            <View style={styles.chips}>
              {Array.from(new Set([...items.map((i) => i.name), ...rates.map((r) => r.label)])).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chip, name === n && { backgroundColor: themeColor, borderColor: themeColor }]}
                  onPress={() => {
                    setName(n);
                    const it = items.find((i) => i.name === n);
                    const rate = rates.find((r) => r.label === n);
                    setUnit(it?.unit || rate?.unit || "kg");
                  }}
                >
                  <Text style={[styles.chipText, name === n && { color: "#fff" }]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="Or type the chemical name"
              placeholderTextColor="#9ca3af"
              value={name}
              onChangeText={setName}
            />
            <Text style={styles.label}>How much did you get?</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                value={qty}
                onChangeText={setQty}
              />
            </View>
            <View style={styles.chips}>
              {ENTRY_UNITS.filter((u) => !existing || baseUnit(u) === existing.unit).map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.chip, unit === u && { backgroundColor: themeColor, borderColor: themeColor }]}
                  onPress={() => setUnit(u)}
                >
                  <Text style={[styles.chipText, unit === u && { color: "#fff" }]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {!existing && (
              <>
                <Text style={styles.label}>Remind me when it gets down to ({baseUnit(unit)}, optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 1"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                  value={lowAt}
                  onChangeText={setLowAt}
                />
              </>
            )}
            <TouchableOpacity
              style={[styles.save, { backgroundColor: themeColor }, (!name.trim() || !(parseFloat(qty) > 0) || saving) && { opacity: 0.5 }]}
              disabled={!name.trim() || !(parseFloat(qty) > 0) || saving}
              onPress={saveAdd}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Edit item */}
      <Modal visible={!!editing} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing?.name}</Text>
            <TouchableOpacity onPress={() => setEditing(null)}>
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Amount you have now ({editing?.unit})</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={count} onChangeText={setCount} />
            <Text style={styles.label}>Remind me when it gets down to ({editing?.unit})</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="No reminder"
              placeholderTextColor="#9ca3af"
              value={editLow}
              onChangeText={setEditLow}
            />
            {!!editing?.movements?.length && (
              <>
                <Text style={styles.label}>Recent changes</Text>
                {editing.movements.map((m) => (
                  <Text key={m.id} style={styles.sub}>
                    {new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ·{" "}
                    {m.type === "used" ? "Used on a visit" : m.type === "added" ? "Added" : "Count corrected"} ·{" "}
                    {m.qty > 0 ? "+" : ""}
                    {fmtQty(m.qty)} {editing.unit}
                  </Text>
                ))}
              </>
            )}
            <TouchableOpacity style={[styles.save, { backgroundColor: themeColor }]} onPress={saveEdit} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save</Text>}
            </TouchableOpacity>
            {editing && (
              <TouchableOpacity onPress={() => remove(editing)} style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ color: "#dc2626", fontWeight: "600" }}>Stop tracking this chemical</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  link: { fontSize: 15, fontWeight: "600" },
  muted: { fontSize: 14, color: "#6b7280", lineHeight: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  itemName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  sub: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  qty: { fontSize: 15, color: "#111827", fontWeight: "600" },
  badge: { fontSize: 12, fontWeight: "700" },
  modal: { flex: 1, backgroundColor: "#fff", paddingTop: 50 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  label: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginTop: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#e5e7eb" },
  chipText: { fontSize: 14, color: "#374151", fontWeight: "500" },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 12, fontSize: 15, color: "#111827" },
  save: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
