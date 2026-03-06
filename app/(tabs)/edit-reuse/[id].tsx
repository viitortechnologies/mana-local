import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useLocation } from '@/src/contexts/LocationContext';
import { useAuth } from '@/src/contexts/AuthContext';
import type { DeliveryOption, ReuseCategory, ReuseItem } from '@/src/lib/types';
import { REUSE_CATEGORIES } from '@/src/lib/types';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { MediaWithWatermark } from '@/components/MediaWithWatermark';
import { PhotoPreviewModal } from '@/components/PhotoPreviewModal';
import { VideoPreviewModal } from '@/components/VideoPreviewModal';
import {
  MAX_MEDIA_SIZE_BYTES,
  MIN_MEDIA_SLOTS,
  SIZE_HINT,
  formatBytes,
  isVideoUrl,
  isPayloadTooLargeError,
} from '@/constants/MediaLimits';

const MIN_THIRD_PARTY = 150;
type MediaSlot = { url: string; size: number; type: 'image' | 'video' };
const EMPTY_SLOT: MediaSlot = { url: '', size: 0, type: 'image' };

export default function EditReuseScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { selectedLocation } = useLocation();
  const { user } = useAuth();
  const [item, setItem] = useState<ReuseItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [mrp, setMrp] = useState('');
  const [category, setCategory] = useState<ReuseCategory | null>(null);
  const [subcategory, setSubcategory] = useState('');
  const [deliveryOption, setDeliveryOption] = useState<DeliveryOption>('self_pickup');
  const [deliveryCharge, setDeliveryCharge] = useState('0');
  const [mediaSlots, setMediaSlots] = useState<MediaSlot[]>([{ ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }]);
  const [loading, setLoading] = useState(false);
  const [uploadingIndices, setUploadingIndices] = useState<number[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const totalMediaSize = mediaSlots.reduce((a, s) => a + s.size, 0);
  const mediaUrlsForSubmit = mediaSlots.map((s) => s.url).filter(Boolean);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('reuse_items').select('*').eq('id', id).single();
    if (error || !data) {
      Alert.alert('Error', 'Unable to load listing for edit.');
      return;
    }
    const it = data as ReuseItem;
    setItem(it);
    setTitle(it.title);
    setDescription(it.description ?? '');
    setMrp(String(it.mrp));
    setCategory((it.category as ReuseCategory | null) ?? null);
    setSubcategory(it.subcategory ?? '');
    setDeliveryOption(it.delivery_option as DeliveryOption);
    setDeliveryCharge(String(it.delivery_charge ?? 0));
    const urls = (it.media_urls ?? []).filter(Boolean);
    const slots: MediaSlot[] = [
      urls[0] ? { url: urls[0], size: 0, type: isVideoUrl(urls[0]) ? 'video' : 'image' } : { ...EMPTY_SLOT },
      urls[1] ? { url: urls[1], size: 0, type: isVideoUrl(urls[1]) ? 'video' : 'image' } : { ...EMPTY_SLOT },
      urls[2] ? { url: urls[2], size: 0, type: isVideoUrl(urls[2]) ? 'video' : 'image' } : { ...EMPTY_SLOT },
    ];
    setMediaSlots(slots);
  }, [id]);

  const getFileSize = async (uri: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      return (info as { size?: number }).size ?? 0;
    } catch {
      return 0;
    }
  };

  const extractStoragePath = (url: string): string | null => {
    const marker = '/object/public/reuse/';
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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    if (!uri) return;
    let size = asset.fileSize ?? await getFileSize(uri);
    const currentSlot = mediaSlots[index];
    const totalAfter = totalMediaSize - currentSlot.size + size;
    if (totalAfter > MAX_MEDIA_SIZE_BYTES) {
      Alert.alert(
        'Total size limit',
        `Total media must be 10 MB or less. Adding this would make ${formatBytes(totalAfter)}.\n\n${SIZE_HINT}`
      );
      return;
    }
    const oldPath = currentSlot.url ? extractStoragePath(currentSlot.url) : null;
    const isVideo = isAssetVideo(asset);
    setUploadingIndices((prev) => (prev.includes(index) ? prev : [...prev, index]));
    try {
      let buffer: ArrayBuffer;
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        buffer = await res.arrayBuffer();
      } else {
        buffer = await new FileSystem.File(uri).arrayBuffer();
      }
      if (buffer.byteLength > MAX_MEDIA_SIZE_BYTES) {
        Alert.alert('File too large', `Total media must be 10 MB or less.\n\n${SIZE_HINT}`);
        return;
      }
      const ext =
        (asset.fileName && asset.fileName.split('.').pop()) ||
        (uri.includes('.') ? uri.split('.').pop() : isVideo ? 'mp4' : 'jpg') ||
        (isVideo ? 'mp4' : 'jpg');
      const path = `${user.id}/${Date.now()}-${index}.${ext}`;
      const contentType = isVideo ? (asset.mimeType || 'video/mp4') : (asset.mimeType || 'image/jpeg');
      const { error: uploadError } = await supabase.storage.from('reuse').upload(path, buffer, {
        upsert: true,
        contentType,
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from('reuse').getPublicUrl(path);
      setMediaSlots((prev) => {
        const next = [...prev];
        next[index] = { url: publicData.publicUrl, size: buffer.byteLength, type: isVideo ? 'video' : 'image' };
        return next;
      });
      if (oldPath) await supabase.storage.from('reuse').remove([oldPath]);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? 'Something went wrong.';
      const extra = isPayloadTooLargeError(e) ? `\n\n${SIZE_HINT}` : '';
      Alert.alert('Upload failed', msg + extra);
    } finally {
      setUploadingIndices((prev) => prev.filter((i) => i !== index));
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!user?.id || !item) {
      Alert.alert('Error', 'Missing user or listing.');
      return;
    }
    if (!category) {
      Alert.alert('Required', 'Please select a category.');
      return;
    }
    const filledCount = mediaSlots.filter((s) => s.url).length;
    if (filledCount < MIN_MEDIA_SLOTS) {
      Alert.alert('Media required', 'Add at least one image or video (Cover). Total max 10 MB.');
      return;
    }
    if (totalMediaSize > MAX_MEDIA_SIZE_BYTES && totalMediaSize > 0) {
      Alert.alert('Total size limit', `Total media must be 10 MB or less.\n\n${SIZE_HINT}`);
      return;
    }
    const mrpNum = parseFloat(mrp);
    if (isNaN(mrpNum) || mrpNum < 0) {
      Alert.alert('Required', 'Enter a valid MRP.');
      return;
    }
    const charge =
      deliveryOption === 'self_pickup'
        ? 0
        : Math.max(MIN_THIRD_PARTY, parseFloat(deliveryCharge) || MIN_THIRD_PARTY);
    setLoading(true);
    try {
      const updatePromise = supabase
        .from('reuse_items')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          category,
          subcategory: subcategory.trim() || null,
          mrp: mrpNum,
          delivery_option: deliveryOption,
          delivery_charge: charge,
          media_urls: mediaUrlsForSubmit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('seller_id', user.id);
      const { error } = await requestWithTimeout(updatePromise);
      if (error) {
        Alert.alert('Error', error.message || 'Please try again.');
        return;
      }
      Alert.alert('Updated', 'Your listing details have been updated.');
      router.push('/reuse');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not save', msg);
    } finally {
      setLoading(false);
    }
  };

  if (!id) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Invalid listing.</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Loading listing…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.backText, { color: colors.tint }]} onPress={() => router.replace('/(tabs)/my-reuse')}>
        ‹ Back
      </Text>
      <Text style={[styles.label, { color: colors.text }]}>Edit listing</Text>
      <Text style={[styles.label, { color: colors.text }]}>Media (total max 10 MB)</Text>
      <View style={styles.imageRow}>
        {mediaSlots.map((slot, idx) => {
          const isUploading = uploadingIndices.includes(idx);
          return (
            <Pressable
              key={idx}
              style={[styles.imageSlot, { borderColor: colors.tabIconDefault }]}
              onPress={() => {
                if (slot.url) {
                  setPreviewIndex(idx);
                  setPreviewIsVideo(slot.type === 'video');
                } else {
                  pickMediaAtIndex(idx);
                }
              }}
              disabled={isUploading}
            >
              {isUploading ? (
                <View style={styles.imageSlotLoading}>
                  <ActivityIndicator size="small" color={colors.tint} />
                  <Text style={[styles.imageSlotLoadingText, { color: colors.tabIconDefault }]}>Uploading…</Text>
                </View>
              ) : slot.url ? (
                <MediaWithWatermark style={styles.mediaFill}>
                  {slot.type === 'video' ? (
                    <View style={[styles.videoPreview, { backgroundColor: colors.tabIconDefault + '20' }]}>
                      <MaterialCommunityIcons name="play-circle-outline" size={32} color={colors.tint} />
                      <Text style={[styles.videoLabel, { color: colors.tabIconDefault, fontSize: 10 }]}>Video</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: slot.url }} style={styles.imagePreview} />
                  )}
                </MediaWithWatermark>
              ) : (
                <Text style={{ color: colors.tabIconDefault, fontSize: 11, textAlign: 'center' }}>
                  + {idx === 0 ? 'Cover' : `Slot ${idx + 1}`}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
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
      <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
        Cover + up to 2 more. Each slot: image or video. Total ≤ 10 MB. {totalMediaSize > 0 && `${formatBytes(totalMediaSize)} used.`}
      </Text>
      <Text style={[styles.label, { color: colors.text }]}>Category *</Text>
      <View style={styles.chipRow}>
        {REUSE_CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            style={[
              styles.chip,
              { borderColor: colors.tabIconDefault },
              category === c.value && { backgroundColor: colors.tint },
            ]}
            onPress={() => setCategory(c.value)}
            disabled={loading || uploadingIndices.length > 0}
          >
            <Text style={[styles.chipText, { color: category === c.value ? '#fff' : colors.text }]}>
              {c.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>Sub category (optional)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="e.g. Study table, Mixer, Kids books"
        placeholderTextColor={colors.tabIconDefault}
        value={subcategory}
        onChangeText={setSubcategory}
      />
      <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Item title"
        placeholderTextColor={colors.tabIconDefault}
        value={title}
        onChangeText={setTitle}
      />
      <Text style={[styles.label, { color: colors.text }]}>Description (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Description"
        placeholderTextColor={colors.tabIconDefault}
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Text style={[styles.label, { color: colors.text }]}>MRP (₹) *</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="0"
        placeholderTextColor={colors.tabIconDefault}
        keyboardType="decimal-pad"
        value={mrp}
        onChangeText={setMrp}
      />
      <Text style={[styles.hint, { color: colors.tabIconDefault }]}>Selling price is ₹0 (not editable).</Text>

      <Text style={[styles.label, { color: colors.text }]}>Delivery</Text>
      <Pressable
        style={[
          styles.deliveryRow,
          { borderColor: colors.tabIconDefault },
          deliveryOption === 'self_pickup' && { borderColor: colors.tint },
        ]}
        onPress={() => setDeliveryOption('self_pickup')}
      >
        <Text style={[styles.deliveryLabel, { color: colors.text }]}>Self pickup</Text>
        <Text style={[styles.deliveryPrice, { color: colors.tabIconDefault }]}>₹0</Text>
      </Pressable>
      <Pressable
        style={[
          styles.deliveryRow,
          { borderColor: colors.tabIconDefault },
          deliveryOption === 'third_party' && { borderColor: colors.tint },
        ]}
        onPress={() => setDeliveryOption('third_party')}
      >
        <Text style={[styles.deliveryLabel, { color: colors.text }]}>Third party (Get Eazy)</Text>
        <Text style={[styles.deliveryPrice, { color: colors.tabIconDefault }]}>Min ₹{MIN_THIRD_PARTY}</Text>
      </Pressable>
      {deliveryOption === 'third_party' && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Delivery charge (₹)</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
            placeholder={`${MIN_THIRD_PARTY}`}
            placeholderTextColor={colors.tabIconDefault}
            keyboardType="decimal-pad"
            value={deliveryCharge}
            onChangeText={setDeliveryCharge}
          />
        </>
      )}

      <Pressable
        style={[styles.submit, { backgroundColor: colors.tint }]}
        onPress={submit}
        disabled={loading || uploadingIndices.length > 0}
      >
        <Text style={styles.submitText}>
          {loading ? 'Saving…' : uploadingIndices.length > 0 ? 'Uploading…' : 'Save changes'}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.cancel]}
        onPress={() => router.replace('/(tabs)/my-reuse')}
        disabled={loading || uploadingIndices.length > 0}
      >
        <Text style={[styles.cancelText, { color: colors.tabIconDefault }]}>Cancel</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  backText: { marginBottom: 8, fontSize: 14, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontSize: 12, marginBottom: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 13 },
  imageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  imageSlot: {
    width: '30%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageSlotLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  imageSlotLoadingText: { fontSize: 11, marginTop: 4 },
  imagePreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  mediaFill: { width: '100%', height: '100%' },
  videoSlot: {
    width: '100%',
    aspectRatio: 16 / 9,
    maxHeight: 180,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  videoPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  videoLabel: { fontSize: 14, fontWeight: '600' },
  deliveryRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  deliveryLabel: { fontSize: 16 },
  deliveryPrice: { fontSize: 14 },
  submit: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cancel: {
    marginTop: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});

