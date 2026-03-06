import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StyleSheet,
  View,
} from 'react-native';
import { BANNER_IMAGES } from '@/constants/BannerImages';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BANNER_HEIGHT = 200;
const PAGINATION_DOT_SIZE = 8;
const AUTO_PLAY_INTERVAL_MS = 4000;
const LIST_PADDING = 16;
const CARD_GAP = 12;
const CONTENT_WIDTH = SCREEN_WIDTH - LIST_PADDING * 2;
const CARD_WIDTH = CONTENT_WIDTH - CARD_GAP;
const CARD_RADIUS = 20;

export function BannerCarousel() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const itemWidth = CARD_WIDTH + CARD_GAP;

  const onMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = e.nativeEvent.contentOffset.x;
    const index = Math.round(offset / itemWidth);
    setActiveIndex(Math.min(Math.max(0, index), BANNER_IMAGES.length - 1));
  }, []);

  useEffect(() => {
    if (BANNER_IMAGES.length <= 1) return;
    const id = setInterval(() => {
      setActiveIndex((prev) => {
        const next = prev + 1 >= BANNER_IMAGES.length ? 0 : prev + 1;
        flatListRef.current?.scrollToOffset({
          offset: next * itemWidth,
          animated: true,
        });
        return next;
      });
    }, AUTO_PLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  if (!BANNER_IMAGES.length) return null;

  return (
    <View style={styles.wrapper}>
      <FlatList
        ref={flatListRef}
        data={BANNER_IMAGES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        snapToInterval={itemWidth}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={[styles.listContent, { paddingHorizontal: LIST_PADDING }]}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width: itemWidth }]}>
            <View style={styles.cardShadow}>
              <Image source={item} style={styles.bannerImage} resizeMode="cover" />
              <View style={styles.overlay} pointerEvents="none" />
            </View>
          </View>
        )}
      />
      <View style={styles.pagination}>
        {BANNER_IMAGES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === activeIndex ? colors.tint : 'rgba(0,0,0,0.2)' },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 20,
    marginHorizontal: -LIST_PADDING,
  },
  listContent: {
    paddingVertical: 4,
  },
  slide: {
    height: BANNER_HEIGHT,
    marginRight: CARD_GAP,
  },
  cardShadow: {
    width: CARD_WIDTH,
    height: BANNER_HEIGHT,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  bannerImage: {
    width: CARD_WIDTH,
    height: BANNER_HEIGHT,
    borderRadius: CARD_RADIUS,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  dot: {
    width: PAGINATION_DOT_SIZE,
    height: PAGINATION_DOT_SIZE,
    borderRadius: PAGINATION_DOT_SIZE / 2,
  },
});
