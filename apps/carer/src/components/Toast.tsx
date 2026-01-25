/**
 * PoolCare Custom Toast Component
 * Consistent themed toast notifications
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, BORDER_RADIUS, SPACING, FONT_SIZES, SHADOWS } from "../theme";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onHide: () => void;
  action?: {
    label: string;
    onPress: () => void;
  };
}

const { width } = Dimensions.get("window");

const ICONS: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "alert-circle",
  warning: "warning",
  info: "information-circle",
};

const ICON_COLORS: Record<ToastType, string> = {
  success: COLORS.success[500],
  error: COLORS.error[500],
  warning: COLORS.warning[500],
  info: COLORS.primary[500],
};

const BG_COLORS: Record<ToastType, string> = {
  success: COLORS.success[50],
  error: COLORS.error[50],
  warning: COLORS.warning[50],
  info: COLORS.primary[50],
};

const BORDER_COLORS: Record<ToastType, string> = {
  success: COLORS.success[200],
  error: COLORS.error[200],
  warning: COLORS.warning[200],
  info: COLORS.primary[200],
};

export const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = "info",
  duration = 3000,
  onHide,
  action,
}) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      if (duration > 0) {
        const timer = setTimeout(() => {
          hideToast();
        }, duration);
        return () => clearTimeout(timer);
      }
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide();
    });
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: BG_COLORS[type],
          borderColor: BORDER_COLORS[type],
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons name={ICONS[type]} size={22} color={ICON_COLORS[type]} />
        <Text style={[styles.message, { color: COLORS.text.primary }]}>
          {message}
        </Text>
      </View>
      <View style={styles.actions}>
        {action && (
          <TouchableOpacity
            onPress={() => {
              action.onPress();
              hideToast();
            }}
            style={[styles.actionButton, { backgroundColor: ICON_COLORS[type] }]}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={hideToast} style={styles.closeButton}>
          <Ionicons name="close" size={18} color={COLORS.neutral[500]} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// Toast context for global usage
import { createContext, useContext, useState, useCallback } from "react";

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  hideToast: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toastState, setToastState] = useState({
    visible: false,
    message: "",
    type: "info" as ToastType,
    duration: 3000,
  });

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration: number = 3000) => {
      setToastState({ visible: true, message, type, duration });
    },
    []
  );

  const hideToast = useCallback(() => {
    setToastState((prev) => ({ ...prev, visible: false }));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      <Toast
        visible={toastState.visible}
        message={toastState.message}
        type={toastState.type}
        duration={toastState.duration}
        onHide={hideToast}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 60,
    left: SPACING.lg,
    right: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 9999,
    ...SHADOWS.lg,
  },
  content: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  message: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  actionButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  actionText: {
    color: COLORS.text.inverse,
    fontSize: FONT_SIZES.sm,
    fontWeight: "600",
  },
  closeButton: {
    padding: SPACING.xs,
  },
});

