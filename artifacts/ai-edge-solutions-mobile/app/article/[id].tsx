import { useGetArticle } from "@workspace/api-client-react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

const STATUS_META: Record<string, { label: string; colorKey: string }> = {
  draft:             { label: "Draft",               colorKey: "mutedForeground" },
  scheduled:         { label: "Scheduled",            colorKey: "primary" },
  ready_for_website: { label: "Ready for Website",    colorKey: "success" },
  published:         { label: "Published",            colorKey: "success" },
  published_error:   { label: "Publish Error",        colorKey: "destructive" },
};

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const { data: article, isLoading, isError, refetch } = useGetArticle(id ?? "");

  useEffect(() => {
    if (article?.title) {
      navigation.setOptions({ headerTitle: article.title });
    }
  }, [article?.title, navigation]);

  const botPad = Platform.OS === "web" ? 34 : insets.bottom + 24;

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !article) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, gap: 16 }}>
        <Feather name="alert-circle" size={40} color={colors.destructive} />
        <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_600SemiBold" }}>Failed to load article</Text>
        <Pressable onPress={() => refetch()} style={[s.retryBtn, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const statusMeta = STATUS_META[article.status] ?? { label: article.status, colorKey: "mutedForeground" };
  const statusColor = (colors as any)[statusMeta.colorKey] ?? colors.mutedForeground;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: botPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Meta banner */}
      <View style={[s.banner, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[s.statusBadge, { backgroundColor: statusColor + "20" }]}>
          <Text style={[s.statusText, { color: statusColor }]}>{statusMeta.label}</Text>
        </View>
        <Text style={[s.keyword, { color: colors.mutedForeground }]}>{article.keyword}</Text>
        {article.publishedUrl ? (
          <Pressable onPress={() => Linking.openURL(article.publishedUrl!)} style={s.urlRow}>
            <Feather name="external-link" size={13} color={colors.primary} />
            <Text style={[s.url, { color: colors.primary }]} numberOfLines={1}>{article.publishedUrl}</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 24, gap: 20 }}>
        <Text style={[s.title, { color: colors.foreground }]}>{article.title}</Text>

        {article.metaTitle || article.metaDescription ? (
          <View style={[s.seoBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[s.seoLabel, { color: colors.mutedForeground }]}>SEO</Text>
            {article.metaTitle ? (
              <Text style={[s.seoTitle, { color: colors.foreground }]}>{article.metaTitle}</Text>
            ) : null}
            {article.metaDescription ? (
              <Text style={[s.seoDesc, { color: colors.mutedForeground }]}>{article.metaDescription}</Text>
            ) : null}
          </View>
        ) : null}

        {article.body ? (
          <Text style={[s.body, { color: colors.foreground }]}>{article.body}</Text>
        ) : (
          <View style={[s.emptyBody, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="align-left" size={24} color={colors.mutedForeground} />
            <Text style={[s.emptyBodyText, { color: colors.mutedForeground }]}>No content yet</Text>
          </View>
        )}

        <View style={{ gap: 6 }}>
          {article.generatedAt ? (
            <DateRow icon="zap" label="Generated" date={article.generatedAt} colors={colors} />
          ) : null}
          {article.scheduledFor ? (
            <DateRow icon="clock" label="Scheduled for" date={article.scheduledFor} colors={colors} />
          ) : null}
          {article.publishedAt ? (
            <DateRow icon="check-circle" label="Published" date={article.publishedAt} colors={colors} />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

function DateRow({ icon, label, date, colors }: { icon: string; label: string; date: string; colors: any }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Feather name={icon as any} size={14} color={colors.mutedForeground} />
      <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
        {label}: {new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { padding: 20, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  statusBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: "700" as const, fontFamily: "Inter_600SemiBold" },
  keyword: { fontSize: 15, fontFamily: "Inter_500Medium" },
  urlRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  url: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  title: { fontSize: 22, fontWeight: "800" as const, fontFamily: "Inter_700Bold", lineHeight: 30, letterSpacing: -0.4 },
  seoBox: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  seoLabel: { fontSize: 11, fontWeight: "700" as const, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  seoTitle: { fontSize: 14, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  seoDesc: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 },
  body: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 24 },
  emptyBody: { borderWidth: 1, borderRadius: 14, padding: 32, alignItems: "center", gap: 10 },
  emptyBodyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});
