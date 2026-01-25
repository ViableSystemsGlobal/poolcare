import { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Alert, Linking } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

export default function KwameAIScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! I'm Kwame AI, your pool care assistant. I can help answer questions about your pool, schedule services, raise tickets, and more. How can I help you today?",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");

  const handleSend = () => {
    if (!inputText.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };
    setMessages([...messages, userMessage]);
    setInputText("");

    // Simulate AI response (in production, this would call an API)
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "I understand your question. Let me help you with that. Would you like me to raise a ticket for this issue?",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
    }, 1000);
  };

  const handleRaiseTicket = () => {
    // Navigate to ticket creation or show modal
    router.push("/tickets/new");
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.aiAvatar}>
            <Ionicons name="sparkles" size={20} color="#14b8a6" />
          </View>
          <Text style={styles.headerTitle}>Kwame AI</Text>
        </View>
        <TouchableOpacity onPress={handleRaiseTicket}>
          <Ionicons name="ticket-outline" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.isUser ? styles.userBubble : styles.aiBubble,
            ]}
          >
            {!message.isUser && (
              <View style={styles.aiAvatarSmall}>
                <Ionicons name="sparkles" size={16} color="#14b8a6" />
              </View>
            )}
            <View style={[
              styles.messageContent,
              message.isUser && styles.userMessageContent,
            ]}>
              <Text style={[
                styles.messageText,
                message.isUser && styles.userMessageText,
              ]}>
                {message.text}
              </Text>
              <Text style={styles.messageTime}>
                {message.timestamp.toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => setInputText("How do I check my pool chemistry?")}
        >
          <Ionicons name="water-outline" size={16} color="#14b8a6" />
          <Text style={styles.quickActionText}>Pool Chemistry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={() => setInputText("When is my next service?")}
        >
          <Ionicons name="calendar-outline" size={16} color="#14b8a6" />
          <Text style={styles.quickActionText}>Next Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickActionButton}
          onPress={handleRaiseTicket}
        >
          <Ionicons name="ticket-outline" size={16} color="#14b8a6" />
          <Text style={styles.quickActionText}>Raise Ticket</Text>
        </TouchableOpacity>
      </View>

      {/* WhatsApp Chat Button */}
      <TouchableOpacity
        style={styles.whatsappButton}
        onPress={async () => {
          try {
            // Open WhatsApp with pre-filled message
            const phoneNumber = "+233XXXXXXXXX"; // Replace with actual WhatsApp Business number
            const message = encodeURIComponent("Hello, I need help with my pool.");
            const url = `https://wa.me/${phoneNumber}?text=${message}`;
            const canOpen = await Linking.canOpenURL(url);
            if (canOpen) {
              await Linking.openURL(url);
            } else {
              Alert.alert("Error", "WhatsApp is not installed on your device.");
            }
          } catch (error) {
            Alert.alert("Error", "Unable to open WhatsApp.");
          }
        }}
        activeOpacity={0.7}
      >
        <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
        <Text style={styles.whatsappButtonText}>Chat on WhatsApp</Text>
        <Ionicons name="arrow-forward" size={20} color="#25D366" />
      </TouchableOpacity>

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask Kwame AI anything..."
          value={inputText}
          onChangeText={setInputText}
          multiline
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Ionicons name="send" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fafafa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#14b8a615",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 20,
    paddingBottom: 20,
  },
  messageBubble: {
    flexDirection: "row",
    marginBottom: 16,
    maxWidth: "85%",
  },
  userBubble: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  aiBubble: {
    alignSelf: "flex-start",
  },
  aiAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#14b8a615",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    marginTop: 4,
  },
  messageContent: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  userMessageContent: {
    backgroundColor: "#14b8a6",
  },
  messageText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 20,
    marginBottom: 4,
  },
  userMessageText: {
    color: "#ffffff",
  },
  messageTime: {
    fontSize: 11,
    color: "#9ca3af",
    marginTop: 4,
  },
  quickActions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  quickActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  quickActionText: {
    fontSize: 12,
    color: "#14b8a6",
    fontWeight: "600",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingBottom: Platform.OS === "ios" ? 20 : 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#14b8a6",
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
  whatsappButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#25D366",
    gap: 12,
  },
  whatsappButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#25D366",
  },
});

