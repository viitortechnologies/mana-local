import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchCricketData, type CricketMatch } from '@/src/lib/newsApis';

function MatchCard({
  match,
  colors,
  isIndia,
}: {
  match: CricketMatch;
  colors: Record<string, string>;
  isIndia: boolean;
}) {
  return (
    <View style={[styles.matchCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      {isIndia && (
        <View style={[styles.indiaBadge, { backgroundColor: colors.tint + '22' }]}>
          <Text style={[styles.indiaBadgeText, { color: colors.tint }]}>India</Text>
        </View>
      )}
      <Text style={[styles.matchTeams, { color: colors.text }]}>{match.team1} vs {match.team2}</Text>
      <Text style={[styles.matchType, { color: colors.tabIconDefault }]}>{match.matchType}</Text>
      {match.status === 'live' && match.score && (
        <Text style={[styles.matchScore, { color: colors.tint }]}>{match.score}</Text>
      )}
      {match.status === 'result' && match.result && (
        <Text style={[styles.matchResult, { color: colors.tabIconDefault }]}>{match.result}</Text>
      )}
      <Text style={[styles.matchDate, { color: colors.tabIconDefault }]}>
        {new Date(match.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        {match.venue ? ` · ${match.venue}` : ''}
      </Text>
    </View>
  );
}

export default function CricketScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const [live, setLive] = useState<CricketMatch[]>([]);
  const [upcoming, setUpcoming] = useState<CricketMatch[]>([]);
  const [results, setResults] = useState<CricketMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await fetchCricketData();
    setLive(data.live);
    setUpcoming(data.upcoming);
    setResults(data.results);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.tint} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Cricket Updates</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
          }
        >
          {live.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Live Match</Text>
              {live.map((m) => (
                <MatchCard key={m.id} match={m} colors={colors} isIndia={m.isIndia} />
              ))}
            </>
          )}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming Matches</Text>
          {upcoming.length === 0 ? (
            <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No upcoming matches</Text>
          ) : (
            upcoming.map((m) => <MatchCard key={m.id} match={m} colors={colors} isIndia={m.isIndia} />)
          )}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Results</Text>
          {results.length === 0 ? (
            <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No recent results</Text>
          ) : (
            results.map((m) => <MatchCard key={m.id} match={m} colors={colors} isIndia={m.isIndia} />)
          )}
          <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
            Data is sample. For live scores use CricAPI or RapidAPI Cricket (free tier).
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 32 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12, marginTop: 8 },
  matchCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  indiaBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 8 },
  indiaBadgeText: { fontSize: 12, fontWeight: '700' },
  matchTeams: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  matchType: { fontSize: 13, marginBottom: 4 },
  matchScore: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  matchResult: { fontSize: 14, marginBottom: 4 },
  matchDate: { fontSize: 12 },
  empty: { fontSize: 14, marginBottom: 16 },
  hint: { fontSize: 12, marginTop: 16, fontStyle: 'italic' },
});
