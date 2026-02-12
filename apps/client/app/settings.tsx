import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  Image,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { useTheme } from "../src/contexts/ThemeContext";

interface UserProfile {
  name: string;
  email: string;
  phone: string;
  profileImage?: string;
  organization?: string;
}

interface NotificationPreferences {
  serviceReminders: boolean;
  paymentReminders: boolean;
  visitUpdates: boolean;
  promotions: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
}

export default function SettingsScreen() {
  const { themeColor } = useTheme();
  const [profile, setProfile] = useState<UserProfile>({
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "+233 24 123 4567",
    organization: "PoolCare Client",
  });

  const [notifications, setNotifications] = useState<NotificationPreferences>({
    serviceReminders: true,
    paymentReminders: true,
    visitUpdates: true,
    promotions: false,
    emailNotifications: true,
    smsNotifications: true,
  });

  const [loading, setLoading] = useState(false);
  const [nextVisitBackgroundImage, setNextVisitBackgroundImage] = useState<string | null>(null);

  useEffect(() => {
    loadNextVisitBackground();
  }, []);

  const loadNextVisitBackground = async () => {
    try {
      const savedImage = await AsyncStorage.getItem('nextVisitBackgroundImage');
      if (savedImage) {
        setNextVisitBackgroundImage(savedImage);
      }
    } catch (error) {
      console.error('Error loading background image:', error);
    }
  };

  const handleChangeNextVisitBackground = async () => {
    Alert.alert(
      "Change Background Image",
      "Choose an option",
      [
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Required", "We need access to your photos.");
              return;
            }

            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                const imageUri = result.assets[0].uri;
                await AsyncStorage.setItem('nextVisitBackgroundImage', imageUri);
                setNextVisitBackgroundImage(imageUri);
                Alert.alert("Success", "Background image updated!");
              }
            } catch (error) {
              Alert.alert("Error", "Failed to update background image.");
            }
          },
        },
        {
          text: "Take Photo",
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== "granted") {
              Alert.alert("Permission Required", "We need access to your camera.");
              return;
            }

            try {
              const result = await ImagePicker.launchCameraAsync({
                allowsEditing: true,
                aspect: [16, 9],
                quality: 0.8,
              });

              if (!result.canceled && result.assets[0]) {
                const imageUri = result.assets[0].uri;
                await AsyncStorage.setItem('nextVisitBackgroundImage', imageUri);
                setNextVisitBackgroundImage(imageUri);
                Alert.alert("Success", "Background image updated!");
              }
            } catch (error) {
              Alert.alert("Error", "Failed to update background image.");
            }
          },
        },
        {
          text: "Use Default",
          onPress: async () => {
            await AsyncStorage.removeItem('nextVisitBackgroundImage');
            setNextVisitBackgroundImage(null);
            Alert.alert("Success", "Background reset to default!");
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: () => {
            // Handle logout logic here
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    // Navigate to edit profile screen or show modal
    Alert.alert("Edit Profile", "Profile editing feature coming soon!");
  };

  const handleChangePassword = () => {
    Alert.alert("Change Password", "Password change feature coming soon!");
  };

  const handleContactSupport = () => {
    // Open WhatsApp or support chat
    Alert.alert("Contact Support", "Opening support...");
  };

  const handlePrivacyPolicy = () => {
    Alert.alert("Privacy Policy", "Opening privacy policy...");
  };

  const handleTermsOfService = () => {
    Alert.alert("Terms of Service", "Opening terms of service...");
  };

  const handleAbout = () => {
    Alert.alert(
      "About PoolCare",
      "PoolCare v1.0.0\n\nYour trusted partner for pool maintenance and care."
    );
  };

  const renderSection = (
    title: string,
    children: React.ReactNode,
    showDivider = true
  ) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
      {showDivider && <View style={styles.divider} />}
    </View>
  );

  const renderSettingItem = (
    icon: string,
    label: string,
    onPress: () => void,
    rightElement?: React.ReactNode,
    showArrow = true
  ) => (
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.settingItemLeft}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={20} color={themeColor} />
        </View>
        <Text style={styles.settingItemLabel}>{label}</Text>
      </View>
      {rightElement || (showArrow && <Ionicons name="chevron-forward" size={20} color="#9ca3af" />)}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => { router.canGoBack() ? router.back() : router.replace("/"); }}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={styles.profileImageContainer}
            onPress={handleEditProfile}
          >
            {profile.profileImage ? (
              <Image
                source={{ uri: profile.profileImage }}
                style={styles.profileImage}
              />
            ) : (
              <View style={[styles.profileImagePlaceholder, { borderColor: themeColor }]}>
                <Ionicons name="person" size={40} color={themeColor} />
              </View>
            )}
            <View style={[styles.editProfileBadge, { backgroundColor: themeColor }]}>
              <Ionicons name="camera" size={16} color="#ffffff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>{profile.name}</Text>
          <Text style={styles.profileEmail}>{profile.email}</Text>
          <Text style={styles.profilePhone}>{profile.phone}</Text>
          <TouchableOpacity
            style={[styles.editProfileButton, { borderColor: themeColor }]}
            onPress={handleEditProfile}
          >
            <Text style={[styles.editProfileButtonText, { color: themeColor }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Account: Billing & Plans first, then profile/payment options */}
        {renderSection(
          "Account",
          <>
            {renderSettingItem("document-text-outline", "Billing", () => router.push("/billing"))}
            {renderSettingItem("layers-outline", "Plans", () => router.push("/my-subscriptions"))}
            {renderSettingItem("person-outline", "Profile Information", handleEditProfile)}
            {renderSettingItem("card-outline", "Payment Methods", () => router.push("/payment-methods"))}
            {renderSettingItem("lock-closed-outline", "Change Password", handleChangePassword)}
            {renderSettingItem("location-outline", "Addresses", () => Alert.alert("Addresses", "Address management coming soon!"))}
          </>
        )}

        {/* Notifications */}
        {renderSection(
          "Notifications",
          <>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="calendar-outline" size={20} color={themeColor} />
                </View>
                <Text style={styles.settingItemLabel}>Service Reminders</Text>
              </View>
              <Switch
                value={notifications.serviceReminders}
                onValueChange={(value) =>
                  setNotifications({ ...notifications, serviceReminders: value })
                }
                trackColor={{ false: "#d1d5db", true: themeColor }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="cash-outline" size={20} color={themeColor} />
                </View>
                <Text style={styles.settingItemLabel}>Payment Reminders</Text>
              </View>
              <Switch
                value={notifications.paymentReminders}
                onValueChange={(value) =>
                  setNotifications({ ...notifications, paymentReminders: value })
                }
                trackColor={{ false: "#d1d5db", true: themeColor }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="notifications-outline" size={20} color={themeColor} />
                </View>
                <Text style={styles.settingItemLabel}>Visit Updates</Text>
              </View>
              <Switch
                value={notifications.visitUpdates}
                onValueChange={(value) =>
                  setNotifications({ ...notifications, visitUpdates: value })
                }
                trackColor={{ false: "#d1d5db", true: themeColor }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="megaphone-outline" size={20} color={themeColor} />
                </View>
                <Text style={styles.settingItemLabel}>Promotions & Offers</Text>
              </View>
              <Switch
                value={notifications.promotions}
                onValueChange={(value) =>
                  setNotifications({ ...notifications, promotions: value })
                }
                trackColor={{ false: "#d1d5db", true: themeColor }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="mail-outline" size={20} color={themeColor} />
                </View>
                <Text style={styles.settingItemLabel}>Email Notifications</Text>
              </View>
              <Switch
                value={notifications.emailNotifications}
                onValueChange={(value) =>
                  setNotifications({ ...notifications, emailNotifications: value })
                }
                trackColor={{ false: "#d1d5db", true: themeColor }}
                thumbColor="#ffffff"
              />
            </View>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="chatbubble-outline" size={20} color={themeColor} />
                </View>
                <Text style={styles.settingItemLabel}>SMS Notifications</Text>
              </View>
              <Switch
                value={notifications.smsNotifications}
                onValueChange={(value) =>
                  setNotifications({ ...notifications, smsNotifications: value })
                }
                trackColor={{ false: "#d1d5db", true: themeColor }}
                thumbColor="#ffffff"
              />
            </View>
          </>
        )}

        {/* App Preferences */}
        {renderSection(
          "Preferences",
          <>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={handleChangeNextVisitBackground}
              activeOpacity={0.7}
            >
              <View style={styles.settingItemLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="image-outline" size={20} color={themeColor} />
                </View>
                <View style={styles.settingItemTextContainer}>
                  <Text style={styles.settingItemLabel}>Next Visit Card Background</Text>
                  <Text style={styles.settingItemSubtext}>Change the background image</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
            {renderSettingItem("language-outline", "Language", () => Alert.alert("Language", "Language selection coming soon!"))}
            {renderSettingItem("moon-outline", "Dark Mode", () => Alert.alert("Dark Mode", "Dark mode coming soon!"))}
            {renderSettingItem("download-outline", "Download Reports", () => Alert.alert("Download Reports", "Report downloads coming soon!"))}
          </>
        )}

        {/* Support & Help */}
        {renderSection(
          "Support & Help",
          <>
            {renderSettingItem("help-circle-outline", "Help Center", () => Alert.alert("Help Center", "Opening help center..."))}
            {renderSettingItem("chatbubbles-outline", "Contact Support", handleContactSupport)}
            {renderSettingItem("document-text-outline", "Privacy Policy", handlePrivacyPolicy)}
            {renderSettingItem("document-outline", "Terms of Service", handleTermsOfService)}
            {renderSettingItem("information-circle-outline", "About", handleAbout)}
          </>
        )}

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionText}>PoolCare v1.0.0</Text>
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
    paddingBottom: 120,
  },
  profileSection: {
    alignItems: "center",
    paddingVertical: 32,
    backgroundColor: "#ffffff",
    marginBottom: 12,
  },
  profileImageContainer: {
    position: "relative",
    marginBottom: 16,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  profileImagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#14b8a6",
  },
  editProfileBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#14b8a6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  profileName: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 2,
  },
  profilePhone: {
    fontSize: 15,
    color: "#6b7280",
    marginBottom: 20,
  },
  editProfileButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#14b8a6",
  },
  editProfileButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#14b8a6",
  },
  section: {
    backgroundColor: "#ffffff",
    marginBottom: 12,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f0fdf4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingItemLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  settingItemTextContainer: {
    flex: 1,
  },
  settingItemSubtext: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#f3f4f6",
    marginHorizontal: 20,
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 16,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fee2e2",
    backgroundColor: "#ffffff",
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#ef4444",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
    marginBottom: 24,
  },
});

