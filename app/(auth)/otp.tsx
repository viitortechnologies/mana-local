import React, { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function OtpScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // OTP was opened with replace(), so there is no screen to go back to. Handle device back by going to phone screen.
  useEffect(() => {
    const onBack = () => {
      router.replace('/(auth)/phone');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  const verifyOtp = async () => {
    const entered = otp.trim();
    if (!entered || !phone) {
      Alert.alert('Error', 'Enter the OTP.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        phone: String(phone),
        token: entered,
        type: 'sms',
      });

      if (error) {
        Alert.alert(
          'Invalid OTP',
          error.message || 'The code you entered is incorrect or has expired. Please request a new OTP.'
        );
        return;
      }

      const user = data?.user;
      const session = data?.session;
      if (!user?.id || !session) {
        Alert.alert('Sign-in incomplete', 'No user or session returned. Please try again.');
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        // @ts-expect-error - phone added in migration 011
        .update({ phone, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (updateError) {
        const msg = updateError.message ?? '';
        // If a legacy profile row already has this phone for a different user,
        // the unique constraint can fail. In that case, we ignore it and let
        // the user continue, since auth already knows their phone.
        if (!msg.includes('profiles_phone_key')) {
          Alert.alert(
            'Profile update failed',
            msg || 'Could not save phone number to your profile. You can continue using the app.'
          );
        }
      }

      router.replace('/(tabs)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
      <Pressable style={styles.backRow} onPress={() => router.replace('/(auth)/phone')}>
        <Text style={[styles.backText, { color: colors.tint }]}>← Back to mobile number</Text>
      </Pressable>
      <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])}>Enter OTP</Text>
      <Text style={StyleSheet.flatten([styles.subtitle, { color: colors.tabIconDefault }])}>Sent to {phone}</Text>
      <TextInput
        style={StyleSheet.flatten([styles.input, { color: colors.text, borderColor: colors.tabIconDefault }])}
        placeholder="Enter the 6-digit code"
        placeholderTextColor={colors.tabIconDefault}
        keyboardType="number-pad"
        value={otp}
        onChangeText={setOtp}
        maxLength={6}
        editable={!loading}
      />
      <Text
        style={StyleSheet.flatten([styles.button, { backgroundColor: colors.tint }])}
        onPress={verifyOtp}
      >
        {loading ? 'Verifying…' : 'Verify'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  backRow: { marginBottom: 20 },
  backText: { fontSize: 16 },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 18,
    marginTop: 20,
    letterSpacing: 4,
  },
  button: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
