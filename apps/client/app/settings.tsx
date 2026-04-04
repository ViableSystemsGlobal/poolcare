import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Share,
  Linking,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface ClientProfile {
  clientId: string | null;
  name: string;
  email: string;
  phone: string;
  imageUrl: string | null;
  organization: string;
}

interface NotificationPreferences {
  serviceReminders: boolean;
  paymentReminders: boolean;
  visitUpdates: boolean;
  promotions: boolean;
}

export default function SettingsScreen() {
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<ClientProfile>({
    clientId: null, name: "", email: "", phone: "", imageUrl: null, organization: "",
  });
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [notifications, setNotifications] = useState<NotificationPreferences>({
    serviceReminders: true,
    paymentReminders: true,
    visitUpdates: true,
    promotions: false,
  });

  const [nextVisitBackgroundImage, setNextVisitBackgroundImage] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
    AsyncStorage.getItem("nextVisitBackgroundImage")
      .then((v) => { if (v) setNextVisitBackgroundImage(v); })
      .catch(() => {});
  }, []);

  const loadProfile = async () => {
    try {
      setLoadingProfile(true);
      const stored = await api.getStoredUser();
      if (stored?.name) {
        setProfile((p) => ({ ...p, name: stored.name || p.name, email: stored.email || p.email, phone: stored.phone || p.phone }));
      }
      const [meRes, clientRes] = await Promise.allSettled([
        api.getMe() as Promise<any>,
        api.getMyClientProfile() as Promise<any>,
      ]);
      const me = meRes.status === "fulfilled" ? meRes.value : null;
      const client = clientRes.status === "fulfilled" ? clientRes.value : null;
      setProfile({
        clientId: client?.id || null,
        name: client?.name || me?.user?.name || stored?.name || "",
        email: client?.email || me?.user?.email || stored?.email || "",
        phone: client?.phone || me?.user?.phone || stored?.phone || "",
        imageUrl: client?.imageUrl || null,
        organization: me?.org?.name || "",
      });
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleChangePhoto = () => {
    Alert.alert("Profile Photo", "Choose an option", [
      { text: "Take Photo", onPress: () => pickImage("camera") },
      { text: "Choose from Gallery", onPress: () => pickImage("library") },
      ...(profile.imageUrl ? [{ text: "Remove Photo", style: "destructive" as const, onPress: handleRemovePhoto }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const pickImage = async (source: "camera" | "library") => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission Required", "Camera access is needed."); return; }
        result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") { Alert.alert("Permission Required", "Photo library access is needed."); return; }
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      }
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
        const mimeType = ext === "png" ? "image/png" : "image/jpeg";
        const fileName = `profile_${Date.now()}.${ext}`;
        setUploadingPhoto(true);
        try {
          const { imageUrl } = await api.uploadMyClientPhoto(uri, fileName, mimeType);
          setProfile((p) => ({ ...p, imageUrl }));
          Alert.alert("Success", "Profile photo updated!");
        } catch (error: any) {
          Alert.alert("Error", error.message || "Failed to upload photo.");
        } finally {
          setUploadingPhoto(false);
        }
      }
    } catch {
      Alert.alert("Error", "Failed to open camera or gallery.");
    }
  };

  const handleRemovePhoto = async () => {
    try {
      setUploadingPhoto(true);
      await api.updateMyClientProfile({ imageUrl: "" });
      setProfile((p) => ({ ...p, imageUrl: null }));
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to remove photo.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleOpenEditModal = () => {
    setEditName(profile.name);
    setEditEmail(profile.email);
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { Alert.alert("Error", "Name cannot be empty."); return; }
    try {
      setSavingProfile(true);
      await api.updateMyClientProfile({ name: editName.trim(), email: editEmail.trim() || undefined });
      setProfile((p) => ({ ...p, name: editName.trim(), email: editEmail.trim() || p.email }));
      await api.updateStoredUser({ name: editName.trim() });
      setShowEditModal(false);
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (error: any) {
      Alert.alert("Error", error.message || "Failed to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangeNextVisitBackground = async () => {
    Alert.alert("Next Visit Card Background", "Choose an option", [
      {
        text: "Choose from Gallery",
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") { Alert.alert("Permission Required", "We need access to your photos."); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 0.8 });
          if (!result.canceled && result.assets[0]) {
            await AsyncStorage.setItem("nextVisitBackgroundImage", result.assets[0].uri);
            setNextVisitBackgroundImage(result.assets[0].uri);
            Alert.alert("Success", "Background image updated!");
          }
        },
      },
      {
        text: "Use Default",
        onPress: async () => {
          await AsyncStorage.removeItem("nextVisitBackgroundImage");
          setNextVisitBackgroundImage(null);
          Alert.alert("Success", "Background reset to default!");
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleDownloadReports = () => {
    Alert.alert("Download Reports", "Choose a report to export", [
      {
        text: "Visit History",
        onPress: async () => {
          try {
            const visits = (await api.getVisits()) as any[];
            if (!visits || visits.length === 0) {
              Alert.alert("No Data", "No visit history found.");
              return;
            }
            const header = "Date,Pool,Status,Carer,Notes";
            const rows = visits.map((v: any) => {
              const date = v.date || v.scheduledDate || v.createdAt || "";
              const pool = (v.pool?.name || v.poolName || v.poolId || "").replace(/,/g, " ");
              const status = v.status || "";
              const carer = (v.carer?.name || v.carerName || "").replace(/,/g, " ");
              const notes = (v.notes || v.summary || "").replace(/,/g, " ").replace(/\n/g, " ");
              return `${date},${pool},${status},${carer},${notes}`;
            });
            const csv = [header, ...rows].join("\n");
            await Share.share({ message: csv, title: "Visit History Report" });
          } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to load visit history.");
          }
        },
      },
      {
        text: "Invoices",
        onPress: async () => {
          try {
            const invoices = (await api.getInvoices()) as any[];
            if (!invoices || invoices.length === 0) {
              Alert.alert("No Data", "No invoices found.");
              return;
            }
            const header = "Invoice #,Date,Amount,Status,Due Date";
            const rows = invoices.map((inv: any) => {
              const number = inv.invoiceNumber || inv.number || inv.id || "";
              const date = inv.date || inv.createdAt || "";
              const amount = inv.total ?? inv.amount ?? "";
              const status = inv.status || "";
              const due = inv.dueDate || "";
              return `${number},${date},${amount},${status},${due}`;
            });
            const csv = [header, ...rows].join("\n");
            await Share.share({ message: csv, title: "Invoices Report" });
          } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to load invoices.");
          }
        },
      },
      {
        text: "Payments",
        onPress: async () => {
          try {
            const invoices = (await api.getInvoices({ status: "paid" })) as any[];
            if (!invoices || invoices.length === 0) {
              Alert.alert("No Data", "No payment records found.");
              return;
            }
            const header = "Invoice #,Date Paid,Amount,Payment Method";
            const rows = invoices.map((inv: any) => {
              const number = inv.invoiceNumber || inv.number || inv.id || "";
              const datePaid = inv.paidAt || inv.updatedAt || inv.date || "";
              const amount = inv.total ?? inv.amount ?? "";
              const method = (inv.paymentMethod || inv.method || "").replace(/,/g, " ");
              return `${number},${datePaid},${amount},${method}`;
            });
            const csv = [header, ...rows].join("\n");
            await Share.share({ message: csv, title: "Payments Report" });
          } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to load payment history.");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const handleLogout = () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => { await api.logout(); router.replace("/(auth)/login"); } },
    ]);
  };

  const initials = profile.name
    ? profile.name.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  // ── Reusable row ──────────────────────────────────────────────────────────
  const MenuRow = ({
    icon, label, subtitle, onPress, right, danger = false, last = false,
  }: {
    icon: string; label: string; subtitle?: string;
    onPress?: () => void; right?: React.ReactNode; danger?: boolean; last?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.menuRow, !last && styles.menuRowBorder]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.menuIconBox, { backgroundColor: danger ? "#fee2e2" : themeColor + "15" }]}>
        <Ionicons name={icon as any} size={19} color={danger ? "#ef4444" : themeColor} />
      </View>
      <View style={styles.menuRowBody}>
        <Text style={[styles.menuLabel, danger && { color: "#ef4444" }]}>{label}</Text>
        {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Ionicons name="chevron-forward" size={16} color="#d1d5db" /> : null}
    </TouchableOpacity>
  );

  const HERO_HEIGHT = 240 + insets.top;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Banner ── */}
        <View style={[styles.hero, { height: HERO_HEIGHT, backgroundColor: themeColor }]}>
          {/* Decorative circles */}
          <View style={[styles.heroCircle1, { backgroundColor: "rgba(255,255,255,0.07)" }]} />
          <View style={[styles.heroCircle2, { backgroundColor: "rgba(255,255,255,0.05)" }]} />

          {/* Floating nav */}
          <View style={[styles.heroNav, { top: insets.top + 8 }]}>
            <TouchableOpacity
              style={styles.heroNavBtn}
              onPress={() => router.canGoBack() ? router.back() : router.replace("/")}
              activeOpacity={0.8}
            >
              <Ionicons name="arrow-back" size={20} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.heroNavTitle}>Account</Text>
            <TouchableOpacity style={styles.heroNavBtn} onPress={handleOpenEditModal} activeOpacity={0.8}>
              <Ionicons name="pencil-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.heroAvatarArea}>
            <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.85} style={styles.avatarWrap}>
              {uploadingPhoto ? (
                <View style={styles.avatar}>
                  <ActivityIndicator color={themeColor} />
                </View>
              ) : profile.imageUrl ? (
                <Image source={{ uri: profile.imageUrl }} style={styles.avatar} contentFit="cover" cachePolicy="disk" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: themeColor + "cc" }]}>
                  {loadingProfile
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.avatarInitials}>{initials}</Text>
                  }
                </View>
              )}
              <View style={[styles.cameraBadge, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
                <Ionicons name="camera" size={11} color="#fff" />
              </View>
            </TouchableOpacity>

            <Text style={styles.heroName}>{profile.name || "Your Account"}</Text>
            <Text style={styles.heroSub}>
              {profile.email || profile.phone || ""}
            </Text>
            {!!profile.organization && (
              <View style={styles.orgChip}>
                <Ionicons name="business-outline" size={11} color="rgba(255,255,255,0.85)" />
                <Text style={styles.orgChipText}>{profile.organization}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Quick links card — overlaps hero ── */}
        <View style={styles.quickCard}>
          {([
            { icon: "document-text-outline", label: "Billing", route: "/billing" },
            { icon: "layers-outline",        label: "Plans",   route: "/my-subscriptions" },
            { icon: "card-outline",          label: "Payment", route: "/payment-methods" },
            { icon: "people-outline",        label: "Family",  route: "/family" },
          ] as const).map((item, i, arr) => (
            <TouchableOpacity
              key={i}
              style={[styles.quickItem, i < arr.length - 1 && styles.quickItemBorder]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickIconBox, { backgroundColor: themeColor + "15" }]}>
                <Ionicons name={item.icon} size={21} color={themeColor} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="person-outline" label="Profile Information" subtitle={profile.phone || profile.email} onPress={handleOpenEditModal} />
          <MenuRow icon="people-outline" label="Family & Sharing" subtitle="Manage household members" onPress={() => router.push("/family")} />
          <MenuRow icon="card-outline" label="Payment Methods" onPress={() => router.push("/payment-methods")} />
          <MenuRow icon="document-text-outline" label="Billing & Invoices" onPress={() => router.push("/billing")} />
          <MenuRow icon="layers-outline" label="My Subscriptions" onPress={() => router.push("/my-subscriptions")} last />
        </View>

        {/* ── Notifications ── */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.menuCard}>
          {(["serviceReminders", "paymentReminders", "visitUpdates", "promotions"] as const).map((key, i, arr) => {
            const meta: Record<string, [string, string]> = {
              serviceReminders: ["calendar-outline",      "Service Reminders"],
              paymentReminders: ["cash-outline",          "Payment Reminders"],
              visitUpdates:     ["notifications-outline", "Visit Updates"],
              promotions:       ["megaphone-outline",     "Promotions & Offers"],
            };
            const [icon, label] = meta[key];
            return (
              <MenuRow
                key={key}
                icon={icon}
                label={label}
                last={i === arr.length - 1}
                right={
                  <Switch
                    value={notifications[key]}
                    onValueChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))}
                    trackColor={{ false: "#d1d5db", true: themeColor }}
                    thumbColor="#ffffff"
                    ios_backgroundColor="#d1d5db"
                  />
                }
              />
            );
          })}
        </View>

        {/* ── Preferences ── */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.menuCard}>
          <MenuRow
            icon="image-outline"
            label="Visit Card Background"
            subtitle={nextVisitBackgroundImage ? "Custom image set" : "Using default"}
            onPress={handleChangeNextVisitBackground}
          />
          <MenuRow
            icon="download-outline"
            label="Download Reports"
            onPress={handleDownloadReports}
            last
          />
        </View>

        {/* ── Support & Legal ── */}
        <Text style={styles.sectionLabel}>Support & Legal</Text>
        <View style={styles.menuCard}>
          <MenuRow icon="help-circle-outline" label="Help Center" onPress={() => Linking.openURL("https://poolcare.africa")} />
          <MenuRow icon="chatbubbles-outline" label="Contact Support" onPress={() => Alert.alert("Contact Support", "How would you like to reach us?", [
            { text: "Call", onPress: () => Linking.openURL("tel:+233506226222") },
            { text: "Email", onPress: () => Linking.openURL("mailto:info@poolcare.africa") },
            { text: "Cancel", style: "cancel" },
          ])} />
          <MenuRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => Linking.openURL("https://poolcare.africa/privacy-policy/")} />
          <MenuRow icon="document-outline" label="Terms of Service" onPress={() => Linking.openURL("https://poolcare.africa/terms-and-conditions/")} last />
        </View>

        {/* ── Logout ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#ef4444" />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>PoolCare v1.0.0</Text>
      </ScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalLabel}>Display Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="Your full name"
                autoCapitalize="words"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.modalLabel}>Email</Text>
              <TextInput
                style={styles.modalInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9ca3af"
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowEditModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, { backgroundColor: themeColor }, savingProfile && { opacity: 0.6 }]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalSaveText}>Save Changes</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { flex: 1 },

  // ── Hero ──
  hero: {
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  heroCircle1: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -80,
    right: -60,
  },
  heroCircle2: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    bottom: -40,
    left: -40,
  },
  heroNav: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  heroNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroNavTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
  heroAvatarArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 28,
  },
  avatarWrap: { position: "relative", marginBottom: 12 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarFallback: {},
  avatarInitials: { fontSize: 30, fontWeight: "800", color: "#fff" },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  heroName: { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.3, marginBottom: 3 },
  heroSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", marginBottom: 8 },
  orgChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  orgChipText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.9)" },

  // ── Quick card ──
  quickCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: -22,
    borderRadius: 18,
    padding: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    marginBottom: 24,
  },
  quickItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    gap: 7,
  },
  quickItemBorder: {
    borderRightWidth: 1,
    borderRightColor: "#f3f4f6",
  },
  quickIconBox: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: { fontSize: 11, fontWeight: "700", color: "#374151" },

  // ── Section label ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginHorizontal: 24,
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Menu card ──
  menuCard: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  menuIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  menuRowBody: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: "500", color: "#111827" },
  menuSub: { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  // ── Logout ──
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  logoutText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  version: { textAlign: "center", fontSize: 11, color: "#d1d5db", marginBottom: 8 },

  // ── Edit modal ──
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    paddingBottom: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalBody: { paddingHorizontal: 20, paddingTop: 8 },
  modalLabel: { fontSize: 12, fontWeight: "700", color: "#6b7280", marginBottom: 6, marginTop: 16, textTransform: "uppercase", letterSpacing: 0.5 },
  modalInput: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: "#111827",
    backgroundColor: "#fafafa",
  },
  modalFooter: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    alignItems: "center",
  },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  modalSave: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
