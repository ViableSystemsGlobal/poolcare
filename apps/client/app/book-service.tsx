import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function BookServiceScreen() {
  const { poolId } = useLocalSearchParams<{ poolId?: string }>();
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [serviceType, setServiceType] = useState("routine");
  const [notes, setNotes] = useState("");

  const timeSlots = [
    "08:00 - 11:00",
    "09:00 - 12:00",
    "10:00 - 13:00",
    "11:00 - 14:00",
    "12:00 - 15:00",
    "13:00 - 16:00",
    "14:00 - 17:00",
  ];

  const handleBook = () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert("Missing Information", "Please select a date and time slot");
      return;
    }
    Alert.alert(
      "Service Booked",
      `Your service has been requested for ${selectedDate} at ${selectedTime}. You'll receive a confirmation shortly.`,
      [{ text: "OK", onPress: () => router.back() }]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book a Service</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Service Type */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Service Type</Text>
        
        {/* Emergency Service - Prominent */}
        <TouchableOpacity
          style={[
            styles.emergencyButton,
            serviceType === "emergency" && styles.emergencyButtonActive,
          ]}
          onPress={() => setServiceType("emergency")}
        >
          <View style={styles.emergencyButtonContent}>
            <Ionicons
              name="warning"
              size={24}
              color={serviceType === "emergency" ? "#ffffff" : "#dc2626"}
            />
            <View style={styles.emergencyButtonText}>
              <Text
                style={[
                  styles.emergencyButtonTitle,
                  serviceType === "emergency" && styles.emergencyButtonTitleActive,
                ]}
              >
                Emergency Service
              </Text>
              <Text
                style={[
                  styles.emergencyButtonSubtitle,
                  serviceType === "emergency" && styles.emergencyButtonSubtitleActive,
                ]}
              >
                Urgent pool issues - Same day response
              </Text>
            </View>
          </View>
          {serviceType === "emergency" && (
            <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
          )}
        </TouchableOpacity>

        <View style={styles.serviceTypeRow}>
          <TouchableOpacity
            style={[
              styles.serviceTypeButton,
              serviceType === "routine" && styles.serviceTypeButtonActive,
            ]}
            onPress={() => setServiceType("routine")}
          >
            <Ionicons
              name="water"
              size={24}
              color={serviceType === "routine" ? "#ffffff" : "#14b8a6"}
            />
            <Text
              style={[
                styles.serviceTypeText,
                serviceType === "routine" && styles.serviceTypeTextActive,
              ]}
            >
              Routine
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.serviceTypeButton,
              serviceType === "repair" && styles.serviceTypeButtonActive,
            ]}
            onPress={() => setServiceType("repair")}
          >
            <Ionicons
              name="construct"
              size={24}
              color={serviceType === "repair" ? "#ffffff" : "#14b8a6"}
            />
            <Text
              style={[
                styles.serviceTypeText,
                serviceType === "repair" && styles.serviceTypeTextActive,
              ]}
            >
              Repair
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Selection */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Select Date</Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          value={selectedDate}
          onChangeText={setSelectedDate}
        />
        <Text style={styles.inputHint}>Enter date in YYYY-MM-DD format</Text>
      </View>

      {/* Time Selection */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Select Time Slot</Text>
        <View style={styles.timeSlots}>
          {timeSlots.map((slot) => (
            <TouchableOpacity
              key={slot}
              style={[
                styles.timeSlotButton,
                selectedTime === slot && styles.timeSlotButtonActive,
              ]}
              onPress={() => setSelectedTime(slot)}
            >
              <Text
                style={[
                  styles.timeSlotText,
                  selectedTime === slot && styles.timeSlotTextActive,
                ]}
              >
                {slot}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Notes */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Additional Notes (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Any special instructions or requests..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
        />
      </View>

      {/* Book Button */}
      <TouchableOpacity style={styles.bookButton} onPress={handleBook}>
        <Ionicons name="calendar" size={24} color="#ffffff" />
        <Text style={styles.bookButtonText}>Book Service</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 12,
  },
  emergencyButton: {
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: "#dc2626",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  emergencyButtonActive: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  emergencyButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  emergencyButtonText: {
    flex: 1,
  },
  emergencyButtonTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#dc2626",
    marginBottom: 2,
  },
  emergencyButtonTitleActive: {
    color: "#ffffff",
  },
  emergencyButtonSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  emergencyButtonSubtitleActive: {
    color: "#ffffff",
  },
  serviceTypeRow: {
    flexDirection: "row",
    gap: 12,
  },
  serviceTypeButton: {
    flex: 1,
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#14b8a6",
    backgroundColor: "#ffffff",
  },
  serviceTypeButtonActive: {
    backgroundColor: "#14b8a6",
  },
  serviceTypeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
    marginTop: 8,
  },
  serviceTypeTextActive: {
    color: "#ffffff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
  inputHint: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  timeSlots: {
    gap: 8,
  },
  timeSlotButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  timeSlotButtonActive: {
    borderColor: "#14b8a6",
    backgroundColor: "#fff7ed",
  },
  timeSlotText: {
    fontSize: 14,
    color: "#111827",
    textAlign: "center",
  },
  timeSlotTextActive: {
    color: "#14b8a6",
    fontWeight: "600",
  },
  bookButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#14b8a6",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 24,
  },
  bookButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "600",
    marginLeft: 8,
  },
});

