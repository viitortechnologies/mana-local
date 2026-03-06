import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useLocation } from '@/src/contexts/LocationContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { POST_CATEGORIES, type PostCategory } from '@/src/lib/types';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import { VideoPreviewModal } from '@/components/VideoPreviewModal';
import {
  POST_MAX_MEDIA_SIZE_BYTES,
  POST_MEDIA_SLOTS,
  POST_MIN_MEDIA_SLOTS,
  SIZE_HINT,
  formatBytes,
  isPayloadTooLargeError,
} from '@/constants/MediaLimits';

const UPLOAD_TIMEOUT_MS = 20000;
const SLOT_LABELS = ['Cover', 'Image 2', 'Image 3', 'Video 1', 'Video 2'] as const;
/** Slot 0 = any; 1-2 = image only; 3-4 = video only */
const SLOT_MEDIA_TYPE: ('all' | 'image' | 'video')[] = ['all', 'image', 'image', 'video', 'video'];

type MediaSlot = { url: string; size: number; type: 'image' | 'video' };
const EMPTY_SLOT: MediaSlot = { url: '', size: 0, type: 'image' };

export default function NewPostScreen() {
  const { selectedLocation } = useLocation();
  const { user } = useAuth();
  const [category, setCategory] = useState<PostCategory>('general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [mediaSlots, setMediaSlots] = useState<MediaSlot[]>(
    Array.from({ length: POST_MEDIA_SLOTS }, () => ({ ...EMPTY_SLOT }))
  );
  const [uploadingIndices, setUploadingIndices] = useState<number[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const totalMediaSize = mediaSlots.reduce((a, s) => a + s.size, 0);
  const mediaUrlsForSubmit = mediaSlots.map((s) => s.url).filter(Boolean);

  const getFileSize = async (uri: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      return (info as { size?: number }).size ?? 0;
    } catch {
      return 0;
    }
  };

  const extractStoragePath = (url: string): string | null => {
    const marker = '/object/public/posts/';
    const idx = url.indexOf(marker);
    return idx !== -1 ? url.substring(idx + marker.length) : null;
  };

  const isAssetVideo = (asset: ImagePicker.ImagePickerAsset): boolean => {
    const mime = (asset as { mimeType?: string }).mimeType ?? '';
    const type = (asset as { type?: string }).type;
    return type === 'video' || mime.startsWith('video/') || !!(asset as { duration?: number }).duration;
  };

  const pickMediaAtIndex = async (index: number) => {
    if (!user?.id || uploadingIndices.includes(index)) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos and videos to upload media.');
      return;
    }
    const wantType = SLOT_MEDIA_TYPE[index];
    const mediaTypes =
      wantType === 'all'
        ? ImagePicker.MediaTypeOptions.All
        : wantType === 'video'
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      quality: 0.8,
    });
    if (result?.canceled || !result?.assets?.length) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    if (!uri) return;
    const isVideo = isAssetVideo(asset);
    if (wantType === 'image' && isVideo) {
      Alert.alert('Use an image', 'This slot is for images. Use "Video 1" or "Video 2" for videos.');
      return;
    }
    if (wantType === 'video' && !isVideo) {
      Alert.alert('Use a video', 'This slot is for videos. Use "Cover" or "Image 2/3" for images.');
      return;
    }
    let size = asset.fileSize ?? await getFileSize(uri);
    const currentSlot = mediaSlots[index];
    const totalAfter = totalMediaSize - currentSlot.size + size;
    if (totalAfter > POST_MAX_MEDIA_SIZE_BYTES) {
      Alert.alert(
        'Total size limit',
        `Total media must be 20 MB or less. Adding this would make ${formatBytes(totalAfter)}.\n\n${SIZE_HINT}`
      );
      return;
    }
    const oldPath = currentSlot.url ? extractStoragePath(currentSlot.url) : null;
    setUploadingIndices((prev) => (prev.includes(index) ? prev : [...prev, index]));
    try {
      let buffer: ArrayBuffer;
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        buffer = await res.arrayBuffer();
      } else {
        buffer = await new FileSystem.File(uri).arrayBuffer();
      }
      if (buffer.byteLength === 0) {
        Alert.alert('Upload failed', 'File was empty. Try another.');
        return;
      }
      if (buffer.byteLength > POST_MAX_MEDIA_SIZE_BYTES) {
        Alert.alert('File too large', `Total media must be 20 MB or less.\n\n${SIZE_HINT}`);
        return;
      }
      const ext =
        (asset.fileName && asset.fileName.split('.').pop()) ||
        (uri.includes('.') ? uri.split('.').pop() : isVideo ? 'mp4' : 'jpg') ||
        (isVideo ? 'mp4' : 'jpg');
      const path = `${user.id}/${Date.now()}-${index}.${ext}`;
      const contentType = isVideo ? (asset.mimeType || 'video/mp4') : (asset.mimeType || 'image/jpeg');
      const uploadPromise = supabase.storage.from('posts').upload(path, buffer, {
        upsert: true,
        contentType,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out. Check your connection and try again.')), UPLOAD_TIMEOUT_MS)
      );
      const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]);
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('posts').getPublicUrl(path);
      setMediaSlots((prev) => {
        const next = [...prev];
        next[index] = { url: publicData.publicUrl, size: buffer.byteLength, type: isVideo ? 'video' : 'image' };
        return next;
      });
      if (oldPath) await supabase.storage.from('posts').remove([oldPath]);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Something went wrong. Try again.';
      const extra = isPayloadTooLargeError(e) ? `\n\n${SIZE_HINT}` : '';
      Alert.alert('Upload failed', msg + extra);
    } finally {
      setUploadingIndices((prev) => prev.filter((i) => i !== index));
    }
  };

  const submit = async () => {
    if (!user?.id || !selectedLocation?.id) {
      Alert.alert('Error', 'Missing user or location.');
      return;
    }
    if (!body.trim()) {
      Alert.alert('Required', 'Please enter post content.');
      return;
    }
    const filledCount = mediaSlots.filter((s) => s.url).length;
    if (filledCount < POST_MIN_MEDIA_SLOTS) {
      Alert.alert('Cover required', 'Add at least a cover image or video. Total media max 20 MB.');
      return;
    }
    if (totalMediaSize > POST_MAX_MEDIA_SIZE_BYTES) {
      Alert.alert('Total size limit', `Total media must be 20 MB or less.\n\n${SIZE_HINT}`);
      return;
    }
    setLoading(true);
    try {
      const insertPromise = supabase.from('posts').insert({
        location_id: selectedLocation.id,
        author_id: user.id,
        category,
        title: title.trim() || null,
        body: body.trim(),
        media_urls: mediaUrlsForSubmit,
      });
      const { error } = await requestWithTimeout(insertPromise);
      if (error) {
        Alert.alert('Error', error.message || 'Please try again.');
        return;
      }
      Alert.alert('Submitted', 'Your post is pending admin approval.');
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not submit', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <Text style={[styles.label, { color: colors.text }]}>Media (max 20 MB)</Text>
      <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
        1 cover + up to 2 images + up to 2 videos. Total size must not exceed 20 MB.
      </Text>
      <View style={styles.mediaRow}>
        {mediaSlots.map((slot, idx) => (
          <Pressable
            key={idx}
            style={[styles.mediaSlot, { borderColor: colors.tabIconDefault }]}
            onPress={() => {
              if (slot.url) {
                setPreviewIndex(idx);
                setPreviewIsVideo(slot.type === 'video');
              } else {
                pickMediaAtIndex(idx);
              }
            }}
            disabled={uploadingIndices.includes(idx)}
          >
            {uploadingIndices.includes(idx) ? (
              <View style={styles.slotLoading}>
                <ActivityIndicator size="small" color={colors.tint} />
                <Text style={[styles.slotLoadingText, { color: colors.tabIconDefault }]}>Uploading…</Text>
              </View>
            ) : slot.url ? (
              <MediaWithWatermark style={styles.mediaFill}>
                {slot.type === 'video' ? (
                  <View style={[styles.videoPlaceholder, { backgroundColor: colors.tabIconDefault + '20' }]}>
                    <MaterialCommunityIcons name="play-circle-outline" size={28} color={colors.tint} />
                    <Text style={[styles.videoLabel, { color: colors.tabIconDefault }]}>Video</Text>
                  </View>
                ) : (
                  <Image source={{ uri: slot.url }} style={styles.slotImage} resizeMode="cover" />
                )}
              </MediaWithWatermark>
            ) : (
              <Text style={[styles.slotPlaceholder, { color: colors.tabIconDefault }]}>+ {SLOT_LABELS[idx]}</Text>
            )}
          </Pressable>
        ))}
      </View>
      {totalMediaSize > 0 && (
        <Text style={[styles.hint, { color: colors.tabIconDefault }]}>{formatBytes(totalMediaSize)} used</Text>
      )}

      <PhotoPreviewModal
        visible={previewIndex !== null && !previewIsVideo}
        uri={previewIndex !== null && !previewIsVideo ? mediaSlots[previewIndex]?.url ?? '' : ''}
        onClose={() => setPreviewIndex(null)}
        onReplace={
          previewIndex !== null && !previewIsVideo
            ? () => {
                setPreviewIndex(null);
                pickMediaAtIndex(previewIndex);
              }
            : undefined
        }
      />
      <VideoPreviewModal
        visible={previewIndex !== null && previewIsVideo}
        uri={previewIndex !== null && previewIsVideo ? mediaSlots[previewIndex]?.url ?? '' : ''}
        onClose={() => setPreviewIndex(null)}
        onReplace={
          previewIndex !== null && previewIsVideo
            ? () => {
                setPreviewIndex(null);
                pickMediaAtIndex(previewIndex);
              }
            : undefined
        }
      />

      <Text style={[styles.label, { color: colors.text }]}>Category</Text>
      <View style={styles.categories}>
        {POST_CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            style={[
              styles.categoryChip,
              { borderColor: colors.tabIconDefault },
              category === c.value && { backgroundColor: colors.tint, borderColor: colors.tint },
            ]}
            onPress={() => setCategory(c.value)}
            disabled={loading || uploadingIndices.length > 0}
          >
            <Text style={[styles.categoryChipText, { color: category === c.value ? '#fff' : colors.text }]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>Title (optional)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Title"
        placeholderTextColor={colors.tabIconDefault}
        value={title}
        onChangeText={setTitle}
      />
      <Text style={[styles.label, { color: colors.text }]}>Content *</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Write your post..."
        placeholderTextColor={colors.tabIconDefault}
        value={body}
        onChangeText={setBody}
        multiline
      />
      <Pressable
        style={[styles.submit, { backgroundColor: colors.tint }]}
        onPress={submit}
        disabled={loading || uploadingIndices.length > 0}
      >
        <Text style={styles.submitText}>
          {loading ? 'Submitting…' : uploadingIndices.length > 0 ? 'Uploading…' : 'Submit for approval'}
        </Text>
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 12 },
  mediaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  mediaSlot: {
    width: '31%',
    maxWidth: 100,
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mediaFill: { width: '100%', height: '100%' },
  slotImage: { width: '100%', height: '100%' },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoLabel: { fontSize: 9, fontWeight: '600' },
  slotPlaceholder: { fontSize: 10, textAlign: 'center' },
  slotLoading: { alignItems: 'center', justifyContent: 'center', padding: 6 },
  slotLoadingText: { fontSize: 10, marginTop: 4 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  categoryChipText: { fontSize: 14 },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 16 },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  submit: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
