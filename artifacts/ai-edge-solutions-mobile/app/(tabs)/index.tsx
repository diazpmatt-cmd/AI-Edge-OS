import { useUser, useAuth } from "@clerk/expo";
import {
  useListArticles,
  useListKeywords,
  type ArticleDraft,
} from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  ready_for_website: "Ready",
  published: "Published",
  published_error: "Error",
};

function StatCard({ label, value, color, icon }: { label: string; value: number | string; color: string; icon: string }) {
  const colors = useColors();
  return (
    <View style={[statStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[statStyles.iconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[statStyles.value, { color: colors.foreground, fontFamily: "Inter_700Bold" }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  value: { fontSize: 28, fontWeight: "700" as const, letterSpacing: -0.5 },
  label: { fontSize: 12, letterSpacing: 0.1 },
});

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useAuth();

  const { data: articles = [], isLoading: articlesLoading, refetch: refetchArticles } = useListArticles();
  const { data: keywords = [], isLoading: keywordsLoading, refetch: refetchKeywords } = useListKeywords();

  const isLoading = articlesLoading || keywordsLoading;

  const published = articles.filter((a: ArticleDraft) => a.status === "published").length;
  const scheduled = articles.filter((a: ArticleDraft) => a.status === "scheduled").length;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 84 : insets.bottom + 84;

  const firstName = user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "there";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: topPad + 16, paddingBottom: botPad, paddingHorizontal: 20 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => { refetchArticles(); refetchKeywords(); }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={[s.greeting, { color: colors.mutedForeground }]}>Good morning,</Text>
          <Text style={[s.name, { color: colors.foreground }]}>{firstName}</Text>
        </View>
        <Pressable
          onPress={() => signOut()}
          style={({ pressed }) => [s.signOutBtn, { backgroundColor: colors.muted, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="log-out" size={18} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Stats */}
      <Text style={[s.sectionTitle, { color: colors.foreground }]}>Overview</Text>
      <View style={s.statsGrid}>
        <StatCard label="Keywords" value={keywords.length} color={colors.primary} icon="search" />
        <StatCard label="Articles" value={articles.length} color={colors.success} icon="file-text" />
      </View>
      <View style={[s.statsGrid, { marginTop: 12 }]}>
        <StatCard label="Published" value={published} color={colors.success} icon="globe" />
        <StatCard label="Scheduled" value={scheduled} color={colors.warning} icon="clock" />
      </View>

      {/* Recent Articles */}
      <Text style={[s.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>Recent Articles</Text>
      {articles.length === 0 && !articlesLoading ? (
        <View style={[s.emptyBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="file-text" size={28} color={colors.mutedForeground} />
          <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No articles yet</Text>
        </View>
      ) : (
        (articles as ArticleDraft[]).slice(0, 5).map((article) => (
          <Pressable
            key={article.id}
            onPress={() => router.push(`/article/${article.id}`)}
            style={({ pressed }) => [s.articleRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.articleTitle, { color: colors.foreground }]} numberOfLines={2}>{article.title}</Text>
              <Text style={[s.articleKeyword, { color: colors.mutedForeground }]} numberOfLines={1}>{article.keyword}</Text>
            </View>
            <StatusBadge status={article.status} />
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = useColors();
  const colorMap: Record<string, string> = {
    published: colors.success,
    scheduled: colors.primary,
    ready_for_website: colors.success,
    draft: colors.mutedForeground,
    published_error: colors.destructive,
  };
  const c = colorMap[status] ?? colors.mutedForeground;
  return (
    <View style={{ backgroundColor: c + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: "600" as const, color: c, fontFamily: "Inter_600SemiBold" }}>
        {STATUS_LABELS[status] ?? status}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  greeting: { fontSize: 14, fontFamily: "Inter_400Regular" },
  name: { fontSize: 22, fontWeight: "700" as const, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  signOutBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 17, fontWeight: "700" as const, fontFamily: "Inter_700Bold", marginBottom: 14, letterSpacing: -0.2 },
  statsGrid: { flexDirection: "row", gap: 12 },
  emptyBox: {
    borderWidth: 1, borderRadius: 16, padding: 32,
    alignItems: "center", justifyContent: "center", gap: 10, marginTop: 4,
  },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  articleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  articleTitle: { fontSize: 14, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", lineHeight: 20 },
  articleKeyword: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
