import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { supabase } from '@/src/lib/supabase';

type EmergencyContact = {
  id: string;
  category: string;
  name: string;
  phone: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  ambulance: 'Ambulance',
  police: 'Police',
  fire: 'Fire station',
  hospital: 'Nearby hospitals',
  blood_bank: 'Blood banks',
};

const CATEGORY_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  ambulance: 'ambulance',
  police: 'shield-account',
  fire: 'fire',
  hospital: 'hospital-building',
  blood_bank: 'water',
};

export default function EmergencyScreen() {
  const colors = Colors[useColorScheme() ?? 'light'];
  const router = useRouter();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('emergency_contacts')
      .select('id, category, name, phone')
      .order('category')
      .order('display_order');
    if (!error) setContacts((data as EmergencyContact[]) ?? []);
    else setContacts([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onCall = (phone: string) => {
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
  };

  const byCategory = contacts.reduce((acc, c) => {
    const cat = c.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {} as Record<string, EmergencyContact[]>);

  const categories = Object.keys(byCategory).sort();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.tint} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Emergency Contacts</Text>
      </View>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="phone-alert-outline" size={48} color={colors.tabIconDefault} />
          <Text style={[styles.empty, { color: colors.tabIconDefault }]}>No emergency contacts added yet</Text>
          <Text style={[styles.emptyHint, { color: colors.tabIconDefault }]}>
            Add contacts in the database (emergency_contacts table) or seed with ambulance, police, fire, hospitals, blood banks.
          </Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => c}
          contentContainerStyle={styles.list}
          renderItem={({ item: category }) => (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[category] ?? 'phone'}
                  size={22}
                  color={colors.tint}
                />
                <Text style={[styles.sectionTitle, { color: colors.text }]}>
                  {CATEGORY_LABELS[category] ?? category}
                </Text>
              </View>
              {byCategory[category].map((c) => (
                <View key={c.id} style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <View style={styles.cardMain}>
                    <Text style={[styles.cardName, { color: colors.text }]}>{c.name}</Text>
                    <Text style={[styles.cardPhone, { color: colors.tabIconDefault }]}>{c.phone}</Text>
                  </View>
                  <Pressable
                    style={[styles.callBtn, { backgroundColor: colors.tint }]}
                    onPress={() => onCall(c.phone)}
                  >
                    <MaterialCommunityIcons name="phone" size={20} color="#fff" />
                    <Text style={styles.callBtnText}>Call</Text>
                  </Pressable>
                </View>
              ))}
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
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: '600' },
  cardPhone: { fontSize: 14, marginTop: 2 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginLeft: 12,
  },
  callBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
