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
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";
import { useToast } from "../src/components/Toast";

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      showToast("Camera permission required", "error");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              if (step === "pool-details") {
                setStep("find-client");
              } else {
                router.back();
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Onboard Pool</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Progress */}
        {step !== "success" && (
          <View style={styles.progressRow}>
            <View style={[styles.progressStep, { backgroundColor: themeColor }]}>
              <Text style={styles.progressStepText}>1</Text>
            </View>
            <View style={[styles.progressLine, step === "pool-details" && { backgroundColor: themeColor }]} />
            <View style={[styles.progressStep, step === "pool-details" ? { backgroundColor: themeColor } : { backgroundColor: "#e5e7eb" }]}>
              <Text style={[styles.progressStepText, step !== "pool-details" && { color: "#9ca3af" }]}>2</Text>
            </View>
          </View>
        )}

        {/* ===== STEP 1: FIND CLIENT ===== */}
        {step === "find-client" && (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.stepTitle}>Find or Create Client</Text>
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
                    <Ionicons name="chevron-forward" size={18} color="#d1d5db" />
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
                  <Text style={[styles.newClientBtnText, { color: themeColor }]}>Create New Client</Text>
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

                <Text style={styles.formLabel}>Full Name *</Text>
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
                    <Text style={styles.primaryBtnText}>Create Client & Continue</Text>
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
            <Text style={styles.stepTitle}>Pool Details</Text>
            {selectedClient && (
              <View style={styles.selectedClientBadge}>
                <Ionicons name="person-circle-outline" size={16} color={themeColor} />
                <Text style={[styles.selectedClientText, { color: themeColor }]}>
                  {selectedClient.name}
                </Text>
              </View>
            )}

            <Text style={styles.formLabel}>Pool Name</Text>
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

            <Text style={styles.formLabel}>Volume (Litres)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50000"
              placeholderTextColor="#9ca3af"
              value={poolVolume}
              onChangeText={setPoolVolume}
              keyboardType="numeric"
            />

            <Text style={styles.formLabel}>Pool Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {POOL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, poolType === t && { backgroundColor: themeColor, borderColor: themeColor }]}
                  onPress={() => setPoolType(poolType === t ? "" : t)}
                >
                  <Text style={[styles.chipText, poolType === t && { color: "#fff" }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.formLabel}>Surface Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {SURFACE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, surfaceType === t && { backgroundColor: themeColor, borderColor: themeColor }]}
                  onPress={() => setSurfaceType(surfaceType === t ? "" : t)}
                >
                  <Text style={[styles.chipText, surfaceType === t && { color: "#fff" }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.formLabel}>Filtration Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {FILTRATION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, filtrationType === t && { backgroundColor: themeColor, borderColor: themeColor }]}
                  onPress={() => setFiltrationType(filtrationType === t ? "" : t)}
                >
                  <Text style={[styles.chipText, filtrationType === t && { color: "#fff" }]}>{t}</Text>
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
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
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
                <Text style={styles.primaryBtnText}>Save Pool</Text>
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
            <Text style={styles.successTitle}>Pool Onboarded!</Text>
            <Text style={styles.successSubtitle}>
              {createdPool?.name || "The pool"} has been added for{" "}
              <Text style={{ fontWeight: "700" }}>{selectedClient?.name}</Text>.
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
              <Text style={[styles.outlineBtnText, { color: themeColor }]}>Onboard Another Pool</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    gap: 0,
  },
  progressStep: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  progressStepText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  progressLine: {
    width: 60,
    height: 2,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 4,
  },
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    lineHeight: 20,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 16,
  },
  searchIcon: {
    marginLeft: 12,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    height: 46,
    fontSize: 15,
    color: "#111827",
    paddingHorizontal: 8,
  },
  noResultsText: {
    textAlign: "center",
    color: "#9ca3af",
    fontSize: 14,
    paddingVertical: 16,
  },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  clientAvatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  clientInfo: { flex: 1 },
  clientName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  clientContact: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    gap: 10,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#e5e7eb",
  },
  dividerText: {
    fontSize: 13,
    color: "#9ca3af",
    fontWeight: "500",
  },
  newClientBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    paddingVertical: 14,
  },
  newClientBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  newClientForm: {
    marginTop: 4,
  },
  backToSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  backToSearchText: {
    fontSize: 14,
    color: "#6b7280",
  },
  formLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#111827",
  },
  textArea: {
    height: 80,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addressInput: {
    flex: 1,
  },
  locationBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  locationHint: {
    fontSize: 12,
    fontWeight: "500",
    marginTop: 4,
    marginLeft: 2,
  },
  selectedClientBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 20,
  },
  selectedClientText: {
    fontSize: 14,
    fontWeight: "600",
  },
  chipRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: "hidden",
  },
  photoThumbImage: {
    width: 80,
    height: 80,
    borderRadius: 10,
  },
  photoRemoveBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#fff",
    borderRadius: 10,
  },
  addPhotoBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderStyle: "dashed",
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  addPhotoText: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "500",
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  outlineBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
    textAlign: "center",
  },
  successSubtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
  },
});
