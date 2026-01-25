import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

interface PaymentMethod {
  id: string;
  type: "card" | "mobile_money" | "bank";
  name: string;
  last4?: string;
  provider?: string;
  isDefault: boolean;
  expiryDate?: string;
}

export default function PaymentMethodsScreen() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: "1",
      type: "card",
      name: "Visa •••• 4242",
      last4: "4242",
      isDefault: true,
      expiryDate: "12/25",
    },
    {
      id: "2",
      type: "mobile_money",
      name: "MTN Mobile Money",
      provider: "MTN",
      isDefault: false,
    },
    {
      id: "3",
      type: "bank",
      name: "Bank Account",
      provider: "GCB Bank",
      isDefault: false,
    },
  ]);

  const handleAddPaymentMethod = () => {
    Alert.alert(
      "Add Payment Method",
      "Choose a payment method type",
      [
        {
          text: "Credit/Debit Card",
          onPress: () => {
            // Navigate to add card screen
            Alert.alert("Add Card", "Card addition feature coming soon!");
          },
        },
        {
          text: "Mobile Money",
          onPress: () => {
            // Navigate to add mobile money screen
            Alert.alert("Add Mobile Money", "Mobile money addition feature coming soon!");
          },
        },
        {
          text: "Bank Account",
          onPress: () => {
            // Navigate to add bank account screen
            Alert.alert("Add Bank Account", "Bank account addition feature coming soon!");
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  const handleSetDefault = (id: string) => {
    setPaymentMethods((prev) =>
      prev.map((method) => ({
        ...method,
        isDefault: method.id === id,
      }))
    );
    Alert.alert("Success", "Default payment method updated");
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert(
      "Delete Payment Method",
      `Are you sure you want to delete ${name}?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setPaymentMethods((prev) => prev.filter((method) => method.id !== id));
            Alert.alert("Success", "Payment method deleted");
          },
        },
      ]
    );
  };

  const getPaymentIcon = (type: PaymentMethod["type"]) => {
    switch (type) {
      case "card":
        return "card-outline";
      case "mobile_money":
        return "phone-portrait-outline";
      case "bank":
        return "business-outline";
      default:
        return "wallet-outline";
    }
  };

  const getPaymentColor = (type: PaymentMethod["type"]) => {
    switch (type) {
      case "card":
        return "#14b8a6";
      case "mobile_money":
        return "#f59e0b";
      case "bank":
        return "#3b82f6";
      default:
        return "#6b7280";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Add Payment Method Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddPaymentMethod}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={24} color="#14b8a6" />
          <Text style={styles.addButtonText}>Add Payment Method</Text>
        </TouchableOpacity>

        {/* Payment Methods List */}
        {paymentMethods.length > 0 ? (
          <View style={styles.methodsList}>
            {paymentMethods.map((method) => (
              <View key={method.id} style={styles.methodCard}>
                <View style={styles.methodHeader}>
                  <View style={styles.methodLeft}>
                    <View
                      style={[
                        styles.methodIconContainer,
                        { backgroundColor: getPaymentColor(method.type) + "15" },
                      ]}
                    >
                      <Ionicons
                        name={getPaymentIcon(method.type) as any}
                        size={24}
                        color={getPaymentColor(method.type)}
                      />
                    </View>
                    <View style={styles.methodInfo}>
                      <Text style={styles.methodName}>{method.name}</Text>
                      {method.provider && (
                        <Text style={styles.methodProvider}>{method.provider}</Text>
                      )}
                      {method.expiryDate && (
                        <Text style={styles.methodExpiry}>
                          Expires {method.expiryDate}
                        </Text>
                      )}
                    </View>
                  </View>
                  {method.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>

                <View style={styles.methodActions}>
                  {!method.isDefault && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleSetDefault(method.id)}
                    >
                      <Ionicons name="star-outline" size={18} color="#14b8a6" />
                      <Text style={styles.actionButtonText}>Set as Default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(method.id, method.name)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text style={[styles.actionButtonText, styles.deleteButtonText]}>
                      Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>No payment methods</Text>
            <Text style={styles.emptySubtext}>
              Add a payment method to make payments faster
            </Text>
          </View>
        )}

        {/* Info Section */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color="#14b8a6" />
          <Text style={styles.infoText}>
            Your payment methods are securely stored and encrypted. You can set a
            default method for faster checkout.
          </Text>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#14b8a6",
    borderStyle: "dashed",
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#14b8a6",
  },
  methodsList: {
    gap: 12,
    marginBottom: 20,
  },
  methodCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  methodHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  methodLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  methodIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  methodProvider: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  methodExpiry: {
    fontSize: 12,
    color: "#9ca3af",
  },
  defaultBadge: {
    backgroundColor: "#14b8a6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  defaultBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#ffffff",
  },
  methodActions: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#14b8a6",
    backgroundColor: "#ffffff",
  },
  deleteButton: {
    borderColor: "#fee2e2",
    backgroundColor: "#ffffff",
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#14b8a6",
  },
  deleteButtonText: {
    color: "#ef4444",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 40,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#f0fdf4",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
  },
});

