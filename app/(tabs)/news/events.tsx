import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useLocation } from '@/src/contexts/LocationContext';
import { supabase } from '@/src/lib/supabase';

type LocalEvent = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_location: string | null;
  organizer_name: string | null;
  contact_number: string | null;
  image_url: string | null;
};

export default function EventsScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const [events, setEvents] = useState<LocalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!selectedLocation?.id) {
      setEvents([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('local_events')
      .select('id, title, description, event_date, event_location, organizer_name, contact_number, image_url')
      .eq('location_id', selectedLocation.id)
      .eq('status', 'approved')
      .gte('event_date', new Date().toISOString().slice(0, 10))
      .order('event_date', { ascending: true });
    if (!error) setEvents((data as LocalEvent[]) ?? []);
    else setEvents([]);
    setLoading(false);
  }, [selectedLocation?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.tint} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Local Events</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : events.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="calendar-blank-outline" size={48} color={colors.tabIconDefault} />
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No upcoming events in your area</Text>
          <Text style={[styles.emptyHint, { color: colors.tabIconDefault }]}>Events submitted by users appear here after approval.</Text>
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.cardImage} resizeMode="cover" />
              ) : (
                <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.tint + '22' }]}>
                  <MaterialCommunityIcons name="calendar" size={32} color={colors.tint} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
                <Text style={[styles.cardDate, { color: colors.tabIconDefault }]}>
                  {new Date(item.event_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </Text>
                {item.event_location ? (
                  <Text style={[styles.cardLocation, { color: colors.tabIconDefault }]} numberOfLines={1}>
                    {item.event_location}
                  </Text>
                ) : null}
                <Pressable
                  style={[styles.viewBtn, { backgroundColor: colors.tint }]}
                  onPress={() => {}}
                >
                  <Text style={styles.viewBtnText}>View details</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
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
  empty: { fontSize: 16, marginTop: 12, textAlign: 'center' },
  emptyHint: { fontSize: 13, marginTop: 8, textAlign: 'center' },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardImage: { width: '100%', height: 140 },
  cardImagePlaceholder: { width: '100%', height: 140, alignItems: 'center', justifyContent: 'center' },
  cardBody: { padding: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 6 },
  cardDate: { fontSize: 14, marginBottom: 4 },
  cardLocation: { fontSize: 13, marginBottom: 12 },
  viewBtn: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  viewBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
