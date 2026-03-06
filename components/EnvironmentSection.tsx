import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  aqiCategory,
  COMPARE_CITY_OPTIONS,
  fetchEnvForCity,
  weatherCodeToLabel,
  type EnvData,
} from '@/src/lib/envApi';

interface EnvironmentSectionProps {
  cityName: string;
}

function EnvCard({
  data,
  colors,
}: {
  data: EnvData | null;
  colors: Record<string, string>;
}) {
  const weather = data?.weather;
  const aq = data?.airQuality;
  const aqi = aq?.usAqi ?? null;
  const { label: aqiLabel, color: aqiColor } = aqiCategory(aqi);

  return (
    <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.tint }]} numberOfLines={1} ellipsizeMode="tail">
        {data?.label ?? '—'}
      </Text>
      {!data ? (
        <View style={styles.cardLoader}>
          <ActivityIndicator size="small" color={colors.tint} />
        </View>
      ) : (
        <View style={styles.cardContent}>
          {/* Temperature */}
          <View style={styles.cardRow}>
            <MaterialCommunityIcons name="thermometer" size={20} color={colors.tint} />
            <View style={styles.cardRowText}>
              <Text style={[styles.cardRowLabel, { color: colors.secondaryText }]}>Temperature</Text>
              <Text style={[styles.cardRowValue, { color: colors.text }]}>
                {weather ? `${Math.round(weather.temp)}°C` : '—'}
              </Text>
            </View>
          </View>
          {/* Weather & humidity */}
          <View style={styles.cardRow}>
            <MaterialCommunityIcons name="weather-partly-cloudy" size={20} color={colors.tint} />
            <View style={styles.cardRowText}>
              <Text style={[styles.cardRowLabel, { color: colors.secondaryText }]}>Conditions</Text>
              <Text style={[styles.cardRowValue, { color: colors.text }]} numberOfLines={2}>
                {weather
                  ? `${weatherCodeToLabel(weather.weatherCode)} · ${weather.humidity}% humidity`
                  : '—'}
              </Text>
            </View>
          </View>
          {/* Air quality */}
          <View style={[styles.cardRow, styles.cardRowAqi, { backgroundColor: colors.background }]}>
            <MaterialCommunityIcons name="air-filter" size={20} color={colors.tint} />
            <View style={styles.cardRowText}>
              <Text style={[styles.cardRowLabel, { color: colors.secondaryText }]}>Air quality (AQI)</Text>
              {aqi != null ? (
                <View style={styles.aqiBlock}>
                  <View style={[styles.aqiBadge, { backgroundColor: aqiColor }]}>
                    <Text style={styles.aqiBadgeText}>{aqi}</Text>
                  </View>
                  <Text style={[styles.aqiMeaning, { color: colors.text }]} numberOfLines={2}>
                    {aqiLabel}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.cardRowValue, { color: colors.secondaryText }]}>—</Text>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

export function EnvironmentSection({ cityName }: EnvironmentSectionProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as Record<string, string>;
  const [expanded, setExpanded] = useState(false);
  const [compareCity, setCompareCity] = useState<string>('Hyderabad');
  const [cityData, setCityData] = useState<EnvData | null>(null);
  const [compareData, setCompareData] = useState<EnvData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityPickerVisible, setCityPickerVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [city, compare] = await Promise.all([
        fetchEnvForCity(cityName || 'Armoor'),
        fetchEnvForCity(compareCity),
      ]);
      setCityData(city);
      setCompareData(compare);
    } catch (e) {
      setError('Unable to load data');
      setCityData(null);
      setCompareData(null);
    } finally {
      setLoading(false);
    }
  }, [cityName, compareCity]);

  const handleExpand = useCallback(() => {
    setExpanded(true);
    load();
  }, [load]);

  const handleChangeCompareCity = useCallback((newCity: string) => {
    setCompareCity(newCity);
    setCityPickerVisible(false);
    setCityData(null);
    setCompareData(null);
    setLoading(true);
    setError(null);
    Promise.all([
      fetchEnvForCity(cityName || 'Armoor'),
      fetchEnvForCity(newCity),
    ])
      .then(([city, compare]) => {
        setCityData(city);
        setCompareData(compare);
      })
      .catch(() => {
        setError('Unable to load data');
        setCityData(null);
        setCompareData(null);
      })
      .finally(() => setLoading(false));
  }, [cityName]);

  if (!expanded) {
    return (
      <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
        <Pressable
          style={[styles.collapsedRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
          onPress={handleExpand}
        >
          <MaterialCommunityIcons name="weather-partly-cloudy" size={24} color={colors.tint} />
          <Text style={[styles.collapsedText, { color: colors.text }]} numberOfLines={1}>
            Weather & air quality — tap to compare with {compareCity}
          </Text>
          <MaterialCommunityIcons name="chevron-down" size={24} color={colors.tabIconDefault} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>
          OUR ENVIRONMENT
        </Text>
        <Text style={[styles.tagline, { color: colors.text }]}>
          Weather & air quality — compare with {compareCity}
        </Text>
        <Pressable
          style={styles.changeCityRow}
          onPress={() => setCityPickerVisible(true)}
        >
          <Text style={[styles.cta, { color: colors.tint }]}>
            Change compare city
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={colors.tint} />
        </Pressable>
      </View>

      {loading && !cityData && !compareData ? (
        <View style={[styles.loadingBox, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
            Loading weather & air quality…
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.cardsRow}>
            <View style={styles.half}>
              <EnvCard data={cityData} colors={colors} />
            </View>
            <View style={styles.half}>
              <EnvCard data={compareData} colors={colors} />
            </View>
          </View>

          {error && (
            <Text style={[styles.errorText, { color: colors.secondaryText }]}>{error}</Text>
          )}

          <Text style={[styles.aqiLegend, { color: colors.secondaryText }]}>
            AQI: 0–50 Good · 51–100 Moderate · 101+ limit time outside if sensitive
          </Text>

          <Pressable
            style={styles.collapseRow}
            onPress={() => setExpanded(false)}
          >
            <MaterialCommunityIcons name="chevron-up" size={22} color={colors.tabIconDefault} />
            <Text style={[styles.collapseText, { color: colors.secondaryText }]}>Hide weather</Text>
          </Pressable>
        </>
      )}

      <Text style={[styles.attribution, { color: colors.secondaryText }]}>
        Data: Open-Meteo (open-meteo.com)
      </Text>

      <Modal
        visible={cityPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCityPickerVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCityPickerVisible(false)}>
          <Pressable style={[styles.modalBox, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Compare with city</Text>
              <Pressable onPress={() => setCityPickerVisible(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={24} color={colors.tabIconDefault} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalList}>
              {COMPARE_CITY_OPTIONS.map((city) => (
                <Pressable
                  key={city}
                  style={[
                    styles.modalItem,
                    { borderColor: colors.border },
                    compareCity === city && { backgroundColor: colors.tint + '20', borderColor: colors.tint },
                  ]}
                  onPress={() => handleChangeCompareCity(city)}
                >
                  <Text style={[styles.modalItemText, { color: colors.text }]}>{city}</Text>
                  {compareCity === city && <MaterialCommunityIcons name="check" size={20} color={colors.tint} />}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  cta: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.9,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  collapsedText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  changeCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  collapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
  },
  collapseText: {
    fontSize: 14,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalList: {
    maxHeight: 280,
    padding: 12,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  modalItemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  half: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    minHeight: 200,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardLoader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 120,
  },
  cardContent: {},
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  cardRowText: {
    flex: 1,
    minWidth: 0,
  },
  cardRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardRowValue: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  cardRowAqi: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 0,
  },
  aqiBlock: {
    flexDirection: 'column',
    gap: 4,
  },
  aqiBadge: {
    alignSelf: 'flex-start',
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  aqiBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  aqiMeaning: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  loadingBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  aqiLegend: {
    marginTop: 12,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
    opacity: 0.9,
  },
  attribution: {
    marginTop: 14,
    fontSize: 10,
    textAlign: 'center',
    opacity: 0.8,
  },
});
