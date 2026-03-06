import React from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MediaWithWatermark } from './MediaWithWatermark';

type PhotoPreviewModalProps = {
  visible: boolean;
  uri: string;
  onClose: () => void;
  onReplace?: () => void;
};

export function PhotoPreviewModal({ visible, uri, onClose, onReplace }: PhotoPreviewModalProps) {
  if (!uri) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.content}>
          <MediaWithWatermark style={styles.imageWrap}>
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
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
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  imageWrap: {
    flex: 1,
    minHeight: 200,
  },
  image: {
    width: '100%',
    height: '100%',
  },
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
