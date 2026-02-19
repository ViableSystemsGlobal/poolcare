import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  Animated,
  ActivityIndicator,
  Modal,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../src/lib/api-client";
import { useTheme } from "../src/contexts/ThemeContext";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  error?: boolean;
}

function TypingIndicator({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - i * 150),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, []);

  return (
    <View style={styles.typingBubble}>
      <View style={[styles.aiAvatarSmall, { backgroundColor: color + "20" }]}>
        <Ionicons name="sparkles" size={14} color={color} />
      </View>
      <View style={styles.typingDots}>
        {dots.map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: color, opacity: dot, transform: [{ translateY: dot.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const QUICK_ACTIONS = [
  { icon: "water-outline" as const, label: "Pool chemistry", message: "What do my latest pool chemistry readings mean?" },
  { icon: "calendar-outline" as const, label: "Next service", message: "When is my next pool service?" },
  { icon: "warning-outline" as const, label: "Report issue", message: "I want to report a problem with my pool." },
  { icon: "receipt-outline" as const, label: "My invoices", message: "Do I have any outstanding invoices?" },
];

const WELCOME_MSG: Message = {
  id: "welcome",
  text: "Hi! I'm Kwame, your pool care assistant. I can help you understand your pool chemistry, check your service history, or answer any pool care questions. How can I help?",
  isUser: false,
  timestamp: new Date(),
};

export default function KwameAIScreen() {
  const { themeColor } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [chatList, setChatList] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const scrollToBottom = useCallback((animated = true) => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated }), 100);
  }, []);

  useEffect(() => {
    scrollToBottom(false);
  }, [messages]);

  // Load chat list on mount
  useEffect(() => {
    loadChatList();
  }, []);

  const loadChatList = async () => {
    try {
      const list = await api.getPoolCoachChats();
      setChatList(list || []);
    } catch {
      // ignore — no history yet
    }
  };

  const startNewChat = () => {
    setConversationId(undefined);
    setMessages([WELCOME_MSG]);
    setInputText("");
    setShowHistory(false);
  };

  const loadChat = async (id: string) => {
    try {
      setHistoryLoading(true);
      const chat = await api.getPoolCoachChat(id);
      const loaded: Message[] = (chat.messages as Array<{ role: string; content: string }>).map(
        (m, i) => ({
          id: `hist_${i}`,
          text: m.content,
          isUser: m.role === "user",
          timestamp: new Date(chat.createdAt),
        })
      );
      setMessages(loaded.length > 0 ? loaded : [WELCOME_MSG]);
      setConversationId(id);
      setShowHistory(false);
    } catch {
      Alert.alert("Error", "Could not load that conversation.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const deleteChat = async (id: string) => {
    try {
      await api.deletePoolCoachChat(id);
      const updated = chatList.filter((c) => c.id !== id);
      setChatList(updated);
      if (conversationId === id) startNewChat();
    } catch {
      Alert.alert("Error", "Could not delete that conversation.");
    }
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: Date.now().toString(),
        text: trimmed,
        isUser: true,
        timestamp: new Date(),
      };

      // Build history from current messages (exclude welcome)
      const history = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: (m.isUser ? "user" : "assistant") as "user" | "assistant", content: m.text }));

      setMessages((prev) => [...prev, userMsg]);
      setInputText("");
      setLoading(true);
      scrollToBottom();

      try {
        const res = await api.chatWithKwame(
          [...history, { role: "user", content: trimmed }],
          conversationId
        );

        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: res.message,
          isUser: false,
          timestamp: new Date(),
        };

        setConversationId(res.conversationId);
        setMessages((prev) => [...prev, aiMsg]);

        // Update chat list (add or refresh)
        setChatList((prev) => {
          const exists = prev.find((c) => c.id === res.conversationId);
          if (exists) {
            return prev.map((c) =>
              c.id === res.conversationId ? { ...c, updatedAt: new Date().toISOString() } : c
            );
          }
          return [{ id: res.conversationId, title: res.title, updatedAt: new Date().toISOString() }, ...prev];
        });
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            text: "Sorry, I couldn't connect right now. Please try again or use the WhatsApp button below.",
            isUser: false,
            timestamp: new Date(),
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, conversationId, scrollToBottom]
  );

  const handleWhatsApp = async () => {
    const orgSettings = await api.getOrgSettings().catch(() => null) as any;
    const phone = orgSettings?.profile?.supportPhone || "";
    const url = `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent("Hello, I need help with my pool.")}`;
    try {
      if (phone && await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Contact Support", "Please contact your pool service provider directly.");
      }
    } catch {
      Alert.alert("Error", "Unable to open WhatsApp.");
    }
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const isNewChat = messages.length === 1 && messages[0].id === "welcome";

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowHistory(true)} activeOpacity={0.7}>
          <View style={[styles.aiAvatar, { backgroundColor: themeColor + "18" }]}>
            <Ionicons name="sparkles" size={18} color={themeColor} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Kwame AI</Text>
            <Text style={[styles.headerSubtitle, { color: themeColor }]}>Pool care assistant</Text>
          </View>
          <Ionicons name="chevron-down" size={14} color="#9ca3af" style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={startNewChat} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="create-outline" size={22} color={themeColor} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[styles.messageRow, msg.isUser ? styles.messageRowUser : styles.messageRowAi]}
          >
            {!msg.isUser && (
              <View style={[styles.aiAvatarSmall, { backgroundColor: themeColor + "18" }]}>
                <Ionicons name="sparkles" size={14} color={themeColor} />
              </View>
            )}
            <View style={[
              styles.bubble,
              msg.isUser
                ? [styles.bubbleUser, { backgroundColor: themeColor }]
                : msg.error
                ? styles.bubbleError
                : styles.bubbleAi,
            ]}>
              <Text style={[styles.bubbleText, msg.isUser && styles.bubbleTextUser]}>
                {msg.text}
              </Text>
              <Text style={[styles.bubbleTime, msg.isUser && styles.bubbleTimeUser]}>
                {formatTime(msg.timestamp)}
              </Text>
            </View>
          </View>
        ))}

        {loading && <TypingIndicator color={themeColor} />}
      </ScrollView>

      {/* Quick Actions — only shown on a fresh chat */}
      {isNewChat && !loading && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickActionsScroll}
          contentContainerStyle={styles.quickActionsContent}
        >
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.chip, { borderColor: themeColor + "40", backgroundColor: themeColor + "0C" }]}
              onPress={() => sendMessage(action.message)}
              activeOpacity={0.7}
            >
              <Ionicons name={action.icon} size={14} color={themeColor} />
              <Text style={[styles.chipText, { color: themeColor }]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity onPress={handleWhatsApp} style={styles.whatsappBtn} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Ask about your pool…"
          placeholderTextColor="#9ca3af"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          editable={!loading}
          returnKeyType="send"
          onSubmitEditing={() => sendMessage(inputText)}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[
            styles.sendBtn,
            { backgroundColor: inputText.trim() && !loading ? themeColor : "#e5e7eb" },
          ]}
          onPress={() => sendMessage(inputText)}
          disabled={!inputText.trim() || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color={inputText.trim() ? "#fff" : "#9ca3af"} />
          )}
        </TouchableOpacity>
      </View>

      {/* Chat History Modal */}
      <Modal visible={showHistory} animationType="slide" transparent onRequestClose={() => setShowHistory(false)}>
        <View style={styles.historyOverlay}>
          <View style={styles.historySheet}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Chat History</Text>
              <TouchableOpacity onPress={() => setShowHistory(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.newChatBtn, { borderColor: themeColor }]}
              onPress={startNewChat}
            >
              <Ionicons name="create-outline" size={18} color={themeColor} />
              <Text style={[styles.newChatBtnText, { color: themeColor }]}>New Chat</Text>
            </TouchableOpacity>

            {historyLoading ? (
              <ActivityIndicator color={themeColor} style={{ marginTop: 32 }} />
            ) : chatList.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Ionicons name="chatbubble-outline" size={40} color="#d1d5db" />
                <Text style={styles.historyEmptyText}>No previous chats</Text>
              </View>
            ) : (
              <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
                {chatList.map((chat) => (
                  <TouchableOpacity
                    key={chat.id}
                    style={[styles.historyItem, conversationId === chat.id && { backgroundColor: themeColor + "10" }]}
                    onPress={() => loadChat(chat.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={conversationId === chat.id ? themeColor : "#9ca3af"} />
                    <View style={styles.historyItemContent}>
                      <Text style={styles.historyItemTitle} numberOfLines={1}>{chat.title}</Text>
                      <Text style={styles.historyItemDate}>
                        {new Date(chat.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => deleteChat(chat.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#d1d5db" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
    paddingBottom: 14,
    backgroundColor: "#ffffff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  headerBtn: {
    width: 36,
    alignItems: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  aiAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: "500",
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  messageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "84%",
  },
  messageRowAi: {
    alignSelf: "flex-start",
  },
  messageRowUser: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  aiAvatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%",
  },
  bubbleAi: {
    backgroundColor: "#ffffff",
    borderBottomLeftRadius: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleError: {
    backgroundColor: "#fff1f2",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  bubbleText: {
    fontSize: 15,
    color: "#111827",
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: "#ffffff",
  },
  bubbleTime: {
    fontSize: 10,
    color: "#9ca3af",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  bubbleTimeUser: {
    color: "rgba(255,255,255,0.65)",
  },
  typingBubble: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    alignSelf: "flex-start",
  },
  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  quickActionsScroll: {
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    maxHeight: 52,
  },
  quickActionsContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 5,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#ffffff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: "#111827",
    maxHeight: 110,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  whatsappBtn: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  // History modal
  historyOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  historySheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "75%",
    paddingBottom: 32,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    padding: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 12,
    justifyContent: "center",
  },
  newChatBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  historyList: {
    paddingHorizontal: 16,
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  historyItemDate: {
    fontSize: 12,
    color: "#9ca3af",
  },
  historyEmpty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  historyEmptyText: {
    fontSize: 14,
    color: "#9ca3af",
  },
});
