import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";

export default function AddPoolScreen() {
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    poolType: "",
    filtrationType: "",
    volume: "",
    surfaceType: "",
    dimensions: {
      length: "",
      width: "",
      depth: "",
    },
    notes: "",
  });
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const poolTypes = [
    "Infinity Pool",
    "Skimmer Pool",
    "Skimmerless Pool",
    "Outdoor Spa",
    "Indoor Pool",
    "Lap Pool",
    "Plunge Pool",
  ];

  const filtrationTypes = [
    "Chlorine",
    "Saltwater",
    "Freshwater",
    "Bromine",
    "Mineral",
  ];

  const surfaceTypes = [
    "Tile",
    "Plaster",
    "Pebble",
    "Vinyl",
    "Fiberglass",
  ];

  const requestImagePermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "We need access to your photos to add pool images."
      );
      return false;
    }
    return true;
  };

  const handlePickImage = async () => {
    const hasPermission = await requestImagePermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotos([...photos, result.assets[0].uri]);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "We need access to your camera to take photos."
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotos([...photos, result.assets[0].uri]);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to take photo. Please try again.");
    }
  };

  const handleRemovePhoto = (index: number) => {
    Alert.alert(
      "Remove Photo",
      "Are you sure you want to remove this photo?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setPhotos(photos.filter((_, i) => i !== index));
          },
        },
      ]
    );
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.name.trim()) {
      Alert.alert("Error", "Please enter a pool name.");
      return;
    }
    if (!formData.address.trim()) {
      Alert.alert("Error", "Please enter the pool address.");
      return;
    }
    if (!formData.poolType) {
      Alert.alert("Error", "Please select a pool type.");
      return;
    }
    if (!formData.filtrationType) {
      Alert.alert("Error", "Please select a filtration type.");
      return;
    }

    setLoading(true);
    
    // In production, call API to create pool with photos
    // The photos will need to be uploaded to a file storage service first
    // const uploadedPhotos = await uploadPhotos(photos);
    // await createPool({ ...formData, photos: uploadedPhotos, status: 'pending_approval' });
    
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        "Pool Submitted",
        "Your pool has been submitted for admin approval. You'll be notified once it's approved.",
        [
          {
            text: "OK",
            onPress: () => router.back(),
          },
        ]
      );
    }, 1000);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Pool</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Basic Information */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Pool Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Main Pool, Infinity Pool"
                placeholderTextColor="#9ca3af"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter pool address"
                placeholderTextColor="#9ca3af"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
              />
            </View>
          </View>

          {/* Pool Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pool Type *</Text>
            <View style={styles.optionsGrid}>
              {poolTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.optionButton,
                    formData.poolType === type && styles.optionButtonSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, poolType: type })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.poolType === type && styles.optionTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Filtration Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Filtration Type *</Text>
            <View style={styles.optionsGrid}>
              {filtrationTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.optionButton,
                    formData.filtrationType === type && styles.optionButtonSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, filtrationType: type })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.filtrationType === type && styles.optionTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Surface Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Surface Type</Text>
            <View style={styles.optionsGrid}>
              {surfaceTypes.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.optionButton,
                    formData.surfaceType === type && styles.optionButtonSelected,
                  ]}
                  onPress={() => setFormData({ ...formData, surfaceType: type })}
                >
                  <Text
                    style={[
                      styles.optionText,
                      formData.surfaceType === type && styles.optionTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Dimensions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Dimensions (Optional)</Text>
            <View style={styles.dimensionsRow}>
              <View style={styles.dimensionInput}>
                <Text style={styles.label}>Length (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                  value={formData.dimensions.length}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      dimensions: { ...formData.dimensions, length: text },
                    })
                  }
                />
              </View>
              <View style={styles.dimensionInput}>
                <Text style={styles.label}>Width (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                  value={formData.dimensions.width}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      dimensions: { ...formData.dimensions, width: text },
                    })
                  }
                />
              </View>
              <View style={styles.dimensionInput}>
                <Text style={styles.label}>Depth (m)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                  value={formData.dimensions.depth}
                  onChangeText={(text) =>
                    setFormData({
                      ...formData,
                      dimensions: { ...formData.dimensions, depth: text },
                    })
                  }
                />
              </View>
            </View>
          </View>

          {/* Volume */}
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Volume (Liters)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 45000"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={formData.volume}
                onChangeText={(text) => setFormData({ ...formData, volume: text })}
              />
            </View>
          </View>

          {/* Photos */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pool Photos</Text>
            <Text style={styles.sectionSubtitle}>
              Add photos of your pool. These will be reviewed by admin for approval.
            </Text>
            
            {/* Photo Grid */}
            {photos.length > 0 && (
              <View style={styles.photosGrid}>
                {photos.map((photo, index) => (
                  <View key={index} style={styles.photoContainer}>
                    <Image source={{ uri: photo }} style={styles.photo} />
                    <TouchableOpacity
                      style={styles.removePhotoButton}
                      onPress={() => handleRemovePhoto(index)}
                    >
                      <Ionicons name="close-circle" size={24} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add Photo Buttons */}
            <View style={styles.addPhotoButtons}>
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={handlePickImage}
              >
                <Ionicons name="image-outline" size={24} color="#14b8a6" />
                <Text style={styles.addPhotoButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={handleTakePhoto}
              >
                <Ionicons name="camera-outline" size={24} color="#14b8a6" />
                <Text style={styles.addPhotoButtonText}>Take Photo</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Additional Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Any additional information about the pool..."
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={4}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                textAlignVertical="top"
              />
            </View>
          </View>

          {/* Approval Notice */}
          <View style={styles.noticeCard}>
            <Ionicons name="information-circle-outline" size={24} color="#14b8a6" />
            <View style={styles.noticeContent}>
              <Text style={styles.noticeTitle}>Admin Approval Required</Text>
              <Text style={styles.noticeText}>
                Your pool submission will be reviewed by our admin team. You'll receive a notification once it's approved.
              </Text>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.submitButtonText}>
              {loading ? "Adding Pool..." : "Add Pool"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  textArea: {
    minHeight: 100,
    paddingTop: 16,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  optionButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  optionButtonSelected: {
    backgroundColor: "#14b8a6",
    borderColor: "#14b8a6",
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  optionTextSelected: {
    color: "#ffffff",
  },
  dimensionsRow: {
    flexDirection: "row",
    gap: 12,
  },
  dimensionInput: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: "#14b8a6",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#6b7280",
    marginBottom: 16,
    lineHeight: 18,
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  photoContainer: {
    width: "30%",
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  removePhotoButton: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
  },
  addPhotoButtons: {
    flexDirection: "row",
    gap: 12,
  },
  addPhotoButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#14b8a6",
    backgroundColor: "#ffffff",
  },
  addPhotoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#14b8a615",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#14b8a630",
  },
  noticeContent: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
});

