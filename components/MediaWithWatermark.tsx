import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

const DEFAULT_WATERMARK = 'Mana Local';

type MediaWithWatermarkProps = {
  children: React.ReactNode;
  watermark?: string;
  style?: ViewStyle;
};

/**
 * Wraps an image or video view with a semi-transparent text watermark overlay.
 * Use for product/post media in add flow, listing cards, and detail views.
 */
export function MediaWithWatermark({ children, watermark = DEFAULT_WATERMARK, style }: MediaWithWatermarkProps) {
  return (
    <View style={[styles.wrapper, style]}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
        <Text style={styles.watermark} numberOfLines={1}>
          {watermark}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 4,
  },
  watermark: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
});
