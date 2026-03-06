import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const MODULES: { id: string; title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { id: 'weather', title: 'Weather Information', subtitle: 'Temperature, rain chance, 7-day forecast', icon: 'weather-partly-cloudy' },
  { id: 'cricket', title: 'Cricket Updates', subtitle: 'Live scores, upcoming India matches', icon: 'cricket' },
  { id: 'events', title: 'Local Events', subtitle: 'Community events near you', icon: 'calendar-star' },
  { id: 'fuel', title: 'Fuel Prices', subtitle: 'Petrol & diesel in your city', icon: 'fuel' },
  { id: 'gold', title: 'Gold & Silver Rates', subtitle: 'Daily 22K, 24K gold and silver', icon: 'gold' },
  { id: 'emergency', title: 'Emergency Contacts', subtitle: 'Ambulance, police, hospitals', icon: 'phone-alert' },
];

export default function NewsDashboard() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
        <Text style={[styles.title, { color: colors.text }]}>News & Info</Text>
        <Text style={[styles.subtitle, { color: colors.tabIconDefault }]}>Local events, weather, cricket, fuel & more</Text>
      </View>
      {MODULES.map((mod) => (
        <Pressable
          key={mod.id}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: colors.cardBg ?? colors.background, borderColor: colors.border ?? colors.tabIconDefault },
            pressed && styles.cardPressed,
          ]}
          onPress={() => router.push(`/(tabs)/news/${mod.id}` as any)}
        >
          <View style={[styles.iconWrap, { backgroundColor: colors.tint + '22' }]}>
            <MaterialCommunityIcons name={mod.icon} size={32} color={colors.tint} />
          </View>
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{mod.title}</Text>
            <Text style={[styles.cardSubtitle, { color: colors.tabIconDefault }]} numberOfLines={2}>{mod.subtitle}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.tabIconDefault} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: { opacity: 0.88 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  cardSubtitle: { fontSize: 13 },
});
