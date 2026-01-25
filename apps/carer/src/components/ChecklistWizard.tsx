/**
 * PoolCare Checklist Wizard Component
 * Step-by-step checklist with optional photo capture per step
 */

import React, { useState, useRef, useEffect } from "react";
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
  salt?: number;
}

interface Chemical {
  name: string;
  qty: string;
  unit: string;
}

interface ChecklistWizardProps {
  items: ChecklistItem[];
  onComplete: (items: ChecklistItem[], beforeReadings: ReadingsState, afterReadings: ReadingsState, chemicals: Chemical[]) => void;
  onPhotoUpload?: (uri: string, itemId: string) => Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
  initialBeforeReadings?: ReadingsState;
  initialAfterReadings?: ReadingsState;
}

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  cleaning: "water",
  chemistry: "flask",
  equipment: "construct",
  safety: "shield-checkmark",
  maintenance: "build",
  documentation: "camera",
};

const CATEGORY_COLORS: Record<string, string> = {
  cleaning: COLORS.primary[500],
  chemistry: COLORS.warning[500],
  equipment: COLORS.neutral[600],
  safety: COLORS.success[500],
  maintenance: COLORS.primary[600],
  documentation: COLORS.primary[400],
};

export const ChecklistWizard: React.FC<ChecklistWizardProps> = ({
  items,
  onComplete,
  onPhotoUpload,
  onCancel,
  disabled = false,
  initialBeforeReadings = {},
  initialAfterReadings = {},
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>(items);
  const [beforeReadings, setBeforeReadings] = useState<ReadingsState>(initialBeforeReadings);
  const [afterReadings, setAfterReadings] = useState<ReadingsState>(initialAfterReadings);
  const [showReadingsPhase, setShowReadingsPhase] = useState<"before" | "after" | "chemicals" | null>("before");
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
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

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      animateTransition("next");
      setCurrentStep(currentStep + 1);
    } else {
      // Last step - show after readings
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
    handleNext();
  };

  const handleMarkNotApplicable = () => {
    if (!currentItem.allowsNotApplicable) {
      Alert.alert("Required", "This item cannot be marked as not applicable.");
      return;
    }

    Alert.prompt(
      "Not Applicable",
      "Please provide a reason:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: (comment) => {
            const updatedItems = [...checklistItems];
            updatedItems[currentStep] = {
              ...currentItem,
              notApplicable: true,
              comment: comment || "Not applicable",
            };
            setChecklistItems(updatedItems);
            handleNext();
          },
        },
      ],
      "plain-text"
    );
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

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "Camera permission is needed to take photos.");
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
        updatedItems[currentStep] = { ...currentItem, photoUri: uri };
        setChecklistItems(updatedItems);

        // Upload if handler provided
        if (onPhotoUpload) {
          await onPhotoUpload(uri, currentItem.id);
        }
        setUploadingPhoto(false);
      }
    } catch (error) {
      setUploadingPhoto(false);
      Alert.alert("Error", "Failed to take photo. Please try again.");
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
        updatedItems[currentStep] = { ...currentItem, photoUri: uri };
        setChecklistItems(updatedItems);

        if (onPhotoUpload) {
          await onPhotoUpload(uri, currentItem.id);
        }
        setUploadingPhoto(false);
      }
    } catch (error) {
      setUploadingPhoto(false);
      Alert.alert("Error", "Failed to select photo. Please try again.");
    }
  };

  const handleFinishReadings = () => {
    if (showReadingsPhase === "before") {
      setShowReadingsPhase(null);
      setCurrentStep(0);
    } else if (showReadingsPhase === "after") {
      setShowReadingsPhase("chemicals");
    } else if (showReadingsPhase === "chemicals") {
      onComplete(checklistItems, beforeReadings, afterReadings, chemicals);
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
    if (currentItem.requiresNumericInput && !currentItem.value) return false;
    if (currentItem.requiresPhoto && !currentItem.photoUri) return false;
    return true;
  };

  const canFinish = () => {
    return checklistItems.every((item) => {
      if (item.notApplicable) return true;
      if (!item.required && !item.completed) return true;
      if (item.requiresNumericInput && !item.value) return false;
      if (item.requiresPhoto && !item.photoUri) return false;
      return item.completed;
    });
  };

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
          <Text style={styles.phaseLabel}>Chemicals Used</Text>
          <Text style={styles.phaseSubtitle}>
            Record any chemicals added during service
          </Text>
        </View>

        <ScrollView style={styles.readingsScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.chemicalsContainer}>
            {chemicals.length === 0 ? (
              <View style={styles.emptyChemicals}>
                <Ionicons name="flask-outline" size={48} color={COLORS.neutral[400]} />
                <Text style={styles.emptyChemicalsText}>No chemicals added yet</Text>
                <Text style={styles.emptyChemicalsSubtext}>
                  Tap "Add Chemical" to record chemical usage
                </Text>
              </View>
            ) : (
              chemicals.map((chemical, index) => (
                <View key={index} style={styles.chemicalItem}>
                  <View style={styles.chemicalInputRow}>
                    <View style={styles.chemicalNameInput}>
                      <Text style={styles.inputLabel}>Chemical Name</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g., Chlorine, pH Plus"
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
                        {["ml", "L", "kg", "g", "oz"].map((unit) => (
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
              <Text style={styles.addChemicalButtonText}>Add Chemical</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.readingsFooter}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setShowReadingsPhase("after")}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.primary[500]} />
            <Text style={styles.secondaryButtonText}>Back to After Readings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleFinishReadings}
          >
            <Text style={styles.primaryButtonText}>Complete Visit</Text>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.text.inverse} />
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
            {isAfter ? "After Readings" : "Before Readings"}
          </Text>
          <Text style={styles.phaseSubtitle}>
            {isAfter
              ? "Record the final water chemistry readings"
              : "Record the initial water chemistry readings"}
          </Text>
        </View>

        <ScrollView style={styles.readingsScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.readingsGrid}>
            <ReadingInput
              label="pH Level"
              value={readings.ph}
              onChange={(v) => setReadings({ ...readings, ph: v })}
              placeholder="7.2 - 7.6"
              range={{ min: 7.0, max: 8.0 }}
            />
            <ReadingInput
              label="Free Chlorine"
              value={readings.chlorineFree}
              onChange={(v) => setReadings({ ...readings, chlorineFree: v })}
              placeholder="1.0 - 3.0 ppm"
              unit="ppm"
              range={{ min: 1.0, max: 3.0 }}
            />
            <ReadingInput
              label="Total Alkalinity"
              value={readings.alkalinity}
              onChange={(v) => setReadings({ ...readings, alkalinity: v })}
              placeholder="80 - 120 ppm"
              unit="ppm"
              range={{ min: 80, max: 120 }}
            />
            <ReadingInput
              label="Temperature"
              value={readings.tempC}
              onChange={(v) => setReadings({ ...readings, tempC: v })}
              placeholder="°C"
              unit="°C"
            />
            <ReadingInput
              label="Calcium Hardness"
              value={readings.calciumHardness}
              onChange={(v) => setReadings({ ...readings, calciumHardness: v })}
              placeholder="200 - 400 ppm"
              unit="ppm"
              optional
            />
            <ReadingInput
              label="Cyanuric Acid"
              value={readings.cyanuricAcid}
              onChange={(v) => setReadings({ ...readings, cyanuricAcid: v })}
              placeholder="30 - 50 ppm"
              unit="ppm"
              optional
            />
          </View>
        </ScrollView>

        <View style={styles.readingsFooter}>
          {isAfter ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setShowReadingsPhase(null)}
            >
              <Ionicons name="arrow-back" size={20} color={COLORS.primary[500]} />
              <Text style={styles.secondaryButtonText}>Back to Checklist</Text>
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
            style={[styles.primaryButton, !readings.ph && styles.primaryButtonDisabled]}
            onPress={handleFinishReadings}
            disabled={!readings.ph}
          >
            <Text style={styles.primaryButtonText}>
              {isAfter ? "Continue to Chemicals" : "Start Checklist"}
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
          { backgroundColor: CATEGORY_COLORS[currentItem.category] + "20" },
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
              <Text style={styles.optionalPhotoLabel}>📷 Add photo (optional)</Text>
            )}
            {currentItem.photoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: currentItem.photoUri }} style={styles.photoPreview} />
                <TouchableOpacity
                  style={styles.retakeButton}
                  onPress={handleTakePhoto}
                  disabled={disabled}
                >
                  <Ionicons name="camera" size={16} color={COLORS.text.inverse} />
                  <Text style={styles.retakeButtonText}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : (
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
                      <Ionicons name="camera" size={28} color={COLORS.primary[500]} />
                      <Text style={styles.photoButtonText}>Take Photo</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.photoButton,
                    currentItem.allowsPhoto && !currentItem.requiresPhoto && styles.photoButtonOptional
                  ]}
                  onPress={handleSelectFromGallery}
                  disabled={disabled || uploadingPhoto}
                >
                  <Ionicons name="images" size={28} color={COLORS.primary[500]} />
                  <Text style={styles.photoButtonText}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
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
              <Text style={styles.naButtonText}>Not Applicable</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.navButton}
            onPress={handleNext}
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
              <Text style={styles.completeStepButtonText}>Completed - Next</Text>
            </>
          ) : (
            <>
              <Ionicons name="checkmark" size={24} color={COLORS.text.inverse} />
              <Text style={styles.completeStepButtonText}>
                {currentStep === totalSteps - 1 ? "Complete & Finish" : "Complete & Next"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
}

const ReadingInput: React.FC<ReadingInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  unit,
  optional,
  range,
}) => {
  const isOutOfRange =
    range && value !== undefined && (value < range.min || value > range.max);

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
        ]}
      >
        <TextInput
          style={styles.readingInput}
          placeholder={placeholder}
          placeholderTextColor={COLORS.neutral[400]}
          keyboardType="decimal-pad"
          value={value?.toString() || ""}
          onChangeText={(text) =>
            onChange(text ? parseFloat(text) || undefined : undefined)
          }
        />
        {unit && <Text style={styles.readingUnit}>{unit}</Text>}
      </View>
      {isOutOfRange && (
        <Text style={styles.warningText}>
          ⚠️ Outside normal range ({range.min} - {range.max})
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background.secondary,
  },
  progressHeader: {
    backgroundColor: COLORS.background.primary,
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    ...SHADOWS.sm,
  },
  progressInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: SPACING.sm,
  },
  stepCounter: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  progressText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: COLORS.neutral[200],
    borderRadius: BORDER_RADIUS.full,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: COLORS.primary[500],
    borderRadius: BORDER_RADIUS.full,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    gap: SPACING.xs,
  },
  categoryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  contentCard: {
    flex: 1,
    backgroundColor: COLORS.background.primary,
    margin: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    ...SHADOWS.md,
  },
  taskHeader: {
    marginBottom: SPACING.lg,
  },
  requiredBadge: {
    backgroundColor: COLORS.error[100],
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: "flex-start",
    marginBottom: SPACING.sm,
  },
  requiredText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.error[600],
    fontWeight: "600",
  },
  taskLabel: {
    fontSize: FONT_SIZES.xl,
    fontWeight: "600",
    color: COLORS.text.primary,
    lineHeight: 28,
  },
  numericInputContainer: {
    marginTop: SPACING.lg,
  },
  numericInput: {
    backgroundColor: COLORS.background.secondary,
    borderWidth: 2,
    borderColor: COLORS.primary[200],
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    fontSize: FONT_SIZES.xxl,
    fontWeight: "600",
    textAlign: "center",
    color: COLORS.text.primary,
  },
  rangeHint: {
    textAlign: "center",
    marginTop: SPACING.sm,
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.tertiary,
  },
  photoSection: {
    marginTop: SPACING.xl,
  },
  photoActions: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  photoButton: {
    flex: 1,
    backgroundColor: COLORS.primary[50],
    borderWidth: 2,
    borderColor: COLORS.primary[200],
    borderStyle: "dashed",
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    gap: SPACING.sm,
  },
  photoButtonText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary[600],
    fontWeight: "500",
  },
  photoButtonOptional: {
    borderStyle: "dotted",
    opacity: 0.8,
  },
  optionalPhotoLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginBottom: SPACING.sm,
    textAlign: "center",
  },
  photoPreviewContainer: {
    position: "relative",
  },
  photoPreview: {
    width: "100%",
    height: 200,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.neutral[200],
  },
  retakeButton: {
    position: "absolute",
    bottom: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: COLORS.neutral[800] + "CC",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.xs,
  },
  retakeButtonText: {
    color: COLORS.text.inverse,
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
  },
  footer: {
    backgroundColor: COLORS.background.primary,
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    ...SHADOWS.lg,
  },
  footerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  navButton: {
    padding: SPACING.sm,
  },
  naButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.neutral[100],
    borderRadius: BORDER_RADIUS.md,
  },
  naButtonText: {
    color: COLORS.neutral[600],
    fontSize: FONT_SIZES.sm,
    fontWeight: "500",
  },
  completeStepButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  completeStepButtonDisabled: {
    backgroundColor: COLORS.neutral[300],
  },
  completeStepButtonDone: {
    backgroundColor: COLORS.success[500],
  },
  completeStepButtonText: {
    color: COLORS.text.inverse,
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
  },
  // Readings styles
  header: {
    backgroundColor: COLORS.background.primary,
    padding: SPACING.xl,
    alignItems: "center",
    ...SHADOWS.sm,
  },
  phaseIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  phaseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.neutral[300],
  },
  phaseDotActive: {
    backgroundColor: COLORS.primary[500],
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  phaseLine: {
    width: 60,
    height: 2,
    backgroundColor: COLORS.neutral[300],
    marginHorizontal: SPACING.sm,
  },
  phaseLabel: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text.primary,
    marginBottom: SPACING.xs,
  },
  phaseSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    textAlign: "center",
  },
  readingsScroll: {
    flex: 1,
    padding: SPACING.lg,
  },
  readingsGrid: {
    gap: SPACING.md,
  },
  readingInputContainer: {
    backgroundColor: COLORS.background.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  readingLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  readingLabel: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.text.primary,
  },
  optionalTag: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.text.tertiary,
    backgroundColor: COLORS.neutral[100],
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  readingInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background.secondary,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border.light,
  },
  readingInputWarning: {
    borderColor: COLORS.warning[400],
    backgroundColor: COLORS.warning[50],
  },
  readingInput: {
    flex: 1,
    padding: SPACING.md,
    fontSize: FONT_SIZES.lg,
    color: COLORS.text.primary,
  },
  readingUnit: {
    paddingRight: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text.secondary,
  },
  warningText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZES.xs,
    color: COLORS.warning[600],
  },
  chemicalsContainer: {
    gap: SPACING.md,
  },
  emptyChemicals: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xxl * 2,
    paddingHorizontal: SPACING.xl,
  },
  emptyChemicalsText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: "600",
    color: COLORS.text.primary,
    marginTop: SPACING.md,
  },
  emptyChemicalsSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    marginTop: SPACING.xs,
    textAlign: "center",
  },
  chemicalItem: {
    backgroundColor: COLORS.background.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
    gap: SPACING.md,
  },
  chemicalInputRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-start",
  },
  chemicalNameInput: {
    flex: 1,
  },
  removeChemicalButton: {
    padding: SPACING.xs,
    marginTop: SPACING.lg + 4,
  },
  chemicalQtyRow: {
    flexDirection: "row",
    gap: SPACING.md,
  },
  chemicalQtyInput: {
    flex: 1,
  },
  chemicalUnitInput: {
    width: 120,
  },
  inputLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
    color: COLORS.text.secondary,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: COLORS.background.secondary,
    borderWidth: 1,
    borderColor: COLORS.primary[200],
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text.primary,
  },
  unitSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  unitOption: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background.secondary,
    borderWidth: 1,
    borderColor: COLORS.neutral[300],
  },
  unitOptionActive: {
    backgroundColor: COLORS.primary[50],
    borderColor: COLORS.primary[500],
  },
  unitOptionText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.text.secondary,
    fontWeight: "500",
  },
  unitOptionTextActive: {
    color: COLORS.primary[600],
    fontWeight: "600",
  },
  addChemicalButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.lg,
    backgroundColor: COLORS.primary[50],
    borderWidth: 2,
    borderColor: COLORS.primary[200],
    borderStyle: "dashed",
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  addChemicalButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
    color: COLORS.primary[600],
  },
  readingsFooter: {
    flexDirection: "row",
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
    backgroundColor: COLORS.background.primary,
    gap: SPACING.md,
    ...SHADOWS.lg,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary[300],
    gap: SPACING.xs,
  },
  secondaryButtonText: {
    color: COLORS.primary[500],
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
  primaryButton: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary[500],
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.xs,
  },
  primaryButtonDisabled: {
    backgroundColor: COLORS.neutral[300],
  },
  primaryButtonText: {
    color: COLORS.text.inverse,
    fontSize: FONT_SIZES.md,
    fontWeight: "600",
  },
});

