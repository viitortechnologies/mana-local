import React from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaWithWatermark } from './MediaWithWatermark';

type VideoPreviewModalProps = {
  visible: boolean;
  uri: string;
  onClose: () => void;
  onReplace?: () => void;
};

// No expo-av dependency (deprecated, causes "Property 'images' doesn't exist" on web).
// Users can tap "Open video" to play in device browser/default player.
export function VideoPreviewModal({ visible, uri, onClose, onReplace }: VideoPreviewModalProps) {
  if (!uri) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.content}>
          <MediaWithWatermark style={styles.videoWrap}>
            <View style={styles.videoFallback}>
              <Text style={styles.videoFallbackText}>Video</Text>
              <Pressable onPress={() => Linking.openURL(uri)} style={styles.videoFallbackBtn}>
                <Text style={styles.videoFallbackBtnText}>Open video</Text>
              </Pressable>
            </View>
          </MediaWithWatermark>
          <View style={styles.actions}>
            {onReplace && (
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={onReplace}>
                <Text style={styles.btnTextSecondary}>Replace</Text>
              </Pressable>
            )}
            <Pressable style={[styles.btn, styles.btnPrimary]} onPress={onClose}>
              <Text style={styles.btnTextPrimary}>Close</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    flex: 1,
    padding: 16,
  },
  videoWrap: {
    flex: 1,
    minHeight: 200,
  },
  videoFallback: {
    flex: 1,
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
  },
  videoFallbackText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  videoFallbackBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  videoFallbackBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 16,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  btnPrimary: {
    backgroundColor: '#6b8e23',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#fff',
  },
  btnTextPrimary: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnTextSecondary: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
