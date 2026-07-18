import { useListKeywords, type Keyword } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const DIFFICULTY_COLOR_KEY: Record<string, "success" | "warning" | "destructive"> = {
  Low: "success",
  Medium: "warning",
  High: "destructive",
};

const INTENT_COLORS: Record<string, { bg: string; text: string }> = {
  Local:          { bg: "#3B6FE820", text: "#3B6FE8" },
  Commercial:     { bg: "#D9770620", text: "#D97706" },
  Informational:  { bg: "#6B789620", text: "#6B7896" },
  Transactional:  { bg: "#16A34A20", text: "#16A34A" },
};

export default function KeywordsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const { data: keywords = [], isLoading, refetch } = useListKeywords();

  const filtered = query.trim()
    ? (keywords as Keyword[]).filter(
        (k) =>
          k.keyword.toLowerCase().includes(query.toLowerCase()) ||
          k.city?.toLowerCase().includes(query.toLowerCase()) ||
          k.service?.toLowerCase().includes(query.toLowerCase()),
      )
    : (keywords as Keyword[]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 84 : insets.bottom + 84;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.headerWrap, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[s.screenTitle, { color: colors.foreground }]}>Keywords</Text>
        <Text style={[s.count, { color: colors.mutedForeground }]}>{(keywords as Keyword[]).length} total</Text>

        <View style={[s.searchWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[s.searchInput, { color: colors.foreground, fontFamily: "Inter_400Regular" }]}
            placeholder="Search keywords..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: botPad, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!filtered.length}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={[s.empty, { borderColor: colors.border, backgroundColor: colors.muted }]}>
            <Feather name="search" size={32} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No keywords found</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {query ? "Try a different search term." : "Add keywords from the web dashboard."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const diffColor = colors[DIFFICULTY_COLOR_KEY[item.difficulty] ?? "mutedForeground"];
          const intentStyle = INTENT_COLORS[item.intent] ?? { bg: "#6B789620", text: colors.mutedForeground };
          return (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={s.cardTop}>
                <Text style={[s.keyword, { color: colors.foreground }]} numberOfLines={2}>{item.keyword}</Text>
                <View style={[s.diffBadge, { backgroundColor: diffColor + "20" }]}>
                  <Text style={[s.diffText, { color: diffColor }]}>{item.difficulty}</Text>
                </View>
                <Pressable
                  onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(item.keyword)}`)}
                  hitSlop={8}
                  style={({ pressed }) => [s.searchLink, { opacity: pressed ? 0.5 : 1 }]}
                  accessibilityRole="link"
                  accessibilityLabel={`Search "${item.keyword}" on Google`}
                >
                  <Feather name="external-link" size={14} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <View style={s.cardMeta}>
                {item.city ? (
                  <View style={s.metaItem}>
                    <Feather name="map-pin" size={12} color={colors.mutedForeground} />
                    <Text style={[s.metaText, { color: colors.mutedForeground }]}>{item.city}, {item.state}</Text>
                  </View>
                ) : null}
                {item.volume > 0 ? (
                  <View style={s.metaItem}>
                    <Feather name="trending-up" size={12} color={colors.mutedForeground} />
                    <Text style={[s.metaText, { color: colors.mutedForeground }]}>{item.volume.toLocaleString()}/mo</Text>
                  </View>
                ) : null}
                {item.intent ? (
                  <View style={[s.intentBadge, { backgroundColor: intentStyle.bg }]}>
                    <Text style={[s.intentText, { color: intentStyle.text }]}>{item.intent}</Text>
                  </View>
                ) : null}
              </View>

              {item.service ? (
                <Text style={[s.service, { color: colors.mutedForeground }]} numberOfLines={1}>{item.service}</Text>
              ) : null}
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
  count: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 14 },
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, height: 44 },
  card: {
    borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  keyword: { flex: 1, fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  diffText: { fontSize: 11, fontWeight: "700" as const, fontFamily: "Inter_600SemiBold" },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  intentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  intentText: { fontSize: 11, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  service: { fontSize: 12, fontFamily: "Inter_400Regular" },
  searchLink: { padding: 2, justifyContent: "center", alignItems: "center" },
  empty: {
    flex: 1, borderWidth: 1, borderRadius: 16, borderStyle: "dashed",
    padding: 40, alignItems: "center", gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
