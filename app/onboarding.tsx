import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import {
  ONBOARDING_SLIDES,
  ONBOARDING_STORAGE_KEY,
} from '@/constants/OnboardingSlides';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AUTO_SLIDE_MS = 5000;
const PROGRESS_BAR_SEGMENT_WIDTH = 80;
const PROGRESS_BAR_GAP = 6;

export default function OnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [index, setIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const autoSlideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const i = Math.round(offset / SCREEN_WIDTH);
    setIndex(Math.min(Math.max(0, i), ONBOARDING_SLIDES.length - 1));
  }, []);

  const finishOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    router.replace('/');
  }, [router]);

  const goNext = useCallback(() => {
    if (index < ONBOARDING_SLIDES.length - 1) {
      flatListRef.current?.scrollToOffset({
        offset: (index + 1) * SCREEN_WIDTH,
        animated: true,
      });
    } else {
      finishOnboarding();
    }
  }, [index, finishOnboarding]);

  // Auto-slide every 5s and progress bar animation
  useEffect(() => {
    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: AUTO_SLIDE_MS,
      useNativeDriver: false,
    });
    anim.start();

    autoSlideTimerRef.current = setTimeout(() => {
      if (index < ONBOARDING_SLIDES.length - 1) {
        setIndex((prev) => prev + 1);
        flatListRef.current?.scrollToOffset({
          offset: (index + 1) * SCREEN_WIDTH,
          animated: true,
        });
      } else {
        finishOnboarding();
      }
    }, AUTO_SLIDE_MS);

    return () => {
      anim.stop();
      if (autoSlideTimerRef.current) clearTimeout(autoSlideTimerRef.current);
    };
  }, [index]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PROGRESS_BAR_SEGMENT_WIDTH],
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.skipWrap}>
        <Pressable
          onPress={finishOnboarding}
          style={({ pressed }) =>
            StyleSheet.flatten([styles.skipBtn, pressed && styles.skipBtnPressed])
          }
        >
          <Text style={[styles.skipText, { color: colors.secondaryText }]}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <View style={styles.slideContent}>
              <Image
                source={item.image}
                style={styles.slideImage}
                resizeMode="contain"
              />
              {item.title ? (
                <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
              ) : null}
              {item.subtitle ? (
                <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {ONBOARDING_SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.tint : colors.border,
                  width: i === index ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
        <View style={[styles.progressTrackWrap, { gap: PROGRESS_BAR_GAP }]}>
          {ONBOARDING_SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressSegmentTrack,
                {
                  width: PROGRESS_BAR_SEGMENT_WIDTH,
                  backgroundColor: colors.border,
                },
              ]}
            >
              {i === index ? (
                <Animated.View
                  style={[
                    styles.progressSegmentFill,
                    {
                      width: progressWidth,
                      backgroundColor: colors.tint,
                    },
                  ]}
                />
              ) : i < index ? (
                <View
                  style={[
                    styles.progressSegmentFill,
                    {
                      width: PROGRESS_BAR_SEGMENT_WIDTH,
                      backgroundColor: colors.tint,
                    },
                  ]}
                />
              ) : null}
            </View>
          ))}
        </View>
        <Pressable
          onPress={goNext}
          style={[styles.nextBtn, { backgroundColor: colors.tint }]}
        >
          <Text style={styles.nextBtnText}>
            {index === ONBOARDING_SLIDES.length - 1 ? 'Get started' : 'Next'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipWrap: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
  },
  skipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  skipBtnPressed: { opacity: 0.7 },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  slide: {
    width: SCREEN_WIDTH,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    width: SCREEN_WIDTH,
  },
  slideImage: {
    width: SCREEN_WIDTH,
    height: Math.min(SCREEN_HEIGHT * 0.52, 420),
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  progressTrackWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  progressSegmentTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegmentFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  nextBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  nextBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
