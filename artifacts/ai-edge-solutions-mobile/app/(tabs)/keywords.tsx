import { useListKeywords, type Keyword } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { customFetch } from "@/lib/api";
import type { GapSignal, GapsResponse } from "@/lib/types";

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

function useKeywordGaps() {
  const [gaps, setGaps] = useState<GapSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchGaps = async () => {
    try {
      setLoading(true);
      setError(false);
      const res = await customFetch("/api/competitor-intelligence/gaps?limit=50");
      if (!res.ok) {
        setError(true);
        return;
      }
      const data: GapsResponse = await res.json();
      setGaps(data.hasData ? data.gaps : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGaps(); }, []);

  return { gaps, loading, error, refetch: fetchGaps };
}

function GapRow({ gap }: { gap: GapSignal }) {
  const colors = useColors();
  const isUnknown = gap.competitorName == null;

  return (
    <View style={[gs.row, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={gs.rowMain}>
        <Text style={[gs.gapKeyword, { color: colors.foreground }]} numberOfLines={2}>
          {gap.keyword}
        </Text>
        {isUnknown ? (
          <View style={gs.unknownWrap}>
            <Feather name="alert-triangle" size={10} color="rgba(245,158,11,0.8)" />
            <Text style={gs.unknownText}>Unknown competitor</Text>
          </View>
        ) : (
          <Text
            style={[gs.competitorName, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {gap.competitorName}
          </Text>
        )}
      </View>

      <View style={gs.rowRight}>
        {gap.volumeEstimate != null && (
          <Text style={gs.volume}>
            {gap.volumeEstimate >= 1000
              ? `${(gap.volumeEstimate / 1000).toFixed(1)}k`
              : gap.volumeEstimate}
            /mo
          </Text>
        )}
        {gap.competitorRank != null && (
          <View style={[gs.rankBadge, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
            <Text style={[gs.rankText, { color: colors.primary }]}>#{gap.competitorRank}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function KeywordsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<"keywords" | "gaps">("keywords");

  const { data: keywords = [], isLoading: kwLoading, refetch: refetchKw } = useListKeywords();
  const { gaps, loading: gapsLoading, error: gapsError, refetch: refetchGaps } = useKeywordGaps();

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

  const unresolvableCount = gaps.filter((g) => g.competitorName == null).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={[s.headerWrap, { paddingTop: topPad + 16, backgroundColor: colors.background }]}>
        <Text style={[s.screenTitle, { color: colors.foreground }]}>Keywords</Text>

        {/* Segment control */}
        <View style={[s.segmentWrap, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Pressable
            style={[s.segBtn, section === "keywords" && { backgroundColor: colors.card }]}
            onPress={() => setSection("keywords")}
          >
            <Text style={[s.segLabel, { color: section === "keywords" ? colors.foreground : colors.mutedForeground }]}>
              Keywords
            </Text>
            <View style={[s.segCount, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[s.segCountText, { color: colors.primary }]}>{(keywords as Keyword[]).length}</Text>
            </View>
          </Pressable>
          <Pressable
            style={[s.segBtn, section === "gaps" && { backgroundColor: colors.card }]}
            onPress={() => setSection("gaps")}
          >
            <Text style={[s.segLabel, { color: section === "gaps" ? colors.foreground : colors.mutedForeground }]}>
              Gaps
            </Text>
            <View style={[s.segCount, { backgroundColor: gapsError ? colors.destructive + "20" : colors.primary + "20" }]}>
              <Text style={[s.segCountText, { color: gapsError ? colors.destructive : colors.primary }]}>{gapsError ? "—" : gaps.length}</Text>
            </View>
          </Pressable>
        </View>

        {section === "keywords" && (
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
        )}
      </View>

      {section === "keywords" ? (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: botPad, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!filtered.length}
          refreshControl={
            <RefreshControl refreshing={kwLoading} onRefresh={refetchKw} tintColor={colors.primary} />
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
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: botPad }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={gapsLoading} onRefresh={refetchGaps} tintColor={colors.primary} />
          }
        >
          {/* Unresolvable warning banner */}
          {!gapsLoading && unresolvableCount > 0 && (
            <View style={[gs.warnBanner, { borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.07)" }]}>
              <Feather name="alert-triangle" size={14} color="rgba(245,158,11,0.9)" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={gs.warnTitle}>
                  {unresolvableCount} gap{unresolvableCount === 1 ? "" : "s"} with unknown competitor
                </Text>
                <Text style={gs.warnBody}>
                  {unresolvableCount === 1 ? "This signal was" : "These signals were"} stored without organic result data, so the competitor identity cannot be resolved. Run a fresh discovery scan to populate missing names.
                </Text>
              </View>
            </View>
          )}

          {gapsLoading ? (
            <View style={[s.empty, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Feather name="loader" size={32} color={colors.mutedForeground} />
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Loading gaps…</Text>
            </View>
          ) : gapsError ? (
            <View style={[s.empty, gs.errorBox, { borderColor: "rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.06)" }]}>
              <Feather name="wifi-off" size={32} color="rgba(239,68,68,0.7)" />
              <Text style={[s.emptyTitle, gs.errorTitle]}>Couldn't load gaps</Text>
              <Text style={[s.emptyText, gs.errorBody]}>
                Something went wrong while fetching keyword gap data. Check your connection and try again.
              </Text>
              <Pressable
                style={[gs.retryBtn, { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)" }]}
                onPress={refetchGaps}
                accessibilityRole="button"
                accessibilityLabel="Retry loading gaps"
              >
                <Feather name="refresh-cw" size={14} color="rgba(239,68,68,0.85)" />
                <Text style={gs.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : gaps.length === 0 ? (
            <View style={[s.empty, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Feather name="target" size={32} color={colors.mutedForeground} />
              <Text style={[s.emptyTitle, { color: colors.foreground }]}>No gaps found yet</Text>
              <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                Run a Discovery scan from the web dashboard to detect keywords your competitors rank for that you're missing.
              </Text>
            </View>
          ) : (
            gaps.map((gap) => <GapRow key={gap.id} gap={gap} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  headerWrap: { paddingHorizontal: 20, paddingBottom: 16 },
  screenTitle: { fontSize: 28, fontWeight: "800" as const, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 14 },
  segmentWrap: {
    flexDirection: "row", borderWidth: 1, borderRadius: 12,
    padding: 3, marginBottom: 14,
  },
  segBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 7, borderRadius: 10,
  },
  segLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const },
  segCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  segCountText: { fontSize: 10, fontFamily: "Inter_600SemiBold", fontWeight: "700" as const },
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

const gs = StyleSheet.create({
  warnBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16,
  },
  warnTitle: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const,
    color: "rgba(245,158,11,0.95)", marginBottom: 3,
  },
  warnBody: {
    fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17,
    color: "rgba(245,158,11,0.7)",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10,
    gap: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  rowMain: { flex: 1, gap: 3, minWidth: 0 },
  gapKeyword: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, lineHeight: 20 },
  competitorName: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  unknownWrap: { flexDirection: "row", alignItems: "center", gap: 4 },
  unknownText: {
    fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic",
    color: "rgba(245,158,11,0.75)",
  },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  volume: {
    fontSize: 10, fontFamily: "Inter_600SemiBold", fontWeight: "700" as const,
    color: "#F59E0B",
  },
  rankBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  rankText: { fontSize: 9, fontFamily: "Inter_600SemiBold", fontWeight: "800" as const },
  errorBox: { borderStyle: "solid" },
  errorTitle: { color: "rgba(239,68,68,0.9)" },
  errorBody: { color: "rgba(239,68,68,0.65)" },
  retryBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4,
  },
  retryText: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const,
    color: "rgba(239,68,68,0.85)",
  },
});
