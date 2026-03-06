import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocation } from '@/src/contexts/LocationContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';

const TAGLINE = 'Voice • Support • Serve';

export function Header() {
  const { selectedLocation, locations, setSelectedLocationId } = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const title = selectedLocation
    ? `Mana Local – ${selectedLocation.display_name}`
    : 'Mana Local – Armoor 503224';

  return (
    <View style={StyleSheet.flatten([styles.wrapper, { paddingTop: insets.top, backgroundColor: colors.headerBg }])}>
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])} numberOfLines={1}>
            Mana Local
          </Text>
          <Pressable
            style={styles.locationRow}
            onPress={() => setDropdownOpen((o) => !o)}
            hitSlop={8}
          >
            <Text style={StyleSheet.flatten([styles.locationText, { color: colors.tint }])} numberOfLines={1}>
              {selectedLocation?.display_name ?? 'Armoor 503224'}
            </Text>
            <FontAwesome name={dropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.tint} />
          </Pressable>
        </View>
      </View>
      <Text style={StyleSheet.flatten([styles.tagline, { color: colors.tabIconDefault }])}>{TAGLINE}</Text>
      {dropdownOpen && (
        <View style={StyleSheet.flatten([styles.dropdown, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }])}>
          {locations.map((loc) => (
            <Pressable
              key={loc.id}
              style={StyleSheet.flatten([styles.dropdownItem, loc.id === selectedLocation?.id && styles.dropdownItemActive])}
              onPress={() => {
                setSelectedLocationId(loc.id);
                setDropdownOpen(false);
              }}
            >
              <Text style={StyleSheet.flatten([styles.dropdownItemText, { color: colors.text }])}>{loc.display_name}</Text>
              {loc.id === selectedLocation?.id && (
                <FontAwesome name="check" size={14} color={colors.tint} />
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  locationText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tagline: {
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  dropdown: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dropdownItemActive: {
    opacity: 1,
  },
  dropdownItemText: {
    fontSize: 15,
  },
});
