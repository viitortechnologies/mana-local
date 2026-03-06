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
import { fetchWeatherFull, type WeatherFull } from '@/src/lib/newsApis';
import { weatherCodeToLabel } from '@/src/lib/envApi';

export default function WeatherScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const [data, setData] = useState<WeatherFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const locationName = selectedLocation?.name ?? 'Armoor';
    const result = await fetchWeatherFull(locationName);
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Weather</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : !data ? (
        <View style={styles.centered}>
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>Unable to load weather</Text>
          <Pressable onPress={load} style={[styles.retryBtn, { backgroundColor: colors.tint }]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <Text style={[styles.location, { color: colors.tabIconDefault }]}>{data.label}</Text>
            <View style={styles.tempRow}>
              <MaterialCommunityIcons name="thermometer" size={48} color={colors.tint} />
              <Text style={[styles.temp, { color: colors.text }]}>{Math.round(data.temp)}°C</Text>
            </View>
            <Text style={[styles.conditions, { color: colors.text }]}>
              {weatherCodeToLabel(data.weatherCode)} · {data.humidity}% humidity
            </Text>
            <View style={styles.metaRow}>
              <View style={[styles.meta, { backgroundColor: colors.tint + '18' }]}>
                <MaterialCommunityIcons name="weather-rainy" size={20} color={colors.tint} />
                <Text style={[styles.metaText, { color: colors.text }]}>Chance of rain: {data.rainChanceToday}%</Text>
              </View>
              {data.heatAlert && (
                <View style={[styles.alert, { backgroundColor: '#fef3c7' }]}>
                  <MaterialCommunityIcons name="alert" size={20} color="#b45309" />
                  <Text style={[styles.alertText, { color: '#92400e' }]}>Heat alert</Text>
                </View>
              )}
            </View>
            <Text style={[styles.summary, { color: colors.tabIconDefault }]}>{data.summary}</Text>
          </View>

          <Pressable
            style={[styles.expandBtn, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
            onPress={() => setExpanded(!expanded)}
          >
            <Text style={[styles.expandBtnText, { color: colors.tint }]}>
              {expanded ? 'Hide' : 'Show'} 7-day forecast
            </Text>
            <MaterialCommunityIcons name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.tint} />
          </Pressable>
          {expanded && data.daily.length > 0 && (
            <View style={[styles.forecastCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.forecastTitle, { color: colors.text }]}>7-day forecast</Text>
              {data.daily.map((day, i) => (
                <View key={day.date} style={[styles.forecastRow, i < data.daily.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                  <Text style={[styles.forecastDate, { color: colors.text }]}>
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[styles.forecastCond, { color: colors.tabIconDefault }]}>{weatherCodeToLabel(day.weatherCode)}</Text>
                  <Text style={[styles.forecastTemp, { color: colors.text }]}>
                    {Math.round(day.tempMax)}° / {Math.round(day.tempMin)}°
                  </Text>
                  <Text style={[styles.forecastRain, { color: colors.tabIconDefault }]}>{day.precipitationProbabilityMax}% rain</Text>
                </View>
              ))}
            </View>
          )}
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  empty: { fontSize: 16, marginBottom: 16 },
  retryBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  location: { fontSize: 14, marginBottom: 8 },
  tempRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  temp: { fontSize: 42, fontWeight: '700', marginLeft: 12 },
  conditions: { fontSize: 16, marginBottom: 12 },
  metaRow: { gap: 8, marginBottom: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, gap: 8 },
  metaText: { fontSize: 14 },
  alert: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, gap: 8 },
  alertText: { fontSize: 14, fontWeight: '600' },
  summary: { fontSize: 14, fontStyle: 'italic' },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  expandBtnText: { fontSize: 16, fontWeight: '600' },
  forecastCard: { padding: 16, borderRadius: 16, borderWidth: 1 },
  forecastTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  forecastRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingVertical: 10, gap: 8 },
  forecastDate: { fontSize: 14, fontWeight: '600', width: 120 },
  forecastCond: { fontSize: 13, flex: 1 },
  forecastTemp: { fontSize: 14 },
  forecastRain: { fontSize: 13 },
});
