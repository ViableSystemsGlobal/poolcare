import { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../src/lib/api-client";

interface CarerProfile {
  id: string;
  name?: string;
  phone?: string;
  imageUrl?: string;
  user?: {
    email?: string;
    name?: string;
  };
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<CarerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      // Get carer profile using the API client
      const myCarer: any = await api.getMyCarer();
      setProfile({
        id: myCarer?.id || "",
        name: myCarer?.name || myCarer?.user?.name,
        phone: myCarer?.phone || myCarer?.user?.phone,
        imageUrl: myCarer?.imageUrl,
        user: myCarer?.user,
      });
    } catch (error) {
      console.error("Error fetching profile:", error);
      // Set default profile if API fails
      setProfile({
        id: "",
        name: "Carer",
        phone: "",
        user: {},
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            await api.logout();
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  const renderSettingItem = (
    icon: string,
    label: string,
    onPress: () => void,
    showArrow: boolean = true
  ) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.settingLeft}>
        <View style={styles.settingIcon}>
          <Ionicons name={icon as any} size={20} color="#14b8a6" />
        </View>
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      {showArrow && <Ionicons name="chevron-forward" size={20} color="#9ca3af" />}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#14b8a6" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {profile?.imageUrl ? (
              <Image source={{ uri: profile.imageUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={40} color="#ffffff" />
              </View>
            )}
          </View>
          <Text style={styles.profileName}>{profile?.name || "Carer"}</Text>
          {profile?.phone && (
            <Text style={styles.profilePhone}>{profile.phone}</Text>
          )}
          {profile?.user?.email && (
            <Text style={styles.profileEmail}>{profile.user.email}</Text>
          )}
        </View>

        {/* Account Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {renderSettingItem("person-outline", "Edit Profile", () => {
            Alert.alert("Coming Soon", "Profile editing will be available soon");
          })}
          {renderSettingItem("lock-closed-outline", "Change Password", () => {
            Alert.alert("Coming Soon", "Password change will be available soon");
          })}
        </View>

        {/* Preferences */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          {renderSettingItem("notifications-outline", "Notifications", () => {
            Alert.alert("Coming Soon", "Notification settings will be available soon");
          })}
          {renderSettingItem("language-outline", "Language", () => {
            Alert.alert("Coming Soon", "Language settings will be available soon");
          })}
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          {renderSettingItem("help-circle-outline", "Help & Support", () => {
            Alert.alert("Coming Soon", "Help center will be available soon");
          })}
          {renderSettingItem("document-text-outline", "Terms & Privacy", () => {
            Alert.alert("Coming Soon", "Terms and privacy policy will be available soon");
          })}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 64,
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    marginTop: 12,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#14b8a6",
    justifyContent: "center",
    alignItems: "center",
  },
  profileName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
    color: "#6b7280",
  },
  section: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0fdfa",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: "#111827",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fee2e2",
    backgroundColor: "#fef2f2",
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#dc2626",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 24,
  },
});

