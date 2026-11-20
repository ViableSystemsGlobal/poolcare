import { useState, useEffect } from "react";
import * as Updates from "expo-updates";
import Constants from "expo-constants";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, CarerPerformance } from "../src/lib/api-client";
import { useToast } from "../src/components/Toast";
import {
  C,
  Card,
  Row,
  Avatar,
  Button,
  Field,
  TabHeader,
  SectionHeader,
  StatStrip,
  TAB_BAR_CLEARANCE,
  useAccent,
} from "../src/ui";

// expo-image-picker is loaded lazily, not at module scope. A native module that
// fails while initialising takes the whole route module down with it, and the
// screen then closes with no JS error to catch. Deferring the require means the
// screen still opens and only the photo action fails.
type ImagePickerModule = typeof import("expo-image-picker");
function getImagePicker(): ImagePickerModule | null {
  try {
    return require("expo-image-picker") as ImagePickerModule;
  } catch {
    return null;
  }
}

interface CarerProfile {
  name: string;
  phone: string;
  email: string;
  imageUrl: string | null;
  orgName: string;
}

export default function ProfileScreen() {
  const { accent, tint } = useAccent();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<CarerProfile>({ name: "", phone: "", email: "", imageUrl: null, orgName: "" });
  const [perf, setPerf] = useState<CarerPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [carerRes, meRes, perfRes] = await Promise.allSettled([
        api.getMyCarer() as Promise<any>,
        api.getMe() as Promise<any>,
        api.getPerformance(),
      ]);
      const carer = carerRes.status === "fulfilled" ? carerRes.value : null;
      const me = meRes.status === "fulfilled" ? meRes.value : null;
      setProfile({
        name: carer?.name || carer?.user?.name || "",
        phone: carer?.phone || carer?.user?.phone || "",
        email: carer?.user?.email || "",
        imageUrl: carer?.imageUrl || null,
        orgName: me?.org?.name || "",
      });
      if (perfRes.status === "fulfilled") setPerf(perfRes.value);
      setLoading(false);
    })();
  }, []);

  const changePhoto = () => {
    Alert.alert(
      "Profile photo",
      undefined,
      [
        { text: "Take photo", onPress: () => pickImage("camera") },
        { text: "Choose from gallery", onPress: () => pickImage("library") },
        ...(profile.imageUrl ? [{ text: "Remove photo", style: "destructive" as const, onPress: removePhoto }] : []),
        // Android alerts show at most three buttons; there, tapping outside cancels
        ...(Platform.OS === "android" && profile.imageUrl ? [] : [{ text: "Cancel", style: "cancel" as const }]),
      ],
      { cancelable: true },
    );
  };

  const pickImage = async (source: "camera" | "library") => {
    const ImagePicker = getImagePicker();
    if (!ImagePicker) {
      showToast("The photo picker isn't available on this device", "error");
      return;
    }
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        showToast(source === "camera" ? "Camera access is needed" : "Photo access is needed", "warning");
        return;
      }
      const opts = { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.8 };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({ ...opts, mediaTypes: ["images"] });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop()?.toLowerCase() || "jpg";
      setUploading(true);
      try {
        const { imageUrl } = await api.uploadMyCarerPhoto(asset.uri, `carer_profile_${Date.now()}.${ext}`, ext === "png" ? "image/png" : "image/jpeg");
        setProfile((p) => ({ ...p, imageUrl }));
        showToast("Photo updated", "success");
      } catch (e: any) {
        showToast(e?.message || "Couldn't upload the photo", "error");
      } finally {
        setUploading(false);
      }
    } catch {
      showToast("Couldn't open the camera or gallery", "error");
    }
  };

  const removePhoto = async () => {
    try {
      setUploading(true);
      await api.updateMyCarer({ imageUrl: "" });
      setProfile((p) => ({ ...p, imageUrl: null }));
    } catch (e: any) {
      showToast(e?.message || "Couldn't remove the photo", "error");
    } finally {
      setUploading(false);
    }
  };

  const saveName = async () => {
    if (!editName.trim()) return;
    try {
      setSaving(true);
      await api.updateMyCarer({ name: editName.trim() });
      setProfile((p) => ({ ...p, name: editName.trim() }));
      setEditOpen(false);
      showToast("Profile updated", "success");
    } catch (e: any) {
      showToast(e?.message || "Couldn't save", "error");
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    Alert.alert("Log out?", "You'll need a new code to sign back in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await api.logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const contactSupport = () =>
    Alert.alert("Contact support", "How would you like to reach the office?", [
      { text: "Call", onPress: () => Linking.openURL("tel:+233506226222") },
      { text: "Email", onPress: () => Linking.openURL("mailto:info@poolcare.africa") },
      { text: "Cancel", style: "cancel" },
    ]);

  const linkRow = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, opts?: { sub?: string; first?: boolean; external?: boolean }) => (
    <Row first={opts?.first} onPress={onPress} chevron={!opts?.external}>
      <Ionicons name={icon} size={20} color={C.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {opts?.sub ? <Text style={styles.rowSub}>{opts.sub}</Text> : null}
      </View>
      {opts?.external ? <Ionicons name="open-outline" size={16} color={C.faint} /> : null}
    </Row>
  );

  const version = Constants.expoConfig?.version || "1.0.0";

  return (
    <View style={styles.container}>
      <TabHeader eyebrow="Account" title="Profile" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }} showsVerticalScrollIndicator={false}>
        {/* Identity */}
        <Card style={styles.identity}>
          <TouchableOpacity onPress={changePhoto} accessibilityLabel="Change profile photo" activeOpacity={0.8}>
            {uploading ? (
              <View style={[styles.avatarBusy, { backgroundColor: tint }]}>
                <ActivityIndicator color={accent} />
              </View>
            ) : (
              <Avatar name={profile.name} uri={profile.imageUrl} size={72} />
            )}
            <View style={[styles.camera, { backgroundColor: accent }]}>
              <Ionicons name="camera" size={12} color="#ffffff" />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <ActivityIndicator color={accent} style={{ alignSelf: "flex-start" }} />
            ) : (
              <>
                <Text style={styles.name} numberOfLines={1}>
                  {profile.name || "Carer"}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[profile.orgName ? `Carer · ${profile.orgName}` : "Carer"].join("")}
                </Text>
                {profile.phone ? <Text style={styles.meta}>{profile.phone}</Text> : null}
              </>
            )}
          </View>
          <TouchableOpacity
            onPress={() => {
              setEditName(profile.name);
              setEditOpen(true);
            }}
            style={styles.editBtn}
            accessibilityLabel="Edit name"
          >
            <Ionicons name="pencil" size={16} color={C.ink} />
          </TouchableOpacity>
        </Card>

        {perf ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.replace("/performance")}>
            <StatStrip
              style={{ marginTop: 12 }}
              items={[
                { label: "This month", value: String(perf.jobsDone), sub: "jobs done" },
                { label: "Rating", value: perf.allTimeRating != null ? perf.allTimeRating.toFixed(1) : "–", star: perf.allTimeRating != null, sub: `${perf.allTimeRatingCount} review${perf.allTimeRatingCount === 1 ? "" : "s"}` },
                { label: "On time", value: perf.onTimePct != null ? `${perf.onTimePct}%` : "–", sub: "this month" },
              ]}
            />
          </TouchableOpacity>
        ) : null}

        <SectionHeader title="Work" />
        <Card>
          {linkRow("star-outline", "Performance", () => router.replace("/performance"), { first: true, sub: "Jobs done, ratings and reviews" })}
          {linkRow("water-outline", "Onboard a pool", () => router.push("/onboard-pool"), { sub: "Register a new client pool" })}
          {linkRow("notifications-outline", "Notifications", () => router.push("/notifications"))}
        </Card>

        <SectionHeader title="Settings" />
        <Card>
          {linkRow("phone-portrait-outline", "Notification settings", () => Linking.openSettings(), {
            first: true,
            sub: "Turn PoolCare alerts on or off on this phone",
            external: true,
          })}
          {linkRow("person-outline", "Edit name", () => {
            setEditName(profile.name);
            setEditOpen(true);
          })}
        </Card>

        <SectionHeader title="Help" />
        <Card>
          {linkRow("chatbubbles-outline", "Contact the office", contactSupport, { first: true })}
          {linkRow("help-circle-outline", "Help centre", () => Linking.openURL("https://poolcare.africa"), { external: true })}
          {linkRow("document-text-outline", "Privacy policy", () => Linking.openURL("https://poolcare.africa/privacy-policy/"), { external: true })}
          {linkRow("document-outline", "Terms of service", () => Linking.openURL("https://poolcare.africa/terms-and-conditions/"), { external: true })}
        </Card>

        <Card style={{ marginTop: 24 }}>
          <Row first onPress={logout} chevron={false}>
            <Ionicons name="log-out-outline" size={20} color={C.danger} />
            <Text style={[styles.rowLabel, { color: C.danger }]}>Log out</Text>
          </Row>
        </Card>

        <Text style={styles.version}>
          PoolCare Carer {version} · {Updates.updateId ? `update ${Updates.updateId.slice(0, 8)}` : "built-in"}
        </Text>
      </ScrollView>

      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.overlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEditOpen(false)} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Your name</Text>
            <Field
              style={{ marginTop: 14 }}
              label="Display name"
              value={editName}
              onChangeText={setEditName}
              placeholder="Your full name"
              autoCapitalize="words"
              autoFocus
              hint="Clients see this on visit reports. Your phone number is your login and can't be changed here."
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              <Button title="Cancel" variant="secondary" onPress={() => setEditOpen(false)} style={{ flex: 1 }} />
              <Button title="Save" onPress={saveName} loading={saving} disabled={!editName.trim()} style={{ flex: 1 }} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  identity: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  avatarBusy: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  camera: { position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#ffffff" },
  name: { fontSize: 20, fontWeight: "700", color: C.ink },
  meta: { fontSize: 13, color: C.muted, marginTop: 2 },
  editBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 15, fontWeight: "500", color: C.ink },
  rowSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  version: { textAlign: "center", fontSize: 12, color: C.faint, marginTop: 20 },
  overlay: { flex: 1, backgroundColor: "rgba(16,35,26,0.35)" },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10 },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, marginBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: C.ink },
});
