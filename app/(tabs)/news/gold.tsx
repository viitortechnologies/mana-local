import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { fetchGoldSilverRates, type GoldSilverRates } from '@/src/lib/newsApis';

export default function GoldScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const [data, setData] = useState<GoldSilverRates | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchGoldSilverRates();
    setData(result ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.tint} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Gold & Silver Rates</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : !data ? (
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>Unable to load rates</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.unit, { color: colors.tabIconDefault }]}>{data.unit}</Text>
            <View style={styles.row}>
              <MaterialCommunityIcons name="gold" size={28} color={colors.tint} />
              <View style={styles.priceBlock}>
                <Text style={[styles.label, { color: colors.tabIconDefault }]}>Gold 24K</Text>
                <Text style={[styles.price, { color: colors.text }]}>₹{data.gold24K.toLocaleString()}</Text>
              </View>
            </View>
            <View style={[styles.row, { marginTop: 14 }]}>
              <MaterialCommunityIcons name="gold" size={28} color={colors.tint} />
              <View style={styles.priceBlock}>
                <Text style={[styles.label, { color: colors.tabIconDefault }]}>Gold 22K</Text>
                <Text style={[styles.price, { color: colors.text }]}>₹{data.gold22K.toLocaleString()}</Text>
              </View>
            </View>
            <View style={[styles.row, { marginTop: 14 }]}>
              <MaterialCommunityIcons name="silver-stack" size={28} color={colors.tint} />
              <View style={styles.priceBlock}>
                <Text style={[styles.label, { color: colors.tabIconDefault }]}>Silver</Text>
                <Text style={[styles.price, { color: colors.text }]}>₹{data.silver.toLocaleString()}</Text>
              </View>
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
            Rates updated once per day. For live rates use GoldPricez or Metals-API.
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
  card: { padding: 20, borderRadius: 16, borderWidth: 1 },
  unit: { fontSize: 14, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  priceBlock: { marginLeft: 12 },
  label: { fontSize: 13 },
  price: { fontSize: 22, fontWeight: '700' },
  empty: { fontSize: 16 },
  hint: { fontSize: 12, marginTop: 16, fontStyle: 'italic' },
});
