import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../src/contexts/ThemeContext";
import { api } from "../src/lib/api-client";

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
  const [profile, setProfile] = useState<ClientProfile>({
    clientId: null,
    name: "",
    email: "",
    phone: "",
    imageUrl: null,
    organization: "",
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
      // Start with cached user for instant display
      const stored = await api.getStoredUser();
      if (stored?.name) {
        setProfile((p) => ({ ...p, name: stored.name || p.name, email: stored.email || p.email, phone: stored.phone || p.phone }));
      }
      // Then fetch full client profile from API
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
    Alert.alert(
      "Profile Photo",
      "Choose an option",
      [
        {
          text: "Take Photo",
          onPress: () => pickImage("camera"),
        },
        {
          text: "Choose from Gallery",
          onPress: () => pickImage("library"),
        },
        ...(profile.imageUrl ? [{
          text: "Remove Photo",
          style: "destructive" as const,
          onPress: handleRemovePhoto,
        }] : []),
        { text: "Cancel", style: "cancel" as const },
      ]
    );
  };

  const pickImage = async (source: "camera" | "library") => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Camera access is needed to take a photo.");
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permission Required", "Photo library access is needed.");
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
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
    } catch (error) {
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
    if (!editName.trim()) {
      Alert.alert("Error", "Name cannot be empty.");
      return;
    }
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
    Alert.alert(
      "Next Visit Card Background",
      "Choose an option",
      [
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
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await api.logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const renderSection = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const renderItem = (
    icon: string,
    label: string,
    onPress: () => void,
    opts?: { subtitle?: string; rightElement?: React.ReactNode; danger?: boolean }
  ) => (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.iconBox, { backgroundColor: opts?.danger ? "#fee2e2" : `${themeColor}18` }]}>
        <Ionicons name={icon as any} size={20} color={opts?.danger ? "#ef4444" : themeColor} />
      </View>
      <View style={styles.itemText}>
        <Text style={[styles.itemLabel, opts?.danger && { color: "#ef4444" }]}>{label}</Text>
        {opts?.subtitle ? <Text style={styles.itemSubtitle}>{opts.subtitle}</Text> : null}
      </View>
      {opts?.rightElement ?? <Ionicons name="chevron-forward" size={18} color="#c4c4c4" />}
    </TouchableOpacity>
  );

  const iconBg = `${themeColor}18`;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { router.canGoBack() ? router.back() : router.replace("/"); }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Account</Text>
        <TouchableOpacity onPress={handleOpenEditModal}>
          <Text style={[styles.headerEdit, { color: themeColor }]}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Profile card */}
        <View style={styles.profileCard}>
          <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.8} style={styles.avatarWrap}>
            {uploadingPhoto ? (
              <View style={[styles.avatarPlaceholder, { borderColor: themeColor }]}>
                <ActivityIndicator color={themeColor} />
              </View>
            ) : profile.imageUrl ? (
              <Image source={{ uri: profile.imageUrl }} style={[styles.avatar, { borderColor: themeColor }]} />
            ) : (
              <View style={[styles.avatarPlaceholder, { borderColor: themeColor }]}>
                <Text style={[styles.avatarInitials, { color: themeColor }]}>
                  {profile.name ? profile.name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?"}
                </Text>
              </View>
            )}
            <View style={[styles.cameraBadge, { backgroundColor: themeColor }]}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          {loadingProfile ? (
            <ActivityIndicator color={themeColor} style={{ marginTop: 8 }} />
          ) : (
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{profile.name || "Your Account"}</Text>
              {!!profile.email && <Text style={styles.profileSub}>{profile.email}</Text>}
              {!!profile.phone && !profile.email && <Text style={styles.profileSub}>{profile.phone}</Text>}
              {!!profile.organization && (
                <View style={[styles.orgChip, { backgroundColor: `${themeColor}15`, borderColor: `${themeColor}30` }]}>
                  <Ionicons name="business-outline" size={12} color={themeColor} />
                  <Text style={[styles.orgChipText, { color: themeColor }]}>{profile.organization}</Text>
                </View>
              )}
            </View>
          )}

          <TouchableOpacity style={[styles.editProfileBtn, { borderColor: `${themeColor}40` }]} onPress={handleOpenEditModal} activeOpacity={0.7}>
            <Ionicons name="pencil-outline" size={14} color={themeColor} />
            <Text style={[styles.editProfileBtnText, { color: themeColor }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Quick links row */}
        <View style={styles.quickRow}>
          {([
            { icon: "document-text-outline", label: "Billing", route: "/billing" },
            { icon: "layers-outline", label: "Plans", route: "/my-subscriptions" },
            { icon: "card-outline", label: "Payment", route: "/payment-methods" },
            { icon: "people-outline", label: "Family", route: "/family" },
          ] as const).map((item, i) => (
            <TouchableOpacity key={i} style={styles.quickItem} onPress={() => router.push(item.route as any)} activeOpacity={0.7}>
              <View style={[styles.quickIconBox, { backgroundColor: `${themeColor}15` }]}>
                <Ionicons name={item.icon} size={20} color={themeColor} />
              </View>
              <Text style={styles.quickLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account section */}
        {renderSection("Account", <>
          {renderItem("person-outline", "Profile Information", handleOpenEditModal, { subtitle: profile.phone || profile.email || "" })}
          {renderItem("people-outline", "Family & Sharing", () => router.push("/family"), { subtitle: "Manage household members" })}
          {renderItem("card-outline", "Payment Methods", () => router.push("/payment-methods"))}
          {renderItem("document-text-outline", "Billing & Invoices", () => router.push("/billing"))}
          {renderItem("layers-outline", "My Subscriptions", () => router.push("/my-subscriptions"))}
        </>)}

        {/* Notifications */}
        {renderSection("Notifications", <>
          {(["serviceReminders", "paymentReminders", "visitUpdates", "promotions"] as const).map((key) => {
            const labels: Record<string, [string, string]> = {
              serviceReminders: ["calendar-outline", "Service Reminders"],
              paymentReminders: ["cash-outline", "Payment Reminders"],
              visitUpdates: ["notifications-outline", "Visit Updates"],
              promotions: ["megaphone-outline", "Promotions & Offers"],
            };
            const [icon, label] = labels[key];
            return (
              <View key={key} style={styles.item}>
                <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
                  <Ionicons name={icon as any} size={20} color={themeColor} />
                </View>
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>{label}</Text>
                </View>
                <Switch
                  value={notifications[key]}
                  onValueChange={(v) => setNotifications((n) => ({ ...n, [key]: v }))}
                  trackColor={{ false: "#d1d5db", true: themeColor }}
                  thumbColor="#ffffff"
                />
              </View>
            );
          })}
        </>)}

        {/* Preferences */}
        {renderSection("Preferences", <>
          {renderItem("image-outline", "Next Visit Card Background", handleChangeNextVisitBackground, {
            subtitle: nextVisitBackgroundImage ? "Custom image set" : "Using default",
          })}
          {renderItem("download-outline", "Download Reports", () => Alert.alert("Coming Soon", "Report downloads will be available soon."))}
        </>)}

        {/* Support */}
        {renderSection("Support & Legal", <>
          {renderItem("help-circle-outline", "Help Center", () => Alert.alert("Help", "Contact your pool service provider for support."))}
          {renderItem("chatbubbles-outline", "Contact Support", () => Alert.alert("Support", "We'll connect you with support shortly."))}
          {renderItem("document-text-outline", "Privacy Policy", () => Alert.alert("Privacy Policy", "Your data is kept private and secure."))}
          {renderItem("document-outline", "Terms of Service", () => Alert.alert("Terms", "By using PoolCare you agree to our terms of service."))}
        </>)}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.version}>PoolCare v1.0.0</Text>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
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
              />
              <Text style={styles.modalLabel}>Email</Text>
              <TextInput
                style={styles.modalInput}
                value={editEmail}
                onChangeText={setEditEmail}
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
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
                {savingProfile ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Save</Text>}
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
  headerEdit: { fontSize: 15, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Profile card
  profileCard: {
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  avatarWrap: { position: "relative", marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
  },
  avatarInitials: { fontSize: 28, fontWeight: "700" },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  profileInfo: { alignItems: "center", marginBottom: 14 },
  profileName: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 2 },
  profileSub: { fontSize: 13, color: "#6b7280", marginBottom: 6 },
  orgChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 2,
  },
  orgChipText: { fontSize: 12, fontWeight: "600" },
  editProfileBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  editProfileBtnText: { fontSize: 13, fontWeight: "600" },

  // Quick links row
  quickRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  quickItem: { flex: 1, alignItems: "center", gap: 6 },
  quickIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  quickLabel: { fontSize: 11, fontWeight: "600", color: "#374151" },

  // Sections
  section: {
    backgroundColor: "#ffffff",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    paddingTop: 16,
    paddingBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },

  // Item
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  itemText: { flex: 1 },
  itemLabel: { fontSize: 15, fontWeight: "500", color: "#111827" },
  itemSubtitle: { fontSize: 12, color: "#9ca3af", marginTop: 1 },

  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 12,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fee2e2",
  },
  logoutText: { fontSize: 16, fontWeight: "600", color: "#ef4444" },
  version: { textAlign: "center", fontSize: 12, color: "#c4c4c4", marginBottom: 16 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  modalBody: { paddingHorizontal: 20, paddingTop: 16 },
  modalLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginBottom: 6, marginTop: 12 },
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
  modalSave: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  modalSaveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
