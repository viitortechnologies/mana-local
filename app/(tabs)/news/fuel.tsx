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
import { useLocation } from '@/src/contexts/LocationContext';
import { fetchFuelPrices, type FuelPrices } from '@/src/lib/newsApis';

export default function FuelScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const [data, setData] = useState<FuelPrices | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const city = selectedLocation?.name ?? 'Your city';
    const result = await fetchFuelPrices(city);
    setData(result ?? null);
    setLoading(false);
  }, [selectedLocation?.name]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.tint} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Fuel Prices</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : !data ? (
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>Unable to load fuel prices</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.city, { color: colors.tabIconDefault }]}>{data.city}</Text>
            <View style={styles.row}>
              <MaterialCommunityIcons name="fuel" size={32} color={colors.tint} />
              <View style={styles.priceBlock}>
                <Text style={[styles.label, { color: colors.tabIconDefault }]}>Petrol</Text>
                <Text style={[styles.price, { color: colors.text }]}>₹{data.petrol.toFixed(2)}</Text>
                <Text style={[styles.change, data.petrolChange >= 0 ? { color: '#dc2626' } : { color: '#16a34a' }]}>
                  {data.petrolChange >= 0 ? '+' : ''}{data.petrolChange.toFixed(2)} vs yesterday
                </Text>
              </View>
            </View>
            <View style={[styles.row, { marginTop: 16 }]}>
              <MaterialCommunityIcons name="fuel" size={32} color={colors.tint} />
              <View style={styles.priceBlock}>
                <Text style={[styles.label, { color: colors.tabIconDefault }]}>Diesel</Text>
                <Text style={[styles.price, { color: colors.text }]}>₹{data.diesel.toFixed(2)}</Text>
                <Text style={[styles.change, data.dieselChange >= 0 ? { color: '#dc2626' } : { color: '#16a34a' }]}>
                  {data.dieselChange >= 0 ? '+' : ''}{data.dieselChange.toFixed(2)} vs yesterday
                </Text>
              </View>
            </View>
          </View>
          <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
            Prices cached for 6 hours. For real-time data use RapidAPI Fuel Price India or similar.
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
  city: { fontSize: 14, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  priceBlock: { marginLeft: 12 },
  label: { fontSize: 13 },
  price: { fontSize: 24, fontWeight: '700' },
  change: { fontSize: 13, marginTop: 4 },
  empty: { fontSize: 16 },
  hint: { fontSize: 12, marginTop: 16, fontStyle: 'italic' },
});
