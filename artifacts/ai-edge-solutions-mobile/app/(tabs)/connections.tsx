import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

type SocialConnection = {
  id: string;
  provider: string;
  accountName?: string | null;
  accountId?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

const PROVIDER_META: Record<string, { label: string; icon: string; color: string }> = {
  facebook:  { label: "Facebook",         icon: "facebook", color: "#1877F2" },
  instagram: { label: "Instagram",        icon: "instagram", color: "#E1306C" },
  twitter:   { label: "Twitter / X",      icon: "twitter",  color: "#1DA1F2" },
  linkedin:  { label: "LinkedIn",         icon: "linkedin", color: "#0077B5" },
  google:    { label: "Google Business",  icon: "globe",    color: "#4285F4" },
  wordpress: { label: "WordPress",        icon: "globe",    color: "#21759B" },
};

function isExpired(expiresAt?: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

export default function ConnectionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const { data: connections = [], isLoading, refetch } = useQuery<SocialConnection[]>({
    queryKey: ["social-connections"],
    queryFn: () => customFetch<SocialConnection[]>("/api/social-connections"),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 84 : insets.bottom + 84;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.headerWrap, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[s.screenTitle, { color: colors.foreground }]}>Connections</Text>
        <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
          {connections.length} connected account{connections.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <FlatList
        data={connections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: botPad, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!connections.length}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={[s.empty, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Feather name="link" size={32} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No connections</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              Connect social accounts from the web dashboard to start publishing.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const meta = PROVIDER_META[item.provider] ?? { label: item.provider, icon: "link", color: colors.primary };
          const expired = isExpired(item.expiresAt);
          const statusColor = expired ? colors.destructive : colors.success;

          return (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[s.iconWrap, { backgroundColor: meta.color + "18" }]}>
                <Feather name={meta.icon as any} size={22} color={meta.color} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.providerName, { color: colors.foreground }]}>{meta.label}</Text>
                {item.accountName ? (
                  <Text style={[s.accountName, { color: colors.mutedForeground }]}>{item.accountName}</Text>
                ) : null}
                {item.expiresAt ? (
                  <Text style={[s.expiry, { color: colors.mutedForeground }]}>
                    {expired ? "Expired " : "Expires "}{new Date(item.expiresAt).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>
              <View style={[s.statusBadge, { backgroundColor: statusColor + "18" }]}>
                <View style={[s.dot, { backgroundColor: statusColor }]} />
                <Text style={[s.statusText, { color: statusColor }]}>{expired ? "Expired" : "Connected"}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  headerWrap: { paddingHorizontal: 20, paddingBottom: 16 },
  screenTitle: { fontSize: 28, fontWeight: "800" as const, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 4 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  iconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  providerName: { fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  accountName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  expiry: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  empty: {
    flex: 1, borderWidth: 1, borderRadius: 16, borderStyle: "dashed",
    padding: 40, alignItems: "center", gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
