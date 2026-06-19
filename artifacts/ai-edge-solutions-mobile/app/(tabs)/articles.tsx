import { useListArticles, type ArticleDraft } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "all" },
  { label: "Published", value: "published" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Ready", value: "ready_for_website" },
  { label: "Draft", value: "draft" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  ready_for_website: "Ready",
  published: "Published",
  published_error: "Error",
};

export default function ArticlesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [filter, setFilter] = useState("all");

  const { data: articles = [], isLoading, refetch } = useListArticles();

  const filtered = filter === "all"
    ? (articles as ArticleDraft[])
    : (articles as ArticleDraft[]).filter((a) => a.status === filter);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 84 : insets.bottom + 84;

  const colorForStatus = (status: string): string => {
    const m: Record<string, string> = {
      published: colors.success,
      scheduled: colors.primary,
      ready_for_website: colors.success,
      draft: colors.mutedForeground,
      published_error: colors.destructive,
    };
    return m[status] ?? colors.mutedForeground;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.headerWrap, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[s.screenTitle, { color: colors.foreground }]}>Articles</Text>
        <Text style={[s.count, { color: colors.mutedForeground }]}>{filtered.length} total</Text>
      </View>

      {/* Filter chips */}
      <View style={[s.filterWrap, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(i) => i.value}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          renderItem={({ item }) => {
            const active = filter === item.value;
            return (
              <TouchableOpacity
                onPress={() => setFilter(item.value)}
                style={[s.chip, {
                  backgroundColor: active ? colors.primary : colors.muted,
                  borderColor: active ? colors.primary : colors.border,
                }]}
              >
                <Text style={[s.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* List */}
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
            <Feather name="file-text" size={32} color={colors.mutedForeground} />
            <Text style={[s.emptyTitle, { color: colors.foreground }]}>No articles</Text>
            <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
              {filter === "all" ? "Generate your first article from the dashboard." : `No ${filter} articles yet.`}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = colorForStatus(item.status);
          return (
            <Pressable
              onPress={() => router.push(`/article/${item.id}`)}
              style={({ pressed }) => [s.card, {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <View style={[s.stripe, { backgroundColor: statusColor }]} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[s.title, { color: colors.foreground }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[s.keyword, { color: colors.mutedForeground }]} numberOfLines={1}>{item.keyword}</Text>
                <View style={s.metaRow}>
                  <View style={[s.badge, { backgroundColor: statusColor + "20" }]}>
                    <Text style={[s.badgeText, { color: statusColor }]}>{STATUS_LABELS[item.status] ?? item.status}</Text>
                  </View>
                  {item.scheduledFor ? (
                    <Text style={[s.meta, { color: colors.mutedForeground }]}>
                      {new Date(item.scheduledFor).toLocaleDateString()}
                    </Text>
                  ) : item.publishedAt ? (
                    <Text style={[s.meta, { color: colors.mutedForeground }]}>
                      {new Date(item.publishedAt).toLocaleDateString()}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  headerWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  screenTitle: { fontSize: 28, fontWeight: "800" as const, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  count: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  filterWrap: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    gap: 14,
    paddingRight: 14,
    paddingVertical: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  stripe: { width: 4, alignSelf: "stretch", borderRadius: 2, marginLeft: 4 },
  title: { fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", lineHeight: 21 },
  keyword: { fontSize: 12, fontFamily: "Inter_400Regular" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  empty: {
    flex: 1, borderWidth: 1, borderRadius: 16, borderStyle: "dashed",
    padding: 40, alignItems: "center", gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
