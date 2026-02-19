import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

interface HouseholdMember {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
}

interface Household {
  id: string;
  name: string;
  primaryClientId: string;
  members: HouseholdMember[];
}

export default function FamilyScreen() {
  const { themeColor } = useTheme();
  const [loading, setLoading] = useState(true);
  const [myClientId, setMyClientId] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const client = await api.getMyClientProfile() as any;
      if (!client?.id) return;
      setMyClientId(client.id);

      // Try to fetch existing household
      try {
        const hh = await api.getMyHousehold(client.id) as any;
        if (hh?.id) {
          setHousehold(normalizeHousehold(hh, client.id));
        }
      } catch {
        // No household yet
        setHousehold(null);
      }
    } catch (error) {
      console.error("Error loading family data:", error);
    } finally {
      setLoading(false);
    }
  };

  const normalizeHousehold = (raw: any, myClientId: string): Household => ({
    id: raw.id,
    name: raw.name || "My Household",
    primaryClientId: raw.primaryClientId,
    members: (raw.members || []).map((m: any) => ({
      id: m.id,
      name: m.name || "Member",
      email: m.email,
      phone: m.phone,
      isPrimary: m.id === raw.primaryClientId,
    })),
  });

  const handleCreateHousehold = async () => {
    if (!householdName.trim()) {
      Alert.alert("Error", "Please enter a household name.");
      return;
    }
    if (!myClientId) return;
    try {
      setSubmitting(true);
      const hh = await api.createHousehold(myClientId, householdName.trim()) as any;
      setHousehold(normalizeHousehold(hh, myClientId));
      setShowCreateModal(false);
      setHouseholdName("");
      Alert.alert("Created!", `"${householdName.trim()}" household is ready. Invite family members to join.`);
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to create household.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvite = async () => {
    if (!invitePhone.trim() && !inviteEmail.trim()) {
      Alert.alert("Error", "Please enter a phone number or email address.");
      return;
    }
    if (!myClientId) return;
    try {
      setSubmitting(true);
      await api.inviteToHousehold(myClientId, {
        name: inviteName.trim() || undefined,
        phone: invitePhone.trim() || undefined,
        email: inviteEmail.trim() || undefined,
      });
      setShowInviteModal(false);
      setInviteName("");
      setInvitePhone("");
      setInviteEmail("");
      Alert.alert("Invited!", "Your family member will receive an invitation to join your household.");
      // Reload to show updated member list
      await loadData();
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to send invite.");
    } finally {
      setSubmitting(false);
    }
  };

  const isPrimaryClient = household?.primaryClientId === myClientId;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family & Sharing</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={themeColor} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : !household ? (
        /* No household yet */
        <ScrollView contentContainerStyle={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: `${themeColor}15` }]}>
            <Ionicons name="people" size={48} color={themeColor} />
          </View>
          <Text style={styles.emptyTitle}>No Household Yet</Text>
          <Text style={styles.emptyText}>
            Create a household to share pool services, billing, and visit history with your family members.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: themeColor }]}
            onPress={() => setShowCreateModal(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Create Household</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        /* Household exists */
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Household card */}
          <View style={[styles.hhCard, { borderLeftColor: themeColor }]}>
            <View style={styles.hhCardRow}>
              <View style={[styles.hhIcon, { backgroundColor: `${themeColor}18` }]}>
                <Ionicons name="home" size={24} color={themeColor} />
              </View>
              <View style={styles.hhInfo}>
                <Text style={styles.hhName}>{household.name}</Text>
                <Text style={styles.hhSub}>{household.members.length} member{household.members.length !== 1 ? "s" : ""}</Text>
              </View>
            </View>
          </View>

          {/* Members list */}
          <Text style={styles.sectionTitle}>Members</Text>
          {household.members.map((member) => (
            <View key={member.id} style={styles.memberCard}>
              <View style={[styles.memberAvatar, { backgroundColor: `${themeColor}18` }]}>
                <Text style={[styles.memberAvatarText, { color: themeColor }]}>
                  {member.name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  {member.isPrimary && (
                    <View style={[styles.primaryBadge, { backgroundColor: `${themeColor}20` }]}>
                      <Text style={[styles.primaryBadgeText, { color: themeColor }]}>Primary</Text>
                    </View>
                  )}
                </View>
                {member.phone && <Text style={styles.memberContact}>{member.phone}</Text>}
                {member.email && <Text style={styles.memberContact}>{member.email}</Text>}
              </View>
            </View>
          ))}

          {/* Invite button */}
          {isPrimaryClient && (
            <TouchableOpacity
              style={[styles.inviteBtn, { borderColor: themeColor }]}
              onPress={() => setShowInviteModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={20} color={themeColor} />
              <Text style={[styles.inviteBtnText, { color: themeColor }]}>Invite Family Member</Text>
            </TouchableOpacity>
          )}

          {/* Sharing info */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={20} color={themeColor} />
            <Text style={styles.infoText}>
              Household members share pool maintenance history and can view upcoming visits. Billing is managed by the primary account holder.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Create Household Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Household</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalText}>Give your household a name so family members can recognise it.</Text>
              <Text style={styles.modalLabel}>Household Name</Text>
              <TextInput
                style={styles.modalInput}
                value={householdName}
                onChangeText={setHouseholdName}
                placeholder="e.g. The Smith Family"
                autoCapitalize="words"
                autoFocus
              />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: themeColor }, submitting && { opacity: 0.6 }]}
                onPress={handleCreateHousehold}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Invite Member Modal */}
      <Modal visible={showInviteModal} animationType="slide" transparent onRequestClose={() => setShowInviteModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Family Member</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalText}>Enter your family member's details. They'll be added to your household.</Text>
              <Text style={styles.modalLabel}>Name (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={inviteName}
                onChangeText={setInviteName}
                placeholder="Family member's name"
                autoCapitalize="words"
              />
              <Text style={styles.modalLabel}>Phone Number</Text>
              <TextInput
                style={styles.modalInput}
                value={invitePhone}
                onChangeText={setInvitePhone}
                placeholder="e.g. 0200000000"
                keyboardType="phone-pad"
              />
              <Text style={styles.modalLabel}>Email (Optional)</Text>
              <TextInput
                style={styles.modalInput}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="email@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowInviteModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: themeColor }, submitting && { opacity: 0.6 }]}
                onPress={handleInvite}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Send Invite</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#111827" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { fontSize: 15, color: "#6b7280", marginTop: 12 },

  // Empty state
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: "center", alignItems: "center", marginBottom: 24 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 12, textAlign: "center" },
  emptyText: { fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22, marginBottom: 32 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },

  // Household
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  hhCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  hhCardRow: { flexDirection: "row", alignItems: "center" },
  hhIcon: { width: 48, height: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", marginRight: 14 },
  hhInfo: { flex: 1 },
  hhName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  hhSub: { fontSize: 13, color: "#6b7280", marginTop: 2 },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  memberAvatarText: { fontSize: 16, fontWeight: "700" },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  memberName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  primaryBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  primaryBadgeText: { fontSize: 11, fontWeight: "700" },
  memberContact: { fontSize: 13, color: "#6b7280" },

  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  inviteBtnText: { fontSize: 15, fontWeight: "600" },

  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  infoText: { flex: 1, fontSize: 13, color: "#6b7280", lineHeight: 19 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%" },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalBody: { paddingHorizontal: 20, paddingVertical: 16 },
  modalText: { fontSize: 14, color: "#6b7280", marginBottom: 16, lineHeight: 20 },
  modalLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fafafa",
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  modalSave: { flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalSaveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
