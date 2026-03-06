import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import Colors from '@/constants/Colors';
import { useColorScheme } from './useColorScheme';
import { useAuth } from '@/src/contexts/AuthContext';

const MESSAGE = 'Complete your profile to unlock full access';

export function ProfileBanner() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { profile } = useAuth();

  let extra = '';
  if (profile?.created_at) {
    const created = new Date(profile.created_at).getTime();
    const days = Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
    extra = ` · ${days} days since sign up`;
  }

  return (
    <Link href="/(tabs)/edit-profile" asChild>
      <Pressable
        style={({ pressed }) =>
          StyleSheet.flatten([
            styles.banner,
            { backgroundColor: colors.tint },
            pressed && styles.bannerPressed,
          ])
        }
      >
        <MaterialCommunityIcons name="account-alert-outline" size={20} color="#ffffff" style={styles.icon} />
        <Text style={styles.text}>
          {MESSAGE}
          {extra}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" style={styles.chevron} />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0,0,0,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bannerPressed: { opacity: 0.9 },
  icon: { marginRight: 8 },
  chevron: { marginLeft: 8 },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
});
