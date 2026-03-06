import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function PhoneScreen() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid', 'Enter a valid 10-digit Indian mobile number.');
      return;
    }
    const last10 = digits.slice(-10);
    const normalized = `+91${last10}`;

    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setLoading(false);

    if (error) {
      Alert.alert('Could not send OTP', error.message);
      return;
    }
    router.replace({ pathname: '/(auth)/otp', params: { phone: normalized } });
  };

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
      <Text style={StyleSheet.flatten([styles.title, { color: colors.text }])}>Mana Local</Text>
      <Text style={StyleSheet.flatten([styles.subtitle, { color: colors.tabIconDefault }])}>Voice • Support • Serve</Text>
      <Text style={StyleSheet.flatten([styles.label, { color: colors.text }])}>Mobile number (OTP required)</Text>
      <Text style={StyleSheet.flatten([styles.hint, { color: colors.tabIconDefault }])}>
        You will receive a one-time password (OTP) by SMS.
      </Text>
      <TextInput
        style={StyleSheet.flatten([styles.input, { color: colors.text, borderColor: colors.tabIconDefault }])}
        placeholder="Mobile (with or without +91)"
        placeholderTextColor={colors.tabIconDefault}
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
        maxLength={10}
        editable={true}
      />
      <Text
        style={StyleSheet.flatten([styles.button, { backgroundColor: colors.tint }])}
        onPress={sendOtp}
      >
        {loading ? 'Sending…' : 'Continue'}
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  label: {
    fontSize: 14,
    marginTop: 24,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
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
