import React from 'react';
import { Stack } from 'expo-router';

export default function NewsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="weather" />
      <Stack.Screen name="cricket" />
      <Stack.Screen name="events" />
      <Stack.Screen name="fuel" />
      <Stack.Screen name="gold" />
      <Stack.Screen name="emergency" />
    </Stack>
  );
}
