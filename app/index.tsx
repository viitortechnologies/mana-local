import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/src/contexts/AuthContext';
import { ONBOARDING_STORAGE_KEY } from '@/constants/OnboardingSlides';

export default function Index() {
  const { session, isLoading } = useAuth();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY).then((value) => {
      setHasSeenOnboarding(value === '1');
    });
  }, []);

  if (hasSeenOnboarding === null) return null;
  if (!hasSeenOnboarding) return <Redirect href="/onboarding" />;
  if (isLoading) return null;
  if (!session) return <Redirect href="/(auth)/phone" />;
  return <Redirect href="/(tabs)" />;
}
