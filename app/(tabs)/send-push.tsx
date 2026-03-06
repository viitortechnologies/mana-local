import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRole } from '@/src/contexts/RoleContext';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

const PUSH_FUNCTION_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
  ? `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/send-push`
  : '';
// Optional: set EXPO_PUBLIC_DEFAULT_NOTIFICATION_IMAGE_URL to your uploaded notifications.png URL to use as default image when "Use default image" is on
const DEFAULT_NOTIFICATION_IMAGE_URL = process.env.EXPO_PUBLIC_DEFAULT_NOTIFICATION_IMAGE_URL ?? null;

export default function SendPushScreen() {
  const router = useRouter();
  const { user, session } = useAuth();
  const { activeRole } = useRole();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [useDefaultImage, setUseDefaultImage] = useState(false);
  const [linkEnabled, setLinkEnabled] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const isAdmin = activeRole?.code === 'admin';

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to attach an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUseDefaultImage(false);
    const asset = result.assets[0];
    const uri = asset.uri;
    let size = asset.fileSize ?? null;
    if (size == null) {
      const info = await FileSystem.getInfoAsync(uri);
      size = info.size ?? 0;
    }
    const ONE_MB = 1024 * 1024;
    if ((size ?? 0) > ONE_MB) {
      Alert.alert('Image too large', 'Please choose an image smaller than 1 MB.');
      return;
    }
    setImageUri(uri);
  };

  const removeImage = () => setImageUri(null);

  const send = async () => {
    if (!user?.id || !session) {
      Alert.alert('Error', 'You must be signed in.');
      return;
    }
    if (!isAdmin) {
      Alert.alert('Error', 'Only admins can send push notifications.');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    const trimmedBody = description.trim() || trimmedTitle;
    let imageUrl: string | null = null;

    if (imageUri) {
      setLoading(true);
      try {
        const ext =
          (imageUri.includes('.') ? imageUri.split('.').pop() : 'jpg') || 'jpg';
        const path = `notifications/${user.id}/${Date.now()}.${ext}`;
        const response = await fetch(imageUri);
        const blob = await response.blob();
        const { error: uploadError } = await supabase.storage
          .from('notifications')
          .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('notifications').getPublicUrl(path);
        imageUrl = data.publicUrl;
      } catch (e: any) {
        setLoading(false);
        Alert.alert('Upload failed', e.message ?? 'Failed to upload image. Create a storage bucket "notifications" (public) in Supabase if needed.');
        return;
      }
      setLoading(false);
    } else if (useDefaultImage && DEFAULT_NOTIFICATION_IMAGE_URL) {
      imageUrl = DEFAULT_NOTIFICATION_IMAGE_URL;
    }

    if (!PUSH_FUNCTION_URL) {
      Alert.alert('Error', 'Push function URL not configured (EXPO_PUBLIC_SUPABASE_URL).');
      return;
    }

    setLoading(true);
    try {
      const sendPromise = (async () => {
        const res = await fetch(PUSH_FUNCTION_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            title: trimmedTitle,
            body: trimmedBody,
            imageUrl: imageUrl ?? undefined,
            link: linkEnabled && linkUrl.trim() ? linkUrl.trim() : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.message ?? data?.error ?? `Request failed: ${res.status}`);
        }
        return data;
      })();
      await requestWithTimeout(sendPromise);
      Alert.alert('Sent', 'Push notification has been sent to all opted-in users.');
      setTitle('');
      setDescription('');
      setImageUri(null);
      setUseDefaultImage(false);
      setLinkEnabled(false);
      setLinkUrl('');
      router.replace('/(tabs)/profile');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Could not send push notification.';
      Alert.alert('Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Only admins can send push notifications.</Text>
        <Pressable style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={{ color: colors.tint }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.backText, { color: colors.tint }]} onPress={() => router.replace('/(tabs)/profile')}>
        ‹ Back
      </Text>
      <Text style={[styles.title, { color: colors.text }]}>Send push notification</Text>
      <Text style={[styles.hint, { color: colors.tabIconDefault }]}>
        All users who enabled push in Profile will receive this notification.
      </Text>

      <Text style={[styles.label, { color: colors.text }]}>Title *</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Notification title"
        placeholderTextColor={colors.tabIconDefault}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.label, { color: colors.text }]}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Body text (optional)"
        placeholderTextColor={colors.tabIconDefault}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={[styles.label, { color: colors.text }]}>Image (optional)</Text>
      {DEFAULT_NOTIFICATION_IMAGE_URL ? (
        <View style={StyleSheet.flatten([styles.row, { borderColor: colors.tabIconDefault }])}>
          <Text style={[styles.roleLabel, { color: colors.text }]}>Use default (notifications.png)</Text>
          <Switch
            value={useDefaultImage}
            onValueChange={(v) => { setUseDefaultImage(v); if (v) setImageUri(null); }}
            trackColor={{ false: colors.tabIconDefault, true: colors.tint }}
            thumbColor="#fff"
          />
        </View>
      ) : null}
      {imageUri ? (
        <View style={styles.imageWrap}>
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
          <Pressable style={styles.removeImageBtn} onPress={removeImage}>
            <Text style={styles.removeImageText}>Remove image</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[styles.imageSlot, { borderColor: colors.tabIconDefault }]}
          onPress={pickImage}
          disabled={loading}
        >
          <Text style={{ color: colors.tabIconDefault }}>
            {useDefaultImage ? 'Using default image' : '+ Add image'}
          </Text>
        </Pressable>
      )}

      <View style={StyleSheet.flatten([styles.row, { borderColor: colors.tabIconDefault }])}>
        <Text style={[styles.roleLabel, { color: colors.text }]}>Include link</Text>
        <Switch
          value={linkEnabled}
          onValueChange={setLinkEnabled}
          trackColor={{ false: colors.tabIconDefault, true: colors.tint }}
          thumbColor="#fff"
        />
      </View>
      {linkEnabled && (
        <>
          <Text style={[styles.label, { color: colors.text }]}>Link URL</Text>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
            placeholder="https://..."
            placeholderTextColor={colors.tabIconDefault}
            value={linkUrl}
            onChangeText={setLinkUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
        </>
      )}

      <Pressable
        style={[styles.submit, { backgroundColor: colors.tint }]}
        onPress={send}
        disabled={loading}
      >
        <Text style={styles.submitText}>{loading ? 'Sending…' : 'Send notification'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backText: { marginBottom: 8, fontSize: 14, fontWeight: '600' },
  backBtn: { padding: 8 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  imageWrap: { marginBottom: 16 },
  previewImage: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, marginBottom: 8 },
  removeImageBtn: { alignSelf: 'flex-start' },
  removeImageText: { fontSize: 14, color: '#ef4444', fontWeight: '600' },
  imageSlot: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  row: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleLabel: { fontSize: 16 },
  submit: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
