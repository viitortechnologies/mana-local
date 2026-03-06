import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export function Footer() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <View
      style={StyleSheet.flatten([
        styles.container,
        { backgroundColor: colors.headerBg, borderTopColor: colors.tabIconDefault },
      ])}
    >
      <View>
        <Text style={[styles.brand, { color: colors.text }]}>Mana Local</Text>
        <Text style={[styles.tagline, { color: colors.tabIconDefault }]}>Voice • Support • Serve</Text>
      </View>
      <Text style={[styles.small, { color: colors.tabIconDefault }]}>
        For Armoor · Nirmal · Jagtial
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: Platform.OS === 'web' ? 0.5 : 0.3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 6,
    elevation: 8,
  },
  brand: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  tagline: {
    fontSize: 12,
  },
  small: {
    fontSize: 11,
    textAlign: 'right',
  },
});

