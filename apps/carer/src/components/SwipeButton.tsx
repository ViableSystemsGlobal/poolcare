import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface SwipeButtonProps {
  title: string;
  onSwipeComplete: () => Promise<void> | void;
  backgroundColor?: string;
  textColor?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  variant?: "primary" | "success" | "warning";
}

const BUTTON_WIDTH = Dimensions.get("window").width - 48;
const SWIPE_THRESHOLD = BUTTON_WIDTH * 0.6; // Lower threshold for easier completion
const THUMB_SIZE = 60; // Slightly larger for better touch target
const THUMB_PADDING = 4;

export default function SwipeButton({
  title,
  onSwipeComplete,
  backgroundColor,
  iconName = "arrow-forward",
  disabled = false,
  variant = "primary",
}: SwipeButtonProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [isLoading, setIsLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  
  // Calculate max swipe distance
  const maxX = BUTTON_WIDTH - THUMB_SIZE - (THUMB_PADDING * 2);

  const getColors = () => {
    switch (variant) {
      case "success":
        return {
          bg: "#10b981",
          thumb: "#059669",
          track: "#d1fae5",
        };
      case "warning":
        return {
          bg: "#f59e0b",
          thumb: "#d97706",
          track: "#fef3c7",
        };
      default:
        // Primary variant uses theme teal color
        return {
          bg: backgroundColor || "#14b8a6",
          thumb: "#0d9488",
          track: "#ccfbf1",
        };
    }
  };

  const colors = getColors();

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        // Only start if we're touching the thumb area or starting a horizontal swipe
        return !disabled && !isLoading && !completed && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Only respond to horizontal movements
        return !disabled && !isLoading && !completed && Math.abs(gestureState.dx) > 5;
      },
      onPanResponderGrant: () => {
        // Stop any ongoing animations when starting a new gesture
        translateX.stopAnimation();
      },
      onPanResponderMove: (evt, gestureState) => {
        // Clamp the value between 0 and max for smooth tracking
        const newX = Math.max(0, Math.min(gestureState.dx, maxX));
        // Use setValue for immediate response (no animation delay during drag)
        translateX.setValue(newX);
      },
      onPanResponderRelease: async (evt, gestureState) => {
        const currentX = gestureState.dx;
        const velocity = gestureState.vx;
        
        // Check if swipe threshold is met OR if there's enough velocity
        const shouldComplete = currentX >= SWIPE_THRESHOLD || (currentX > maxX * 0.4 && velocity > 0.5);
        
        if (shouldComplete) {
          // Swipe completed - animate to end
          Animated.spring(translateX, {
            toValue: maxX,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start(async () => {
            setIsLoading(true);
            try {
              await onSwipeComplete();
              setCompleted(true);
            } catch (error) {
              // Reset on error
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
              }).start();
              setIsLoading(false);
            }
          });
        } else {
          // Reset with spring animation
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // Reset if gesture is interrupted
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }).start();
      },
    })
  ).current;

  const progress = translateX.interpolate({
    inputRange: [0, maxX],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const textOpacity = translateX.interpolate({
    inputRange: [0, BUTTON_WIDTH * 0.3],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  if (completed) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.completedContent}>
          <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
          <Text style={styles.completedText}>Done!</Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.track },
        disabled && styles.containerDisabled,
      ]}
    >
      {/* Progress fill */}
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: colors.bg,
            transform: [{ scaleX: progress }],
          },
        ]}
      />

      {/* Text */}
      <Animated.Text
        style={[
          styles.title,
          { opacity: textOpacity, color: colors.thumb },
        ]}
      >
        {title}
      </Animated.Text>

      {/* Swipe hint arrows */}
      <Animated.View style={[styles.arrowHints, { opacity: textOpacity }]}>
        <Ionicons name="chevron-forward" size={16} color={colors.thumb} style={{ opacity: 0.3 }} />
        <Ionicons name="chevron-forward" size={16} color={colors.thumb} style={{ opacity: 0.5 }} />
        <Ionicons name="chevron-forward" size={16} color={colors.thumb} style={{ opacity: 0.7 }} />
      </Animated.View>

      {/* Thumb */}
      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: colors.bg,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Ionicons name={iconName} size={24} color="#ffffff" />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: BUTTON_WIDTH,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    marginVertical: 12,
    alignSelf: "center",
  },
  containerDisabled: {
    opacity: 0.5,
  },
  progressFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: BUTTON_WIDTH,
    transformOrigin: "left",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  arrowHints: {
    position: "absolute",
    right: 80,
    flexDirection: "row",
  },
  thumb: {
    position: "absolute",
    left: THUMB_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 10,
  },
  completedContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  completedText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "600",
  },
});

