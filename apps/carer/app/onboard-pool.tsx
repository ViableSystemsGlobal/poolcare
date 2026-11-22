import { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";
import { ScreenHeader } from "../src/ui";
import { useToast } from "../src/components/Toast";

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


type Step = "find-client" | "pool-details" | "success";

interface SelectedClient {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

const SURFACE_TYPES = ["Plaster", "Fiberglass", "Vinyl", "Pebble", "Tile", "Other"];
const POOL_TYPES = ["Inground", "Above Ground", "Semi-Inground", "Lap Pool", "Infinity", "Spa", "Other"];
const FILTRATION_TYPES = ["Sand", "Cartridge", "DE (Diatomaceous Earth)", "UV", "Saltwater", "Other"];

export default function OnboardPoolScreen() {
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>("find-client");

  // Step 1: Client search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SelectedClient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [creatingClient, setCreatingClient] = useState(false);

  // Step 2: Pool details
  const [poolName, setPoolName] = useState("");
  const [poolAddress, setPoolAddress] = useState("");
  const [poolVolume, setPoolVolume] = useState("");
  const [surfaceType, setSurfaceType] = useState("");
  const [poolType, setPoolType] = useState("");
  const [filtrationType, setFiltrationType] = useState("");
  const [poolNotes, setPoolNotes] = useState("");
  const [poolImages, setPoolImages] = useState<{ uri: string; fileName: string; mimeType: string }[]>([]);
  const [poolLat, setPoolLat] = useState<number | undefined>();
  const [poolLng, setPoolLng] = useState<number | undefined>();
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [savingPool, setSavingPool] = useState(false);

  // Result
  const [createdPool, setCreatedPool] = useState<any>(null);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.searchClients(q.trim());
      const items = (res as any).items || [];
      setSearchResults(
        items.map((c: any) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
        }))
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSelectClient = (client: SelectedClient) => {
    setSelectedClient(client);
    setShowNewClientForm(false);
    setStep("pool-details");
  };

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      showToast("Please enter the client's name", "error");
      return;
    }
    if (!newClientPhone.trim() && !newClientEmail.trim()) {
      showToast("Please provide a phone or email", "error");
      return;
    }
    setCreatingClient(true);
    try {
      const client = await api.createClient({
        name: newClientName.trim(),
        phone: newClientPhone.trim() || undefined,
        email: newClientEmail.trim() || undefined,
      });
      setSelectedClient({ id: client.id, name: client.name, phone: client.phone, email: client.email });
      setStep("pool-details");
    } catch (e: any) {
      showToast(e.message || "Failed to create client", "error");
    } finally {
      setCreatingClient(false);
    }
  };

  const handleGetLocation = async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        showToast("Location permission required", "error");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      setPoolLat(latitude);
      setPoolLng(longitude);

      // Reverse geocode to get a human-readable address
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (place) {
        const parts = [
          place.streetNumber,
          place.street,
          place.district || place.subregion,
          place.city,
          place.region,
        ].filter(Boolean);
        const formatted = parts.join(", ");
        if (formatted) setPoolAddress(formatted);
      }
    } catch {
      showToast("Could not get location. Try typing manually.", "error");
    } finally {
      setFetchingLocation(false);
    }
  };

  const handlePickImage = async () => {
    const ImagePicker = getImagePicker();
    if (!ImagePicker) { showToast("Photo picker unavailable on this device", "error"); return; }
    const result = await ImagePicker!.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = asset.fileName || `pool_${Date.now()}.jpg`;
      const mimeType = asset.mimeType || "image/jpeg";
      setPoolImages((prev) => [...prev, { uri: asset.uri, fileName, mimeType }]);
    }
  };

  const handleTakePhoto = async () => {
    const ImagePicker = getImagePicker();
    if (!ImagePicker) { showToast("Photo picker unavailable on this device", "error"); return; }
    const { status } = await ImagePicker!.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showToast("Camera permission required", "error");
      return;
    }
    const result = await ImagePicker!.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const fileName = `pool_${Date.now()}.jpg`;
      setPoolImages((prev) => [...prev, { uri: asset.uri, fileName, mimeType: "image/jpeg" }]);
    }
  };

  const handleSavePool = async () => {
    if (!selectedClient) return;
    if (!poolName.trim() && !poolAddress.trim()) {
      showToast("Please provide at least a name or address for the pool", "error");
      return;
    }
    setSavingPool(true);
    try {
      // Upload images first
      const imageUrls: string[] = [];
      for (const img of poolImages) {
        try {
          const res = await api.uploadPoolImage(img.uri, img.fileName, img.mimeType);
          imageUrls.push(res.imageUrl);
        } catch {
          // skip failed uploads
        }
      }

      const pool = await api.createPool({
        clientId: selectedClient.id,
        name: poolName.trim() || undefined,
        address: poolAddress.trim() || undefined,
        lat: poolLat,
        lng: poolLng,
        volumeL: poolVolume ? parseFloat(poolVolume) : undefined,
        surfaceType: surfaceType || undefined,
        poolType: poolType || undefined,
        filtrationType: filtrationType || undefined,
        notes: poolNotes.trim() || undefined,
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });

      setCreatedPool(pool);
      setStep("success");
    } catch (e: any) {
      showToast(e.message || "Failed to create pool", "error");
    } finally {
      setSavingPool(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <ScreenHeader
          eyebrow={step === "success" ? "Done" : `Step ${step === "pool-details" ? 2 : 1} of 2`}
          title="Onboard a pool"
          onBack={() => (step === "pool-details" ? setStep("find-client") : router.back())}
        />

        {/* Progress */}
        {step !== "success" && (
          <View style={styles.progressRow}>
            {["Client", "Pool details"].map((label, i) => {
              const on = i === 0 || step === "pool-details";
              return (
                <View key={label} style={{ flex: 1 }}>
                  <View style={[styles.progressLine, on && { backgroundColor: themeColor }]} />
                  <Text style={[styles.progressStepText, on && { color: themeColor }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ===== STEP 1: FIND CLIENT ===== */}
        {step === "find-client" && (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>Whose pool is it?</Text>
            <Text style={styles.stepSubtitle}>Search for the client this pool belongs to, or add a new one.</Text>

            {!showNewClientForm && (
              <>
                {/* Search input */}
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={18} color="#9ca3af" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, phone or email…"
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={handleSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searching && <ActivityIndicator size="small" color={themeColor} style={{ marginRight: 10 }} />}
                </View>

                {/* Results */}
                {searchResults.map((client) => (
                  <TouchableOpacity
                    key={client.id}
                    style={styles.clientCard}
                    onPress={() => handleSelectClient(client)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.clientAvatar, { backgroundColor: themeColor + "18" }]}>
                      <Text style={[styles.clientAvatarText, { color: themeColor }]}>
                        {client.name.slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      {(client.phone || client.email) && (
                        <Text style={styles.clientContact}>{client.phone || client.email}</Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
                  </TouchableOpacity>
                ))}

                {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <Text style={styles.noResultsText}>No clients found for "{searchQuery}"</Text>
                )}

                <View style={styles.dividerRow}>
                  <View style={styles.divider} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.divider} />
                </View>

                <TouchableOpacity
                  style={[styles.newClientBtn, { borderColor: themeColor }]}
                  onPress={() => setShowNewClientForm(true)}
                >
                  <Ionicons name="person-add-outline" size={18} color={themeColor} />
                  <Text style={[styles.newClientBtnText, { color: themeColor }]}>Add a new client</Text>
                </TouchableOpacity>
              </>
            )}

            {/* New client form */}
            {showNewClientForm && (
              <View style={styles.newClientForm}>
                <TouchableOpacity style={styles.backToSearch} onPress={() => setShowNewClientForm(false)}>
                  <Ionicons name="arrow-back-outline" size={16} color="#6b7280" />
                  <Text style={styles.backToSearchText}>Back to search</Text>
                </TouchableOpacity>

                <Text style={styles.formLabel}>Full name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. John Mensah"
                  placeholderTextColor="#9ca3af"
                  value={newClientName}
                  onChangeText={setNewClientName}
                  autoCapitalize="words"
                />

                <Text style={styles.formLabel}>Phone</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+233 20 000 0000"
                  placeholderTextColor="#9ca3af"
                  value={newClientPhone}
                  onChangeText={setNewClientPhone}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />

                <Text style={styles.formLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="john@example.com"
                  placeholderTextColor="#9ca3af"
                  value={newClientEmail}
                  onChangeText={setNewClientEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: themeColor }, creatingClient && { opacity: 0.7 }]}
                  onPress={handleCreateClient}
                  disabled={creatingClient}
                >
                  {creatingClient ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Add client & continue</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        )}

        {/* ===== STEP 2: POOL DETAILS ===== */}
        {step === "pool-details" && (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>Pool details</Text>
            {selectedClient && (
              <View style={styles.selectedClientBadge}>
                <Ionicons name="person-circle-outline" size={16} color={themeColor} />
                <Text style={[styles.selectedClientText, { color: themeColor }]}>
                  {selectedClient.name}
                </Text>
              </View>
            )}

            <Text style={styles.formLabel}>Pool name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Backyard Pool"
              placeholderTextColor="#9ca3af"
              value={poolName}
              onChangeText={setPoolName}
              autoCapitalize="words"
            />

            <Text style={styles.formLabel}>Address</Text>
            <View style={styles.addressRow}>
              <TextInput
                style={[styles.input, styles.addressInput]}
                placeholder="123 Main St, Accra"
                placeholderTextColor="#9ca3af"
                value={poolAddress}
                onChangeText={(v) => {
                  setPoolAddress(v);
                  // Clear saved coords if user manually edits
                  if (poolLat) { setPoolLat(undefined); setPoolLng(undefined); }
                }}
                autoCapitalize="sentences"
              />
              <TouchableOpacity
                style={[styles.locationBtn, { backgroundColor: themeColor + "12", borderColor: themeColor + "30" }]}
                onPress={handleGetLocation}
                disabled={fetchingLocation}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {fetchingLocation ? (
                  <ActivityIndicator size="small" color={themeColor} />
                ) : (
                  <Ionicons name="locate" size={20} color={poolLat ? themeColor : "#9ca3af"} />
                )}
              </TouchableOpacity>
            </View>
            {poolLat && (
              <Text style={[styles.locationHint, { color: themeColor }]}>
                Location captured
              </Text>
            )}

            <Text style={styles.formLabel}>Volume (litres)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50000"
              placeholderTextColor="#9ca3af"
              value={poolVolume}
              onChangeText={setPoolVolume}
              keyboardType="numeric"
            />

            <Text style={styles.formLabel}>Pool type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {POOL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, poolType === t && { backgroundColor: themeColor + "1F", borderColor: themeColor }]}
                  onPress={() => setPoolType(poolType === t ? "" : t)}
                >
                  <Text style={[styles.chipText, poolType === t && { color: themeColor, fontWeight: "700" }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.formLabel}>Surface</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {SURFACE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, surfaceType === t && { backgroundColor: themeColor + "1F", borderColor: themeColor }]}
                  onPress={() => setSurfaceType(surfaceType === t ? "" : t)}
                >
                  <Text style={[styles.chipText, surfaceType === t && { color: themeColor, fontWeight: "700" }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.formLabel}>Water</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {FILTRATION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, filtrationType === t && { backgroundColor: themeColor + "1F", borderColor: themeColor }]}
                  onPress={() => setFiltrationType(filtrationType === t ? "" : t)}
                >
                  <Text style={[styles.chipText, filtrationType === t && { color: themeColor, fontWeight: "700" }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.formLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any special notes about the pool…"
              placeholderTextColor="#9ca3af"
              value={poolNotes}
              onChangeText={setPoolNotes}
              multiline
              numberOfLines={3}
              autoCapitalize="sentences"
            />

            {/* Photos */}
            <Text style={styles.formLabel}>Photos (optional)</Text>
            <View style={styles.photoRow}>
              {poolImages.map((img, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: img.uri }} style={styles.photoThumbImage} />
                  <TouchableOpacity
                    style={styles.photoRemoveBtn}
                    onPress={() => setPoolImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close-circle" size={22} color="#111827" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addPhotoBtn} onPress={handleTakePhoto}>
                <Ionicons name="camera-outline" size={22} color="#9ca3af" />
                <Text style={styles.addPhotoText}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhotoBtn} onPress={handlePickImage}>
                <Ionicons name="image-outline" size={22} color="#9ca3af" />
                <Text style={styles.addPhotoText}>Gallery</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: themeColor, marginTop: 24 }, savingPool && { opacity: 0.7 }]}
              onPress={handleSavePool}
              disabled={savingPool}
            >
              {savingPool ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>Save pool</Text>
              )}
            </TouchableOpacity>

            <View style={{ height: 60 }} />
          </ScrollView>
        )}

        {/* ===== STEP 3: SUCCESS ===== */}
        {step === "success" && (
          <View style={styles.successContainer}>
            <View style={[styles.successIcon, { backgroundColor: themeColor + "15" }]}>
              <Ionicons name="checkmark-circle" size={64} color={themeColor} />
            </View>
            <Text style={styles.successTitle}>
              {createdPool?.approvalStatus === "pending" ? "Sent for approval" : "Pool added"}
            </Text>
            <Text style={styles.successSubtitle}>
              {createdPool?.name || "The pool"} has been {createdPool?.approvalStatus === "pending" ? "submitted" : "added"} for{" "}
              <Text style={{ fontWeight: "700" }}>{selectedClient?.name}</Text>.
              {createdPool?.approvalStatus === "pending"
                ? " The office will review it before it can be scheduled."
                : ""}
            </Text>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: themeColor, marginTop: 32 }]}
              onPress={() => {
                router.back();
              }}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.outlineBtn, { borderColor: themeColor, marginTop: 12 }]}
              onPress={() => {
                // Reset and onboard another
                setStep("find-client");
                setSelectedClient(null);
                setSearchQuery("");
                setSearchResults([]);
                setShowNewClientForm(false);
                setNewClientName("");
                setNewClientPhone("");
                setNewClientEmail("");
                setPoolName("");
                setPoolAddress("");
                setPoolVolume("");
                setSurfaceType("");
                setPoolType("");
                setFiltrationType("");
                setPoolNotes("");
                setPoolImages([]);
                setPoolLat(undefined);
                setPoolLng(undefined);
                setCreatedPool(null);
              }}
            >
              <Text style={[styles.outlineBtnText, { color: themeColor }]}>Onboard another pool</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const INK = "#111827";
const CARD_LIFT = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  web: { boxShadow: "0 3px 10px rgba(0,0,0,0.07)" },
  default: { elevation: 3 },
}) as any;
const MUTED = "#6b7280";
const LINE = "#f3f4f6";
const BORDER = "#e5e7eb";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  header: {},
  backBtn: {},
  headerTitle: {},
  progressRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  progressStep: {},
  progressStepText: { fontSize: 12, fontWeight: "600", color: MUTED, marginTop: 6 },
  progressLine: { height: 4, borderRadius: 2, backgroundColor: LINE },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  stepTitle: { fontSize: 24, fontWeight: "800", color: INK, letterSpacing: -0.5 },
  stepSubtitle: { fontSize: 14, color: MUTED, marginTop: 4, marginBottom: 18, lineHeight: 20 },
  searchRow: { flexDirection: "row", alignItems: "center", height: 52, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: BORDER, marginBottom: 12 },
  searchIcon: { marginLeft: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: INK, paddingVertical: 0 },
  noResultsText: { fontSize: 14, color: MUTED, textAlign: "center", paddingVertical: 16 },
  clientCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#ffffff", borderRadius: 18, padding: 14, marginBottom: 10, ...CARD_LIFT },
  clientAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  clientAvatarText: { fontSize: 15, fontWeight: "700" },
  clientInfo: { flex: 1, minWidth: 0 },
  clientName: { fontSize: 15, fontWeight: "600", color: INK },
  clientContact: { fontSize: 13, color: MUTED, marginTop: 2 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  dividerText: { fontSize: 13, color: MUTED },
  newClientBtn: { height: 52, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#ffffff" },
  newClientBtnText: { fontSize: 15, fontWeight: "600" },
  newClientForm: { backgroundColor: "#ffffff", borderRadius: 20, padding: 16 },
  backToSearch: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6, height: 36 },
  backToSearchText: { fontSize: 14, color: MUTED, fontWeight: "500" },
  formLabel: { fontSize: 13, fontWeight: "600", color: INK, marginTop: 16, marginBottom: 6 },
  input: { minHeight: 50, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: INK, backgroundColor: "#ffffff" },
  textArea: { minHeight: 90, paddingTop: 12, textAlignVertical: "top" },
  addressRow: { flexDirection: "row", gap: 8 },
  addressInput: { flex: 1 },
  locationBtn: { width: 50, height: 50, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  locationHint: { fontSize: 12, marginTop: 6, fontWeight: "500" },
  selectedClientBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: "#ffffff", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  selectedClientText: { fontSize: 13, fontWeight: "600" },
  chipRow: { flexGrow: 0 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", justifyContent: "center", marginRight: 8 },
  chipText: { fontSize: 14, color: "#374151", fontWeight: "500" },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { width: 84, height: 84 },
  photoThumbImage: { width: 84, height: 84, borderRadius: 12 },
  photoRemoveBtn: { position: "absolute", top: -6, right: -6, backgroundColor: "#ffffff", borderRadius: 11 },
  addPhotoBtn: { width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: BORDER, alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#ffffff" },
  addPhotoText: { fontSize: 12, color: MUTED, fontWeight: "600" },
  primaryBtn: { height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
  primaryBtnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },
  outlineBtn: { height: 56, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  outlineBtnText: { fontSize: 16, fontWeight: "700" },
  successContainer: { flex: 1, paddingHorizontal: 24, alignItems: "stretch", justifyContent: "center" },
  successIcon: { alignSelf: "center", width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center" },
  successTitle: { fontSize: 26, fontWeight: "800", color: INK, textAlign: "center", marginTop: 20, letterSpacing: -0.5 },
  successSubtitle: { fontSize: 15, color: MUTED, textAlign: "center", marginTop: 8, lineHeight: 22 },
});
