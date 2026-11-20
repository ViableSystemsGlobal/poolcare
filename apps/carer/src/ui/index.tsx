/**
 * PoolCare carer design kit — the one visual system every screen is built from
 * (see the approved "Carer App Redesign" canvas). Field-ready: calm warm-grey
 * ground, white borderless cards, one accent (the org theme colour), big type
 * and 44px+ touch targets.
 */
import React, { ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ViewStyle,
  TextStyle,
  StyleProp,
  TextInput,
  TextInputProps,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../contexts/ThemeContext";
import { getApiUrl } from "../lib/api-client";
import { fixUrlForMobile } from "../lib/network-utils";

export const C = {
  bg: "#f4f5f2",
  card: "#ffffff",
  ink: "#10231a",
  body: "#3c4a42",
  muted: "#5b6b62",
  faint: "#8a968f",
  line: "#eceee9",
  border: "#dfe3dc",
  disabled: "#c9d3cc",
  warnBg: "#fff4e5",
  warnInk: "#8a4b08",
  warnBorder: "#e0a100",
  dangerBg: "#fde8e8",
  dangerInk: "#9b1c1c",
  danger: "#c81e1e",
  star: "#e0a100",
  info: "#1d4ed8",
};

export const R = { card: 18, hero: 20, button: 16, input: 12, chip: 10, pill: 999 };

/** Bottom padding so content clears the floating glass tab bar. */
export const TAB_BAR_CLEARANCE = 112;

/** Theme accent + a light tint of it. */
export function useAccent() {
  const { themeColor } = useTheme();
  return { accent: themeColor, tint: themeColor + "1F", tintStrong: themeColor + "33" };
}

/** Absolute, device-reachable URL for API-served media (relative paths, localhost). */
export function mediaUrl(raw?: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("data:")) return raw;
  const origin = getApiUrl().replace(/\/api\/?$/, "");
  const full = raw.startsWith("http") ? raw : origin + (raw.startsWith("/") ? raw : "/" + raw);
  return fixUrlForMobile(full);
}

export const shadow: ViewStyle = Platform.select({
  ios: { shadowColor: "#10231a", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  default: { elevation: 1 },
}) as ViewStyle;

// ── Typography ───────────────────────────────────────────────────────────────

export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.eyebrow, style]}>{children}</Text>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.title, style]}>{children}</Text>;
}

/** Eyebrow section label with an optional right-hand action link. */
export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { accent } = useAccent();
  return (
    <View style={[s.sectionHeader, style]}>
      <Eyebrow>{title}</Eyebrow>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={12}>
          <Text style={[s.sectionAction, { color: accent }]}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

export function Card({ children, style, padded = false }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[s.card, padded && { padding: 16 }, style]}>{children}</View>;
}

/** A tappable list row; put several in a Card — rows after the first get a hairline. */
export function Row({
  children,
  onPress,
  first = false,
  style,
  chevron = !!onPress,
  disabled,
  top = false,
}: {
  children: ReactNode;
  onPress?: () => void;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
  chevron?: boolean;
  disabled?: boolean;
  /** Align content to the top (multi-line rows). */
  top?: boolean;
}) {
  const inner = (
    <>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: top ? "flex-start" : "center", gap: 14 }}>{children}</View>
      {chevron ? <Ionicons name="chevron-forward" size={18} color={C.faint} /> : null}
    </>
  );
  const rowStyle = [s.row, !first && s.rowDivider, style];
  if (!onPress) return <View style={rowStyle}>{inner}</View>;
  return (
    <TouchableOpacity style={rowStyle} onPress={onPress} activeOpacity={0.6} disabled={disabled}>
      {inner}
    </TouchableOpacity>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  iconRight,
  loading,
  disabled,
  style,
  size = "lg",
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "lg" | "md";
}) {
  const { accent } = useAccent();
  const off = disabled || loading;
  const bg =
    variant === "primary" ? (off ? C.disabled : accent) : variant === "danger" ? (off ? C.disabled : C.danger) : C.card;
  const fg = variant === "primary" || variant === "danger" ? "#ffffff" : variant === "ghost" ? accent : C.ink;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[
        s.button,
        { height: size === "lg" ? 56 : 46, backgroundColor: variant === "ghost" ? "transparent" : bg },
        variant === "secondary" && { borderWidth: 1, borderColor: C.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={19} color={fg} /> : null}
          <Text style={[s.buttonText, { color: fg, fontSize: size === "lg" ? 16 : 15 }]} numberOfLines={1}>
            {title}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={19} color={fg} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  variant = "soft",
  badge,
  style,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  label: string;
  variant?: "soft" | "white" | "outline";
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
  color?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      activeOpacity={0.7}
      style={[
        s.iconButton,
        variant === "soft" && { backgroundColor: C.bg },
        variant === "white" && [{ backgroundColor: C.card }, s.floatShadow],
        variant === "outline" && { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12 },
        style,
      ]}
    >
      <Ionicons name={icon} size={20} color={color || C.ink} />
      {badge ? <View style={s.badgeDot} /> : null}
    </TouchableOpacity>
  );
}

export function Chip({
  label,
  tone = "neutral",
  icon,
  style,
}: {
  label: string;
  tone?: "neutral" | "accent" | "solid" | "warn" | "danger" | "dark";
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const { accent, tint } = useAccent();
  const map = {
    neutral: { bg: C.bg, fg: C.body },
    accent: { bg: tint, fg: accent },
    solid: { bg: accent, fg: "#ffffff" },
    warn: { bg: C.warnBg, fg: C.warnInk },
    danger: { bg: C.dangerBg, fg: C.dangerInk },
    dark: { bg: C.ink, fg: "#ffffff" },
  }[tone];
  return (
    <View style={[s.chip, { backgroundColor: map.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={map.fg} /> : null}
      <Text style={[s.chipText, { color: map.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Selectable option chip (pool type, plan, filters). */
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { accent, tint } = useAccent();
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      activeOpacity={0.7}
      style={[
        s.choice,
        selected ? { borderColor: accent, backgroundColor: tint } : { borderColor: C.border, backgroundColor: C.card },
      ]}
    >
      <Text style={[s.choiceText, { color: selected ? accent : C.body, fontWeight: selected ? "600" : "500" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.segmented, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.segment, on && s.segmentOn]}
          >
            <Text style={[s.segmentText, { color: on ? C.ink : C.muted }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  hint,
  error,
  style,
  inputStyle,
  ...props
}: TextInputProps & { label?: string; hint?: string; error?: string | null; inputStyle?: StyleProp<TextStyle> }) {
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={C.faint}
        {...props}
        style={[
          s.input,
          props.multiline && { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
          error ? { borderColor: C.danger } : null,
          inputStyle,
        ]}
      />
      {error ? <Text style={s.fieldError}>{error}</Text> : hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ── Composites ───────────────────────────────────────────────────────────────

/** Hairline-divided KPI strip (Today: Done / Rating / On time). */
export function StatStrip({
  items,
  style,
}: {
  items: { label: string; value: string; sub?: string; star?: boolean }[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Card style={[{ flexDirection: "row" }, style]}>
      {items.map((it, i) => (
        <View key={it.label} style={[s.statCell, i > 0 && s.statCellDivider]}>
          <Text style={s.statLabel}>{it.label}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
            <Text style={s.statValue}>{it.value}</Text>
            {it.star ? <Ionicons name="star" size={15} color={C.star} /> : null}
          </View>
          {it.sub ? <Text style={s.statSub}>{it.sub}</Text> : null}
        </View>
      ))}
    </Card>
  );
}

/** Pool photo with a water-tile placeholder when the pool has none yet. */
export function PoolThumb({
  uri,
  size = 48,
  radius = 12,
  count,
  style,
}: {
  uri?: string | null;
  size?: number | "fill";
  radius?: number;
  count?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const resolved = mediaUrl(uri);
  const dims: ViewStyle = size === "fill" ? { width: "100%", height: "100%" } : { width: size, height: size };
  return (
    <View style={[dims, { borderRadius: radius, overflow: "hidden", backgroundColor: "#3f9ac4" }, style]}>
      {resolved ? (
        <Image source={{ uri: resolved }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <View style={s.thumbEmpty}>
          <Ionicons name="water" size={typeof size === "number" ? Math.max(16, size * 0.4) : 32} color="#cfeaf6" />
        </View>
      )}
      {count && count > 1 ? (
        <View style={s.thumbCount}>
          <Text style={s.thumbCountText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function Avatar({ name, uri, size = 44 }: { name?: string | null; uri?: string | null; size?: number }) {
  const { accent, tint } = useAccent();
  const resolved = mediaUrl(uri);
  const initials = (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (resolved) {
    return <Image source={{ uri: resolved }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
      {initials ? (
        <Text style={{ color: accent, fontWeight: "700", fontSize: size * 0.36 }}>{initials}</Text>
      ) : (
        <Ionicons name="person" size={size * 0.45} color={accent} />
      )}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { accent } = useAccent();
  return (
    <Card style={[s.empty, style]}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={24} color={C.muted} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} style={{ marginTop: 6 }} hitSlop={10}>
          <Text style={{ color: accent, fontWeight: "600", fontSize: 14 }}>{action}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

export function Notice({
  tone = "warn",
  icon,
  children,
  style,
}: {
  tone?: "warn" | "danger" | "accent" | "neutral";
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { accent, tint } = useAccent();
  const map = {
    warn: { bg: C.warnBg, fg: "#5e3405", ic: C.warnInk, def: "warning-outline" as const },
    danger: { bg: C.dangerBg, fg: C.dangerInk, ic: C.dangerInk, def: "alert-circle-outline" as const },
    accent: { bg: tint, fg: C.ink, ic: accent, def: "information-circle-outline" as const },
    neutral: { bg: C.card, fg: C.body, ic: C.muted, def: "information-circle-outline" as const },
  }[tone];
  return (
    <View style={[s.notice, { backgroundColor: map.bg }, style]}>
      <Ionicons name={icon || map.def} size={18} color={map.ic} style={{ marginTop: 1 }} />
      <Text style={[s.noticeText, { color: map.fg }]}>{children}</Text>
    </View>
  );
}

/** Top bar for pushed (non-tab) screens: back · title · optional right slot. */
export function ScreenHeader({
  title,
  eyebrow,
  onBack,
  right,
  backIcon = "chevron-back",
  backLabel = "Back",
  style,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  right?: ReactNode;
  backIcon?: keyof typeof Ionicons.glyphMap;
  backLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }, style]}>
      <IconButton
        icon={backIcon}
        label={backLabel}
        onPress={onBack || (() => (router.canGoBack() ? router.back() : router.replace("/")))}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text style={s.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** Title block for tab screens (eyebrow + large title + optional right slot). */
export function TabHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.tabHeader, { paddingTop: insets.top + 16 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Text style={s.tabTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** Pinned bottom action area (job, visit, forms). */
export function Footer({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  return <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 10 }, style]}>{children}</View>;
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 2 }} accessibilityLabel={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={value >= i ? "star" : value >= i - 0.5 ? "star-half" : "star-outline"}
          size={size}
          color={C.star}
        />
      ))}
    </View>
  );
}

// ── Formatting helpers ───────────────────────────────────────────────────────

export const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", " ");

export const fmtWindow = (a: string | Date, b: string | Date) => `${fmtTime(a)} – ${fmtTime(b)}`;

export function dayLabel(d: string | Date) {
  const date = new Date(d);
  const today = new Date();
  const sameDay = (x: Date, y: Date) => x.toDateString() === y.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, tomorrow)) return "Tomorrow";
  return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export function localDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  en_route: "On the way",
  on_site: "On site",
  completed: "Done",
  failed: "Couldn't complete",
  cancelled: "Cancelled",
};

const s = StyleSheet.create({
  eyebrow: { fontSize: 12, fontWeight: "600", letterSpacing: 0.7, textTransform: "uppercase", color: C.muted },
  title: { fontSize: 24, fontWeight: "700", color: C.ink, letterSpacing: -0.2 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  sectionAction: { fontSize: 14, fontWeight: "600" },
  card: { backgroundColor: C.card, borderRadius: R.card, ...shadow },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 10, minHeight: 56 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  button: { borderRadius: R.button, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 18 },
  buttonText: { fontWeight: "600" },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  floatShadow: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
    default: { elevation: 3 },
  }) as ViewStyle,
  badgeDot: { position: "absolute", top: 9, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: "#c2410c", borderWidth: 2, borderColor: "#ffffff" },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: "600" },
  choice: { minHeight: 40, paddingHorizontal: 14, borderRadius: R.chip, borderWidth: 1, justifyContent: "center" },
  choiceText: { fontSize: 14 },
  segmented: { flexDirection: "row", backgroundColor: C.bg, borderRadius: 12, padding: 4 },
  segment: { flex: 1, height: 38, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: C.card, ...shadow },
  segmentText: { fontSize: 14, fontWeight: "600" },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: C.ink },
  input: { minHeight: 48, borderRadius: R.input, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  fieldHint: { fontSize: 12, color: C.muted },
  fieldError: { fontSize: 12, color: C.dangerInk, fontWeight: "600" },
  statCell: { flex: 1, paddingHorizontal: 14, paddingVertical: 14 },
  statCellDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.line },
  statLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", color: C.muted },
  statValue: { fontSize: 22, fontWeight: "700", color: C.ink },
  statSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  thumbEmpty: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#3f9ac4" },
  thumbCount: { position: "absolute", right: 4, bottom: 4, backgroundColor: "rgba(16,35,26,0.75)", borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  thumbCountText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 28, paddingHorizontal: 20, gap: 6 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: C.ink, textAlign: "center" },
  emptyBody: { fontSize: 13, color: C.muted, textAlign: "center", lineHeight: 19 },
  notice: { flexDirection: "row", gap: 10, borderRadius: 14, padding: 12 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: C.card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  headerTitle: { fontSize: 17, fontWeight: "700", color: C.ink },
  tabHeader: { flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 20, paddingBottom: 4 },
  tabTitle: { fontSize: 26, fontWeight: "700", color: C.ink, letterSpacing: -0.3 },
  footer: { backgroundColor: C.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingHorizontal: 20, paddingTop: 12 },
});
