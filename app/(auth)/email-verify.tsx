import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function EmailVerifyScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const sendEmailLink = async () => {
    const e = email.trim();
    if (!e || !e.includes('@')) {
      Alert.alert('Invalid', 'Enter a valid email address.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ email: e });
    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }
    const { error: linkError } = await supabase.auth.resend({
      type: 'email_change',
      email: e,
    });
    setLoading(false);
    if (linkError) {
      Alert.alert('Error', linkError.message);
      return;
    }
    Alert.alert(
      'Check your email',
      'We sent a verification link. Open it to verify your email, then return here.',
      [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Email verification required</Text>
      <Text style={[styles.subtitle, { color: colors.tabIconDefault }]}>
        Enter your email to receive a verification link.
      </Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="your@email.com"
        placeholderTextColor={colors.tabIconDefault}
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
      />
      <Text
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={sendEmailLink}
      >
        {loading ? 'Sending…' : 'Send verification link'}
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
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginTop: 20,
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
