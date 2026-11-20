/**
 * PoolCare Checklist Wizard Component
 * Step-by-step checklist with optional photo capture per step
 */

import React, { useState, useRef, useEffect } from "react";
import { api } from "../lib/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Animated,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, SHADOWS } from "../theme";

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  category: string;
  requiresNumericInput?: boolean;
  numericField?: string;
  min?: number;
  max?: number;
  allowsNotApplicable?: boolean;
  requiresPhoto?: boolean; // Photo is mandatory for this step
  allowsPhoto?: boolean; // Photo is optional for this step
  // Runtime state
  completed?: boolean;
  value?: number | string;
  notApplicable?: boolean;
  comment?: string;
  photoUri?: string;
  /** All photos captured for this step — photoUri stays as the first for back-compat */
  photoUris?: string[];
}

interface ReadingsState {
  ph?: number;
  chlorineFree?: number;
  chlorineTotal?: number;
  alkalinity?: number;
  calciumHardness?: number;
  cyanuricAcid?: number;
  tempC?: number;
  tds?: number;
  salinity?: number;
}

interface Chemical {
  name: string;
  qty: string;
  unit: string;
}

export type ReadingMode = "required" | "optional" | "hidden";

interface ChecklistWizardProps {
  items: ChecklistItem[];
  onComplete: (items: ChecklistItem[], beforeReadings: ReadingsState, afterReadings: ReadingsState, chemicals: Chemical[]) => void | Promise<void>;
  onPhotoUpload?: (uri: string, itemId: string) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
  initialBeforeReadings?: ReadingsState;
  initialAfterReadings?: ReadingsState;
  /** Org-configured reading modes (Settings → Visits in the admin console). */
  readingsConfig?: Record<string, ReadingMode>;
  /** Whether carers may pick visit photos from the gallery (Settings → Visits). */
  allowGalleryPhotos?: boolean;
  /**
   * Storage key for in-progress state. The checklist is only sent to the server
   * on completion, so without this a killed app (common on Android while the
   * camera is open) loses every ticked step and photo. Cleared by the parent
   * once the visit completes — see clearWizardProgress().
   */
  persistKey?: string;
}

// Hard limits the API enforces (apps/api/src/visits/dto/add-reading.dto.ts).
// Values outside these are rejected on save, so block them at entry instead of
// failing the whole visit at "Complete".
const READING_LIMITS: Partial<Record<keyof ReadingsState, { min: number; max?: number }>> = {
  ph: { min: 6.2, max: 8.6 },
  chlorineFree: { min: 0, max: 10 },
  chlorineTotal: { min: 0, max: 10 },
  alkalinity: { min: 40, max: 240 },
  calciumHardness: { min: 100, max: 600 },
  cyanuricAcid: { min: 0, max: 120 },
  tempC: { min: 0, max: 45 },
  tds: { min: 0 },
  salinity: { min: 0 },
};
const outsideLimits = (key: string, v: unknown) => {
  const lim = (READING_LIMITS as any)[key];
  if (!lim || typeof v !== "number" || isNaN(v)) return false;
  return v < lim.min || (lim.max !== undefined && v > lim.max);
};

// Catalog of all supported readings; the org config decides which are shown/required
const READING_FIELDS: Array<{
  key: keyof ReadingsState;
  label: string;
  placeholder: string;
  unit?: string;
  range?: { min: number; max: number };
}> = [
  { key: "ph", label: "pH Level", placeholder: "7.2 - 7.6", range: { min: 7.0, max: 8.0 } },
  { key: "chlorineFree", label: "Free Chlorine", placeholder: "1.0 - 3.0 ppm", unit: "ppm", range: { min: 1.0, max: 3.0 } },
  { key: "alkalinity", label: "Total Alkalinity", placeholder: "80 - 120 ppm", unit: "ppm", range: { min: 80, max: 120 } },
  { key: "tempC", label: "Temperature", placeholder: "°C", unit: "°C" },
  { key: "calciumHardness", label: "Calcium Hardness", placeholder: "200 - 400 ppm", unit: "ppm" },
  { key: "cyanuricAcid", label: "Cyanuric Acid", placeholder: "30 - 50 ppm", unit: "ppm" },
  { key: "tds", label: "TDS", placeholder: "Total Dissolved Solids", unit: "ppm" },
  { key: "salinity", label: "Salinity", placeholder: "Saltwater pools", unit: "ppm" },
];

const DEFAULT_READINGS_CONFIG: Record<string, ReadingMode> = {
  ph: "required",
  chlorineFree: "optional",
  alkalinity: "optional",
  tempC: "optional",
  calciumHardness: "optional",
  cyanuricAcid: "optional",
  tds: "optional",
  salinity: "optional",
};

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  cleaning: "water",
  chemistry: "flask",
  equipment: "construct",
  safety: "shield-checkmark",
  maintenance: "build",
  documentation: "camera",
};

// One calm accent for every category (the label carries the meaning)
const CATEGORY_COLORS: Record<string, string> = {
  cleaning: COLORS.primary[600],
  chemistry: COLORS.primary[600],
  equipment: COLORS.primary[600],
  safety: COLORS.primary[600],
  maintenance: COLORS.primary[600],
  documentation: COLORS.primary[600],
};

// 0 is a real reading (e.g. no free chlorine) — only blank counts as missing
const isEntered = (v: unknown) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && isNaN(v));

export const wizardProgressKey = (visitId: string) => `wizard_progress:${visitId}`;
export const clearWizardProgress = (visitId: string) =>
  AsyncStorage.removeItem(wizardProgressKey(visitId)).catch(() => {});

export const ChecklistWizard: React.FC<ChecklistWizardProps> = ({
  items,
  onComplete,
  onPhotoUpload,
  onCancel,
  disabled = false,
  initialBeforeReadings = {},
  initialAfterReadings = {},
  readingsConfig,
  allowGalleryPhotos = true,
  persistKey,
}) => {
  const readingModes = { ...DEFAULT_READINGS_CONFIG, ...(readingsConfig || {}) };
  const visibleReadingFields = READING_FIELDS.filter((f) => readingModes[f.key] !== "hidden");
  const requiredReadingKeys = visibleReadingFields
    .filter((f) => readingModes[f.key] === "required")
    .map((f) => f.key);
  const [currentStep, setCurrentStep] = useState(0);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(items);
  const [beforeReadings, setBeforeReadings] = useState<ReadingsState>(initialBeforeReadings);
  const [afterReadings, setAfterReadings] = useState<ReadingsState>(initialAfterReadings);
  const [showReadingsPhase, setShowReadingsPhase] = useState<"before" | "after" | "chemicals" | null>("before");
  // Set when the final step sends the carer back to fix a reading, so finishing
  // that readings screen returns straight to the chemicals step.
  const [returnToChemicals, setReturnToChemicals] = useState(false);
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  // Rate-card chemicals: picking one keeps names consistent so usage can be
  // priced against the client's chemical allowance.
  const [chemicalOptions, setChemicalOptions] = useState<Array<{ key: string; label: string; unit: "kg" | "L" }>>([]);
  useEffect(() => {
    api.getChemicalRates().then(setChemicalOptions).catch(() => setChemicalOptions([]));
  }, []);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Guards the final submit — a second tap would save readings/chemicals twice
  const [submitting, setSubmitting] = useState(false);
  // "Not applicable" reason entry (Alert.prompt is iOS-only and crashes Android)
  const [naReasonOpen, setNaReasonOpen] = useState(false);
  const [naReason, setNaReason] = useState("");

  // Restore saved progress once, then save every change
  const [restored, setRestored] = useState(!persistKey);
  useEffect(() => {
    if (!persistKey) return;
    let cancelled = false;
    AsyncStorage.getItem(persistKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.items)) {
          const byId = new Map<string, any>(saved.items.map((i: any) => [i.id, i]));
          setChecklistItems((prev) =>
            prev.map((item) => {
              const s = byId.get(item.id);
              if (!s) return item;
              return {
                ...item,
                completed: s.completed,
                notApplicable: s.notApplicable,
                comment: s.comment,
                value: s.value,
                photoUri: s.photoUri,
                photoUris: s.photoUris,
              };
            })
          );
        }
        if (saved.beforeReadings) setBeforeReadings(saved.beforeReadings);
        if (saved.afterReadings) setAfterReadings(saved.afterReadings);
        if (Array.isArray(saved.chemicals)) setChemicals(saved.chemicals);
        if (typeof saved.currentStep === "number") setCurrentStep(saved.currentStep);
        if (saved.phase !== undefined) setShowReadingsPhase(saved.phase);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRestored(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  useEffect(() => {
    if (!persistKey || !restored) return;
    const items = checklistItems.map(({ id, completed, notApplicable, comment, value, photoUri, photoUris }) => ({
      id, completed, notApplicable, comment, value, photoUri, photoUris,
    }));
    AsyncStorage.setItem(
      persistKey,
      JSON.stringify({ items, beforeReadings, afterReadings, chemicals, currentStep, phase: showReadingsPhase })
    ).catch(() => {});
  }, [persistKey, restored, checklistItems, beforeReadings, afterReadings, chemicals, currentStep, showReadingsPhase]);
  
  const slideAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const totalSteps = checklistItems.length;
  const currentItem = checklistItems[currentStep];
  const completedCount = checklistItems.filter(
    (item) => item.completed || item.notApplicable
  ).length;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: completedCount / totalSteps,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [completedCount, totalSteps]);

  const animateTransition = (direction: "next" | "prev") => {
    const toValue = direction === "next" ? -50 : 50;
    Animated.sequence([
      Animated.timing(slideAnim, {
        toValue,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleNext = (items: ChecklistItem[] = checklistItems) => {
    if (currentStep < totalSteps - 1) {
      animateTransition("next");
      setCurrentStep(currentStep + 1);
    } else {
      // Last step — required steps skipped with the arrows must be done first
      const missingIdx = findIncompleteRequired(items);
      if (missingIdx !== -1) {
        Alert.alert(
          "Steps still to do",
          `"${items[missingIdx].label}" is required. Complete it or mark it not applicable before finishing.`,
        );
        animateTransition("prev");
        setCurrentStep(missingIdx);
        return;
      }
      setShowReadingsPhase("after");
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      animateTransition("prev");
      setCurrentStep(currentStep - 1);
    } else if (showReadingsPhase === null) {
      // First step - go back to before readings
      setShowReadingsPhase("before");
    }
  };

  const handleComplete = () => {
    // Mark current item as completed
    const updatedItems = [...checklistItems];
    updatedItems[currentStep] = { ...currentItem, completed: true };
    setChecklistItems(updatedItems);
    handleNext(updatedItems);
  };

  const handleMarkNotApplicable = () => {
    if (!currentItem.allowsNotApplicable) {
      Alert.alert("Required", "This item cannot be marked as not applicable.");
      return;
    }

    setNaReason("");
    setNaReasonOpen(true);
  };

  const confirmNotApplicable = () => {
    const updatedItems = [...checklistItems];
    updatedItems[currentStep] = {
      ...currentItem,
      notApplicable: true,
      comment: naReason.trim() || "Not applicable",
    };
    setChecklistItems(updatedItems);
    setNaReasonOpen(false);
    handleNext(updatedItems);
  };

  const handleNumericInput = (value: string) => {
    const numValue = parseFloat(value);
    const updatedItems = [...checklistItems];
    updatedItems[currentStep] = {
      ...currentItem,
      value: isNaN(numValue) ? undefined : numValue,
    };
    setChecklistItems(updatedItems);
  };

  // When gallery photos are disabled by the org, a broken/blocked camera would
  // dead-end the checklist — so offer gallery as an explicit fallback.
  const offerGalleryFallback = (reason: string) => {
    if (allowGalleryPhotos) {
      Alert.alert("Camera Problem", reason);
      return;
    }
    Alert.alert(
      "Camera Problem",
      `${reason}\n\nYour organization requires photos taken with the camera, but you can use the gallery as a fallback when the camera isn't working.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Use Gallery", onPress: () => handleSelectFromGallery() },
      ],
    );
  };

  // An unuploaded photo must not count toward a step's photo requirement
  const dropPhoto = (uri: string) => {
    setChecklistItems((prev) =>
      prev.map((item, i) => {
        if (i !== currentStep) return item;
        const photoUris = (item.photoUris || []).filter((u) => u !== uri);
        return { ...item, photoUris, photoUri: photoUris[0] };
      })
    );
  };

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        offerGalleryFallback("Camera permission is needed to take photos.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingPhoto(true);
        const uri = result.assets[0].uri;

        // Update local state
        const updatedItems = [...checklistItems];
        updatedItems[currentStep] = {
          ...currentItem,
          photoUri: currentItem.photoUri || uri,
          photoUris: [...(currentItem.photoUris || []), uri],
        };
        setChecklistItems(updatedItems);

        // Upload if handler provided
        if (onPhotoUpload) {
          try {
            await onPhotoUpload(uri, currentItem.id);
          } catch {
            dropPhoto(uri);
            setUploadingPhoto(false);
            Alert.alert("Upload failed", "The photo didn't upload. Check your connection and take it again.");
            return;
          }
        }
        setUploadingPhoto(false);
      }
    } catch (error) {
      setUploadingPhoto(false);
      offerGalleryFallback("Failed to take photo. Please try again.");
    }
  };

  const handleSelectFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Media library permission is needed.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingPhoto(true);
        const uri = result.assets[0].uri;
        
        const updatedItems = [...checklistItems];
        updatedItems[currentStep] = {
          ...currentItem,
          photoUri: currentItem.photoUri || uri,
          photoUris: [...(currentItem.photoUris || []), uri],
        };
        setChecklistItems(updatedItems);

        if (onPhotoUpload) {
          try {
            await onPhotoUpload(uri, currentItem.id);
          } catch {
            dropPhoto(uri);
            setUploadingPhoto(false);
            Alert.alert("Upload failed", "The photo didn't upload. Check your connection and try again.");
            return;
          }
        }
        setUploadingPhoto(false);
      }
    } catch (error) {
      setUploadingPhoto(false);
      Alert.alert("Error", "Failed to select photo. Please try again.");
    }
  };

  const firstInvalidReading = (r: ReadingsState) => {
    const field = visibleReadingFields.find((f) => outsideLimits(f.key as string, (r as any)[f.key]));
    if (!field) return null;
    const lim = READING_LIMITS[field.key]!;
    const range = lim.max !== undefined ? `between ${lim.min} and ${lim.max}` : `${lim.min} or more`;
    return `${field.label} is ${(r as any)[field.key]}${field.unit ? ` ${field.unit}` : ""} but must be ${range}.`;
  };

  const handleFinishReadings = () => {
    if (showReadingsPhase === "before") {
      if (returnToChemicals) {
        setReturnToChemicals(false);
        setShowReadingsPhase("chemicals");
        return;
      }
      setShowReadingsPhase(null);
      setCurrentStep(0);
    } else if (showReadingsPhase === "after") {
      setShowReadingsPhase("chemicals");
    } else if (showReadingsPhase === "chemicals") {
      if (submitting) return;
      // Before-service readings were entered at the start of the visit (and may
      // have been restored from saved progress) — re-check both sets here so a
      // bad value can't fail the whole completion on the server.
      const badBefore = firstInvalidReading(beforeReadings);
      const badAfter = firstInvalidReading(afterReadings);
      if (badBefore || badAfter) {
        Alert.alert(
          "Check your readings",
          `${badBefore ? `Before service: ${badBefore}` : `After service: ${badAfter}`}\n\nPlease correct it to complete the visit.`,
          [
            {
              text: "Fix it",
              onPress: () => {
                if (badBefore) {
                  setReturnToChemicals(true);
                  setShowReadingsPhase("before");
                } else {
                  setShowReadingsPhase("after");
                }
              },
            },
          ]
        );
        return;
      }
      setSubmitting(true);
      Promise.resolve(onComplete(checklistItems, beforeReadings, afterReadings, chemicals))
        .finally(() => setSubmitting(false));
    }
  };

  const handleAddChemical = () => {
    setChemicals([...chemicals, { name: "", qty: "", unit: "ml" }]);
  };

  const handleRemoveChemical = (index: number) => {
    setChemicals(chemicals.filter((_, i) => i !== index));
  };

  const handleUpdateChemical = (index: number, field: keyof Chemical, value: string) => {
    const updated = [...chemicals];
    updated[index] = { ...updated[index], [field]: value };
    setChemicals(updated);
  };

  const isCurrentItemValid = () => {
    if (currentItem.notApplicable) return true;
    if (currentItem.requiresNumericInput && !isEntered(currentItem.value)) return false;
    if (currentItem.requiresPhoto && !currentItem.photoUri && !(currentItem.photoUris?.length)) return false;
    return true;
  };

  const isItemDone = (item: ChecklistItem) => {
    if (item.notApplicable) return true;
    if (!item.required && !item.completed) return true;
    if (item.requiresNumericInput && !isEntered(item.value)) return false;
    if (item.requiresPhoto && !item.photoUri && !(item.photoUris?.length)) return false;
    return !!item.completed;
  };

  function findIncompleteRequired(items: ChecklistItem[]) {
    return items.findIndex((item) => !isItemDone(item));
  }

  const canFinish = () => findIncompleteRequired(checklistItems) === -1;

  // Render chemicals phase
  if (showReadingsPhase === "chemicals") {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.phaseIndicator}>
            <View style={styles.phaseDot} />
            <View style={styles.phaseLine} />
            <View style={styles.phaseDot} />
            <View style={styles.phaseLine} />
            <View style={[styles.phaseDot, styles.phaseDotActive]} />
          </View>
          <Text style={styles.phaseLabel}>Chemicals used</Text>
          <Text style={styles.phaseSubtitle}>
            Record any chemicals added during service
          </Text>
        </View>

        <ScrollView style={styles.readingsScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.chemicalsContainer}>
            {chemicals.length === 0 ? (
              <View style={styles.emptyChemicals}>
                <Ionicons name="flask-outline" size={48} color={COLORS.neutral[400]} />
                <Text style={styles.emptyChemicalsText}>No chemicals recorded</Text>
                <Text style={styles.emptyChemicalsSubtext}>
                  Add anything you dosed. Skip if you added nothing.
                </Text>
              </View>
            ) : (
              chemicals.map((chemical, index) => (
                <View key={index} style={styles.chemicalItem}>
                  <View style={styles.chemicalInputRow}>
                    <View style={styles.chemicalNameInput}>
                      <Text style={styles.inputLabel}>Chemical Name</Text>
                      {chemicalOptions.length > 0 && (
                        <View style={[styles.unitSelector, { flexWrap: "wrap", marginBottom: SPACING.sm }]}>
                          {chemicalOptions.map((opt) => (
                            <TouchableOpacity
                              key={opt.key}
                              style={[styles.unitOption, chemical.name === opt.label && styles.unitOptionActive]}
                              onPress={() => {
                                const updated = [...chemicals];
                                updated[index] = { ...updated[index], name: opt.label, unit: opt.unit === "kg" ? "g" : "ml" };
                                setChemicals(updated);
                              }}
                              disabled={disabled}
                            >
                              <Text style={[styles.unitOptionText, chemical.name === opt.label && styles.unitOptionTextActive]}>
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                      <TextInput
                        style={styles.textInput}
                        placeholder={chemicalOptions.length ? "Or type another chemical" : "e.g., Chlorine, pH Plus"}
                        value={chemical.name}
                        onChangeText={(text) => handleUpdateChemical(index, "name", text)}
                        editable={!disabled}
                      />
                    </View>
                    <TouchableOpacity
                      style={styles.removeChemicalButton}
                      onPress={() => handleRemoveChemical(index)}
                      disabled={disabled}
                    >
                      <Ionicons name="close-circle" size={24} color={COLORS.error[500]} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.chemicalQtyRow}>
                    <View style={styles.chemicalQtyInput}>
                      <Text style={styles.inputLabel}>Quantity</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="0"
                        value={chemical.qty}
                        onChangeText={(text) => handleUpdateChemical(index, "qty", text)}
                        keyboardType="decimal-pad"
                        editable={!disabled}
                      />
                    </View>
                    <View style={styles.chemicalUnitInput}>
                      <Text style={styles.inputLabel}>Unit</Text>
                      <View style={styles.unitSelector}>
                        {["ml", "L", "kg", "g"].map((unit) => (
                          <TouchableOpacity
                            key={unit}
                            style={[
                              styles.unitOption,
                              chemical.unit === unit && styles.unitOptionActive,
                            ]}
                            onPress={() => handleUpdateChemical(index, "unit", unit)}
                            disabled={disabled}
                          >
                            <Text
                              style={[
                                styles.unitOptionText,
                                chemical.unit === unit && styles.unitOptionTextActive,
                              ]}
                            >
                              {unit}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity
              style={styles.addChemicalButton}
              onPress={handleAddChemical}
              disabled={disabled}
            >
              <Ionicons name="add-circle" size={24} color={COLORS.primary[500]} />
              <Text style={styles.addChemicalButtonText}>Add chemical</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.readingsFooter}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setShowReadingsPhase("after")}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.primary[500]} />
            <Text style={styles.secondaryButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
            onPress={handleFinishReadings}
            disabled={submitting}
          >
            <Text style={styles.primaryButtonText}>{submitting ? "Saving…" : "Complete visit"}</Text>
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.text.inverse} />
            ) : (
              <Ionicons name="checkmark-circle" size={20} color={COLORS.text.inverse} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Render readings phase
  if (showReadingsPhase) {
    const isAfter = showReadingsPhase === "after";
    const readings = isAfter ? afterReadings : beforeReadings;
    const setReadings = isAfter ? setAfterReadings : setBeforeReadings;
    const invalidReading = visibleReadingFields.some((f) => outsideLimits(f.key as string, (readings as any)[f.key]));
    const missingRequired =
      requiredReadingKeys.some((k) => !isEntered((readings as any)[k])) || invalidReading;

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <View style={styles.phaseIndicator}>
            <View style={[styles.phaseDot, !isAfter && styles.phaseDotActive]} />
            <View style={styles.phaseLine} />
            <View style={[styles.phaseDot, isAfter && styles.phaseDotActive]} />
            {isAfter && (
              <>
                <View style={styles.phaseLine} />
                <View style={styles.phaseDot} />
              </>
            )}
          </View>
          <Text style={styles.phaseLabel}>
            {isAfter ? "Water after service" : "Water before service"}
          </Text>
          <Text style={styles.phaseSubtitle}>
            {isAfter
              ? "Test again after treating. Leave optional ones blank if not measured."
              : "Test the water as you found it. Leave optional ones blank if not measured."}
          </Text>
        </View>

        <ScrollView style={styles.readingsScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.readingsGrid}>
            {visibleReadingFields.map((field) => (
              <ReadingInput
                key={field.key}
                label={field.label}
                value={(readings as any)[field.key]}
                onChange={(v) => setReadings({ ...readings, [field.key]: v })}
                placeholder={field.placeholder}
                unit={field.unit}
                range={field.range}
                limits={READING_LIMITS[field.key]}
                optional={readingModes[field.key] === "optional"}
              />
            ))}
          </View>
        </ScrollView>

        <View style={styles.readingsFooter}>
          {isAfter ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowReadingsPhase(null)}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.primary[500]} />
              <Text style={styles.secondaryButtonText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
              <Ionicons name="close" size={20} color={COLORS.neutral[500]} />
              <Text style={[styles.secondaryButtonText, { color: COLORS.neutral[500] }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.primaryButton, missingRequired && styles.primaryButtonDisabled]}
            onPress={handleFinishReadings}
            disabled={missingRequired}
          >
            <Text style={styles.primaryButtonText}>
              {isAfter ? "Chemicals" : "Start checklist"}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.text.inverse} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // Render main checklist wizard
  return (
    <View style={styles.container}>
      {/* Progress Header */}
      <View style={styles.progressHeader}>
        <View style={styles.progressInfo}>
          <Text style={styles.stepCounter}>
            Step {currentStep + 1} of {totalSteps}
          </Text>
          <Text style={styles.progressText}>
            {completedCount} of {totalSteps} completed
          </Text>
        </View>
        <View style={styles.progressBarContainer}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              },
            ]}
          />
        </View>
      </View>

      {/* Category Badge */}
      <View
        style={[
          styles.categoryBadge,
          { backgroundColor: "#e6f0ea" },
        ]}
      >
        <Ionicons
          name={CATEGORY_ICONS[currentItem.category] || "checkbox"}
          size={16}
          color={CATEGORY_COLORS[currentItem.category]}
        />
        <Text
          style={[
            styles.categoryText,
            { color: CATEGORY_COLORS[currentItem.category] },
          ]}
        >
          {currentItem.category.charAt(0).toUpperCase() + currentItem.category.slice(1)}
        </Text>
      </View>

      {/* Main Content */}
      <Animated.View
        style={[styles.contentCard, { transform: [{ translateX: slideAnim }] }]}
      >
        <View style={styles.taskHeader}>
          {currentItem.required && (
            <View style={styles.requiredBadge}>
              <Text style={styles.requiredText}>Required</Text>
            </View>
          )}
          <Text style={styles.taskLabel}>{currentItem.label}</Text>
        </View>

        {/* Numeric Input (if required) */}
        {currentItem.requiresNumericInput && (
          <View style={styles.numericInputContainer}>
            <TextInput
              style={styles.numericInput}
              placeholder={`Enter ${currentItem.numericField || "value"}`}
              keyboardType="decimal-pad"
              value={currentItem.value?.toString() || ""}
              onChangeText={handleNumericInput}
              editable={!disabled}
            />
            {currentItem.min !== undefined && currentItem.max !== undefined && (
              <Text style={styles.rangeHint}>
                Normal range: {currentItem.min} - {currentItem.max}
              </Text>
            )}
          </View>
        )}

        {/* Photo Section - shown for required photos, optional photos, or documentation category */}
        {(currentItem.requiresPhoto || currentItem.allowsPhoto || currentItem.category === "documentation") && (
          <View style={styles.photoSection}>
            {/* Optional photo label */}
            {currentItem.allowsPhoto && !currentItem.requiresPhoto && (
              <Text style={styles.optionalPhotoLabel}>Photo (optional)</Text>
            )}
            {(currentItem.photoUris?.length ?? 0) > 0 && (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.photoThumbRow}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {currentItem.photoUris!.map((uri, i) => (
                    <Image key={`${uri}-${i}`} source={{ uri }} style={styles.photoThumb} />
                  ))}
                </ScrollView>
                <Text style={styles.photoCountText}>
                  {currentItem.photoUris!.length} photo{currentItem.photoUris!.length !== 1 ? "s" : ""} added
                </Text>
              </>
            )}
            <View style={styles.photoActions}>
              <TouchableOpacity
                style={[
                  styles.photoButton,
                  currentItem.allowsPhoto && !currentItem.requiresPhoto && styles.photoButtonOptional
                ]}
                onPress={handleTakePhoto}
                disabled={disabled || uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color={COLORS.primary[500]} />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={28} color={INK} />
                    <Text style={styles.photoButtonText}>
                      {(currentItem.photoUris?.length ?? 0) > 0 ? "Add another" : "Take photo"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {allowGalleryPhotos && (
                <TouchableOpacity
                  style={[
                    styles.photoButton,
                    currentItem.allowsPhoto && !currentItem.requiresPhoto && styles.photoButtonOptional
                  ]}
                  onPress={handleSelectFromGallery}
                  disabled={disabled || uploadingPhoto}
                >
                  <Ionicons name="images-outline" size={28} color={INK} />
                  <Text style={styles.photoButtonText}>Gallery</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </Animated.View>

      {/* Footer Actions */}
      <View style={styles.footer}>
        <View style={styles.footerTop}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={handlePrev}
            disabled={currentStep === 0}
          >
            <Ionicons
              name="chevron-back"
              size={24}
              color={currentStep === 0 ? COLORS.neutral[300] : COLORS.primary[500]}
            />
          </TouchableOpacity>

          {currentItem.allowsNotApplicable && !disabled && (
            <TouchableOpacity style={styles.naButton} onPress={handleMarkNotApplicable}>
              <Text style={styles.naButtonText}>Doesn't apply</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => handleNext()}
            disabled={currentStep === totalSteps - 1 && !canFinish()}
          >
            <Ionicons
              name="chevron-forward"
              size={24}
              color={
                currentStep === totalSteps - 1 && !canFinish()
                  ? COLORS.neutral[300]
                  : COLORS.primary[500]
              }
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.completeStepButton,
            (!isCurrentItemValid() || disabled) && styles.completeStepButtonDisabled,
            currentItem.completed && styles.completeStepButtonDone,
          ]}
          onPress={handleComplete}
          disabled={!isCurrentItemValid() || disabled}
        >
          {currentItem.completed ? (
            <>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.text.inverse} />
              <Text style={styles.completeStepButtonText}>Done · next</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark" size={24} color={COLORS.text.inverse} />
              <Text style={styles.completeStepButtonText}>
                {currentStep === totalSteps - 1 ? "Mark done & finish" : "Mark done"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Not-applicable reason (cross-platform replacement for Alert.prompt) */}
      <Modal visible={naReasonOpen} transparent animationType="fade" onRequestClose={() => setNaReasonOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.naModalBackdrop}
        >
          <View style={styles.naModalCard}>
            <Text style={styles.naModalTitle}>Not applicable</Text>
            <Text style={styles.naModalSubtitle}>Why doesn't "{currentItem.label}" apply?</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Reason (optional)"
              placeholderTextColor={COLORS.neutral[400]}
              value={naReason}
              onChangeText={setNaReason}
              autoFocus
            />
            <View style={styles.naModalActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => setNaReasonOpen(false)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={confirmNotApplicable}>
                <Text style={styles.primaryButtonText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

// Reading Input Component
interface ReadingInputProps {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  unit?: string;
  optional?: boolean;
  range?: { min: number; max: number };
  limits?: { min: number; max?: number };
}

const ReadingInput: React.FC<ReadingInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  unit,
  optional,
  range,
  limits,
}) => {
  // Keep the raw text locally: parsing on every keystroke ("7." → 7 → "7")
  // used to erase the decimal point the moment it was typed.
  const [text, setText] = useState(value !== undefined ? String(value) : "");

  useEffect(() => {
    // Sync external resets (e.g. moving between before/after phases)
    if (value === undefined && text !== "") setText("");
    if (value !== undefined && text === "") setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChangeText = (t: string) => {
    // Some Android keyboards emit a comma for the decimal separator
    const cleaned = t.replace(",", ".").replace(/[^0-9.]/g, "");
    setText(cleaned);
    const parsed = parseFloat(cleaned);
    onChange(cleaned === "" || isNaN(parsed) ? undefined : parsed);
  };

  const isInvalid =
    !!limits && value !== undefined && (value < limits.min || (limits.max !== undefined && value > limits.max));
  const isOutOfRange =
    !isInvalid && range && value !== undefined && (value < range.min || value > range.max);

  return (
    <View style={styles.readingInputContainer}>
      <View style={styles.readingLabelRow}>
        <Text style={styles.readingLabel}>{label}</Text>
        {optional && <Text style={styles.optionalTag}>Optional</Text>}
      </View>
      <View
        style={[
          styles.readingInputWrapper,
          isOutOfRange && styles.readingInputWarning,
          isInvalid && styles.readingInputError,
        ]}
      >
        <TextInput
          style={styles.readingInput}
          placeholder={optional ? "—" : placeholder}
          placeholderTextColor={COLORS.neutral[400]}
          keyboardType="decimal-pad"
          value={text}
          onChangeText={handleChangeText}
        />
        {unit && <Text style={styles.readingUnit}>{unit}</Text>}
      </View>
      {isInvalid && limits && (
        <Text style={styles.errorText}>
          {limits.max !== undefined
            ? `Must be between ${limits.min} and ${limits.max}${unit ? ` ${unit}` : ""}`
            : `Must be ${limits.min} or more`}
        </Text>
      )}
      {isOutOfRange && (
        <Text style={styles.warningText}>
          Outside normal range ({range.min} - {range.max})
        </Text>
      )}
    </View>
  );
};

const INK = "#10231a";
const MUTED = "#5b6b62";
const LINE = "#eceee9";
const BORDER = "#dfe3dc";
const BG = "#f4f5f2";
const ACCENT = COLORS.primary[600];
const TINT = "#e6f0ea";
const cardShadow = Platform.select({
  ios: { shadowColor: INK, shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  default: { elevation: 1 },
}) as any;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // Step header
  progressHeader: { backgroundColor: "#ffffff", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  progressInfo: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 },
  stepCounter: { fontSize: 12, fontWeight: "600", letterSpacing: 0.7, textTransform: "uppercase", color: MUTED },
  progressText: { fontSize: 13, color: MUTED },
  progressBarContainer: { height: 6, backgroundColor: LINE, borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: ACCENT, borderRadius: 3 },

  categoryBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, marginTop: 20, marginHorizontal: 20, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  categoryText: { fontSize: 12, fontWeight: "600" },

  contentCard: { flex: 1, marginHorizontal: 16, marginTop: 12, marginBottom: 12, backgroundColor: "#ffffff", borderRadius: 20, padding: 20, ...cardShadow },
  taskHeader: { gap: 8 },
  requiredBadge: { alignSelf: "flex-start", backgroundColor: "#fff4e5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  requiredText: { fontSize: 11, fontWeight: "700", color: "#8a4b08", letterSpacing: 0.3 },
  taskLabel: { fontSize: 24, fontWeight: "700", color: INK, lineHeight: 31, letterSpacing: -0.2 },

  numericInputContainer: { marginTop: 20 },
  numericInput: { height: 64, borderWidth: 1, borderColor: BORDER, borderRadius: 14, paddingHorizontal: 16, fontSize: 26, fontWeight: "700", color: INK, textAlign: "center", backgroundColor: "#ffffff" },
  rangeHint: { fontSize: 13, color: MUTED, textAlign: "center", marginTop: 8 },

  photoSection: { marginTop: 20 },
  photoActions: { flexDirection: "row", gap: 10 },
  photoButton: { flex: 1, height: 112, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: BORDER, backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center", gap: 6 },
  photoButtonText: { fontSize: 14, fontWeight: "600", color: INK },
  photoButtonOptional: { height: 80 },
  optionalPhotoLabel: { fontSize: 13, fontWeight: "600", color: MUTED, marginBottom: 10 },
  photoThumbRow: { marginBottom: 8 },
  photoThumb: { width: 84, height: 84, borderRadius: 12, backgroundColor: LINE },
  photoCountText: { fontSize: 13, color: MUTED, marginBottom: 12 },
  photoPreviewContainer: { alignItems: "center" },
  photoPreview: { width: "100%", height: 200, borderRadius: 14 },
  retakeButton: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  retakeButtonText: { fontSize: 14, color: ACCENT, fontWeight: "600" },

  // Pinned footer
  footer: { backgroundColor: "#ffffff", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  footerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  navButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: BG, alignItems: "center", justifyContent: "center" },
  naButton: { height: 40, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: BORDER, justifyContent: "center" },
  naButtonText: { fontSize: 14, fontWeight: "600", color: MUTED },
  completeStepButton: { height: 56, borderRadius: 16, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  completeStepButtonDisabled: { backgroundColor: "#c9d3cc" },
  completeStepButtonDone: { backgroundColor: COLORS.primary[700] },
  completeStepButtonText: { fontSize: 16, fontWeight: "600", color: "#ffffff" },

  naModalBackdrop: { flex: 1, backgroundColor: "rgba(16,35,26,0.4)", justifyContent: "center", padding: 24 },
  naModalCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 20, gap: 12 },
  naModalTitle: { fontSize: 18, fontWeight: "700", color: INK },
  naModalSubtitle: { fontSize: 14, color: MUTED, lineHeight: 20 },
  naModalActions: { flexDirection: "row", gap: 10, marginTop: 4 },

  // Readings / chemicals phase header
  header: { backgroundColor: "#ffffff", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  phaseIndicator: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  phaseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: LINE },
  phaseDotActive: { backgroundColor: ACCENT, width: 24 },
  phaseLine: { width: 20, height: 2, backgroundColor: LINE, marginHorizontal: 4 },
  phaseLabel: { fontSize: 24, fontWeight: "700", color: INK, letterSpacing: -0.2 },
  phaseSubtitle: { fontSize: 14, color: MUTED, marginTop: 4 },

  readingsScroll: { flex: 1 },
  readingsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12 },
  readingInputContainer: { width: "50%", padding: 4 },
  readingLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingHorizontal: 2 },
  readingLabel: { fontSize: 13, fontWeight: "600", color: INK },
  optionalTag: { fontSize: 11, color: MUTED },
  readingInputWrapper: { flexDirection: "row", alignItems: "center", height: 60, backgroundColor: "#ffffff", borderRadius: 14, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14 },
  readingInputWarning: { borderColor: "#e0a100", backgroundColor: "#fffaf0" },
  readingInput: { flex: 1, fontSize: 22, fontWeight: "700", color: INK, paddingVertical: 0 },
  readingUnit: { fontSize: 13, color: MUTED, marginLeft: 4 },
  readingInputError: { borderColor: "#c81e1e", backgroundColor: "#fdf2f2" },
  errorText: { fontSize: 12, color: "#9b1c1c", fontWeight: "600", marginTop: 4, paddingHorizontal: 2 },
  warningText: { fontSize: 12, color: "#8a4b08", marginTop: 4, paddingHorizontal: 2 },

  chemicalsContainer: { padding: 16, gap: 12 },
  emptyChemicals: { alignItems: "center", paddingVertical: 36, backgroundColor: "#ffffff", borderRadius: 20, gap: 6, ...cardShadow },
  emptyChemicalsText: { fontSize: 15, fontWeight: "600", color: INK, marginTop: 6 },
  emptyChemicalsSubtext: { fontSize: 13, color: MUTED, textAlign: "center", paddingHorizontal: 24 },
  chemicalItem: { backgroundColor: "#ffffff", borderRadius: 20, padding: 16, gap: 12, ...cardShadow },
  chemicalInputRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  chemicalNameInput: { flex: 1 },
  removeChemicalButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  chemicalQtyRow: { flexDirection: "row", gap: 12 },
  chemicalQtyInput: { width: 110 },
  chemicalUnitInput: { flex: 1 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: INK, marginBottom: 6 },
  textInput: { minHeight: 48, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, fontSize: 15, color: INK, backgroundColor: "#ffffff" },
  unitSelector: { flexDirection: "row", gap: 6 },
  unitOption: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", justifyContent: "center", alignItems: "center", marginBottom: 6 },
  unitOptionActive: { borderColor: ACCENT, backgroundColor: TINT },
  unitOptionText: { fontSize: 14, color: "#3c4a42", fontWeight: "500" },
  unitOptionTextActive: { color: ACCENT, fontWeight: "700" },
  addChemicalButton: { height: 52, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: BORDER, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  addChemicalButtonText: { fontSize: 15, fontWeight: "600", color: ACCENT },

  readingsFooter: { flexDirection: "row", gap: 10, backgroundColor: "#ffffff", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  secondaryButton: { flex: 1, height: 56, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: "#ffffff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10 },
  secondaryButtonText: { fontSize: 15, fontWeight: "600", color: INK },
  primaryButton: { flex: 1.4, height: 56, borderRadius: 16, backgroundColor: ACCENT, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
  primaryButtonDisabled: { backgroundColor: "#c9d3cc" },
  primaryButtonText: { fontSize: 16, fontWeight: "600", color: "#ffffff" },
});
