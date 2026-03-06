import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { router } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import { useLocation } from '@/src/contexts/LocationContext';
import { maskPhoneForDisplay } from '@/src/lib/formatPhone';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

function formatUserSince(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Member since ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const JOB_TYPES = ['Employed', 'Self-employed', 'Student', 'Homemaker', 'Other'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

// City/locality options per location (pincode) – used to pin user to location + city for listing.
const CITY_OPTIONS_BY_PIN: Record<string, string[]> = {
  '503224': ['Urban', 'Town', 'Rural'],
  '504106': ['Town', 'Rural'],
  '505327': ['Town', 'Rural'],
};

const CITY_OPTION_DESCRIPTIONS: Record<string, string> = {
  Urban: 'advanced infrastructure, Business area',
  Town: 'mid-sized urban settlement, minimal development areas',
  Rural: 'agriculture-based, outside of the city',
};

export default function EditProfileScreen() {
  const { user, profile, isLoading, refreshProfile } = useAuth();
  const { selectedLocation } = useLocation();
  const retriedRef = useRef(false);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [jobType, setJobType] = useState('');
  const [city, setCity] = useState('');
  const [about, setAbout] = useState('');
  const [statusText, setStatusText] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const locationId = selectedLocation?.id ?? profile?.location_id;
  // When locations fail to load, selectedLocation.id is "fallback-0" etc. – never send that as UUID.
  const resolvedLocationId =
    locationId && !String(locationId).startsWith('fallback-') ? locationId : profile?.location_id ?? null;
  const currentPin = selectedLocation?.pincode ?? null;
  const cityOptions = currentPin ? CITY_OPTIONS_BY_PIN[currentPin] ?? [] : [];

  const parsedDob = dateOfBirth ? new Date(dateOfBirth) : null;
  const dobDate = !parsedDob || Number.isNaN(parsedDob.getTime()) ? new Date(2000, 0, 1) : parsedDob;

  const styles = StyleSheet.create({
    container: { flex: 1 },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: 80 },
    headerRowFixed: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#e5e7eb',
    },
    sectionTitle: { fontSize: 14, fontWeight: '600', marginTop: 20, marginBottom: 12 },
    profileLoadBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 8,
      padding: 14,
      marginBottom: 16,
    },
    profileLoadBannerText: { flex: 1, fontSize: 14 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 8, padding: 14, fontSize: 16, marginBottom: 16 },
    inputReadOnly: { backgroundColor: 'transparent' },
    hint: { fontSize: 12, marginTop: -8, marginBottom: 16 },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: {
      borderWidth: 1,
      borderRadius: 20,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    chipText: { fontSize: 14 },
    backRow: {},
    backText: { fontSize: 16, fontWeight: '600' },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    avatarPreview: {
      width: 56,
      height: 56,
      borderRadius: 28,
    },
    avatarPlaceholder: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: { fontSize: 20, fontWeight: '700', color: '#fff' },
    avatarInfo: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    avatarName: { fontSize: 16, fontWeight: '600', flex: 1 },
    shieldIcon: { marginLeft: 4 },
    userSince: { fontSize: 12, marginTop: 2 },
    citySelector: {
      justifyContent: 'center',
    },
    cityDropdown: {
      borderWidth: 1,
      borderRadius: 8,
      marginTop: -8,
      marginBottom: 12,
      overflow: 'hidden',
    },
    cityItem: {
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    cityItemDesc: { fontSize: 11, marginTop: 2 },
    button: { padding: 16, borderRadius: 8, alignItems: 'center', marginTop: 8 },
    footerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
    },
    footerButton: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 8, minWidth: 160, alignItems: 'center' },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  });

  useEffect(() => {
    if (user?.id && profile == null && !isLoading && !retriedRef.current) {
      retriedRef.current = true;
      refreshProfile();
    }
  }, [user?.id, profile, isLoading, refreshProfile]);

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '');
      setGender(profile.gender ?? '');
      setJobType(profile.job_type ?? '');
      setCity(profile.area === 'Colony' ? 'Urban' : (profile.area ?? ''));
      setAbout(profile.about ?? '');
      setStatusText(profile.status_text ?? '');
      setDateOfBirth(profile.date_of_birth ?? '');
      setAvatarUrl(profile.avatar_url ?? '');
    }
  }, [profile]);

  const pickAndUploadAvatar = async () => {
    if (!user?.id) return;

    const previousAvatarUrl = profile?.avatar_url || avatarUrl || '';
    const marker = '/object/public/avatars/';
    let oldPath: string | null = null;
    if (previousAvatarUrl) {
      const idx = previousAvatarUrl.indexOf(marker);
      if (idx !== -1) {
        oldPath = previousAvatarUrl.substring(idx + marker.length);
      }
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      // Using deprecated MediaTypeOptions.Images for compatibility with current expo-image-picker version.
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const asset = result.assets[0];
    const uri = asset.uri;

    try {
      setLoading(true);
      // Web: fetch(blob/data URI) works. Native: FileSystem.File gives real bytes (fetch often returns 0 for file:// URIs).
      let buffer: ArrayBuffer;
      if (Platform.OS === 'web') {
        const res = await fetch(uri);
        buffer = await res.arrayBuffer();
      } else {
        const file = new FileSystem.File(uri);
        buffer = await file.arrayBuffer();
      }

      const ONE_MB = 1024 * 1024;
      if (buffer.byteLength > ONE_MB) {
        Alert.alert('Image too large', 'Please choose a picture smaller than 1 MB.');
        setLoading(false);
        return;
      }
      if (buffer.byteLength === 0) {
        Alert.alert('Upload failed', 'Could not read the image. Try a different picture or use the app on your phone.');
        setLoading(false);
        return;
      }

      const fileExt =
        (asset.fileName && asset.fileName.split('.').pop()) ||
        (uri.includes('.') ? uri.split('.').pop() : 'jpg') ||
        'jpg';
      const path = `${user.id}/${Date.now()}.${fileExt}`;

      const uploadAndUpdate = async () => {
        const { error: uploadError } = await supabase.storage.from('avatars').upload(path, buffer, {
          upsert: true,
          contentType: asset.mimeType || 'image/jpeg',
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
        const publicUrl = publicData.publicUrl;
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (profileError) throw profileError;
        setAvatarUrl(publicUrl);
        await refreshProfile();
        if (oldPath) {
          const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath]);
          if (removeError) console.warn('Failed to delete previous avatar', removeError);
        }
      };
      await requestWithTimeout(uploadAndUpdate());
      Alert.alert('Saved', 'Profile picture updated.');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message ?? 'Something went wrong while uploading the picture.';
      Alert.alert('Upload failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const savePending = async () => {
    if (!user?.id) return;
    if (!name.trim()) {
      Alert.alert('Required', 'Name is mandatory.');
      return;
    }
    if (!gender.trim()) {
      Alert.alert('Required', 'Gender is mandatory.');
      return;
    }
    if (!jobType.trim()) {
      Alert.alert('Required', 'Job type is mandatory.');
      return;
    }
    if (!city.trim()) {
      Alert.alert('Required', 'City is mandatory. Select your locality (e.g. Town or Rural) for this location.');
      return;
    }
    if (!dateOfBirth.trim()) {
      Alert.alert('Required', 'Date of birth is mandatory.');
      return;
    }
    setLoading(true);
    try {
      const updatePromise = supabase
        .from('profiles')
        .update({
          name: name.trim(),
          gender: gender.trim(),
          job_type: jobType.trim(),
          location_id: resolvedLocationId,
          area: city.trim(),
          about: about.trim() || null,
          status_text: statusText.trim() || null,
          date_of_birth: dateOfBirth.trim(),
          profile_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      const { error } = await requestWithTimeout(updatePromise);
      if (error) {
        Alert.alert('Error', error.message || 'Please try again.');
        return;
      }
      await refreshProfile();
      Alert.alert('Saved', 'Profile updated.');
      router.navigate('/(tabs)/profile');
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message === 'REQUEST_TIMEOUT' ? TIMEOUT_MESSAGE : (e as Error)?.message || TIMEOUT_MESSAGE;
      Alert.alert('Could not save', msg);
    } finally {
      setLoading(false);
    }
  };

  const displayAvatarUrl = avatarUrl || profile?.avatar_url || '';

  return (
    <KeyboardAvoidingView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={[styles.headerRowFixed, { backgroundColor: colors.background }]}>
        <Pressable style={styles.backRow} onPress={() => router.navigate('/(tabs)/profile')}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      {user && profile == null ? (
        <View style={[styles.profileLoadBanner, { borderColor: colors.tabIconDefault }]}>
          <ActivityIndicator size="small" color={colors.tint} />
          <Text style={[styles.profileLoadBannerText, { color: colors.tabIconDefault }]}>
            {isLoading ? 'Loading profile…' : 'Profile didn’t load. Go back to Profile and pull down to retry.'}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.sectionTitle, { color: colors.tabIconDefault }]}>
        Profile picture (updates immediately, max 1 MB)
      </Text>
      <View style={styles.avatarRow}>
        {displayAvatarUrl ? (
          <Image source={{ uri: displayAvatarUrl }} style={styles.avatarPreview} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: colors.tabIconDefault }]}>
            <Text style={styles.avatarInitial}>
              {(profile?.name || user?.email || 'U').trim()[0]?.toUpperCase?.() ?? 'U'}
            </Text>
          </View>
        )}
        <View style={styles.avatarInfo}>
          <View style={styles.nameRow}>
            <Text style={[styles.avatarName, { color: colors.text }]} numberOfLines={1}>
              {profile?.name?.trim() || '—'}
            </Text>
            {profile?.profile_completed_at ? (
              <FontAwesome name="shield" size={16} color={colors.tint} style={styles.shieldIcon} />
            ) : null}
          </View>
          {profile?.created_at ? (
            <Text style={[styles.userSince, { color: colors.tabIconDefault }]}>{formatUserSince(profile.created_at)}</Text>
          ) : null}
          <Text style={{ color: colors.tabIconDefault, fontSize: 12 }}>{displayAvatarUrl ? 'Current' : 'No picture'}</Text>
        </View>
      </View>
      <Pressable
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={pickAndUploadAvatar}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Choose picture</Text>
      </Pressable>

      <Text style={[styles.label, { color: colors.text }]}>Mobile number</Text>
      <Text style={[styles.input, styles.inputReadOnly, { color: colors.tabIconDefault }]}>
        {profile?.phone ? maskPhoneForDisplay(profile.phone) : '—'}
      </Text>
      <Text style={[styles.hint, { color: colors.tabIconDefault }]}>Logged-in number (read-only)</Text>

      <Text style={[styles.sectionTitle, { color: colors.tabIconDefault }]}>Profile details</Text>
      <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Full name"
        placeholderTextColor={colors.tabIconDefault}
        value={name}
        onChangeText={setName}
      />
      <Text style={[styles.label, { color: colors.text }]}>Gender *</Text>
      <View style={styles.chipRow}>
        {GENDERS.map((g) => (
          <Pressable
            key={g}
            style={[styles.chip, { borderColor: colors.tabIconDefault }, gender === g && { backgroundColor: colors.tint }]}
            onPress={() => setGender(g)}
          >
            <Text style={[styles.chipText, { color: gender === g ? '#fff' : colors.text }]}>{g}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>Job type *</Text>
      <View style={styles.chipRow}>
        {JOB_TYPES.map((j) => (
          <Pressable
            key={j}
            style={[styles.chip, { borderColor: colors.tabIconDefault }, jobType === j && { backgroundColor: colors.tint }]}
            onPress={() => setJobType(j)}
          >
            <Text style={[styles.chipText, { color: jobType === j ? '#fff' : colors.text }]}>{j}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>
        City * (for {selectedLocation?.display_name ?? 'selected location'})
      </Text>
      <Pressable
        style={StyleSheet.flatten([
          styles.input,
          styles.citySelector,
          { borderColor: colors.tabIconDefault },
        ])}
        onPress={() => setCityDropdownOpen((v) => !v)}
      >
        <Text style={{ color: city ? colors.text : colors.tabIconDefault }}>
          {city || 'Select city / locality'}
        </Text>
      </Pressable>
      {cityDropdownOpen && cityOptions.length > 0 && (
        <View
          style={StyleSheet.flatten([
            styles.cityDropdown,
            { borderColor: colors.tabIconDefault, backgroundColor: colors.background },
          ])}
        >
          {cityOptions.map((opt) => (
            <Pressable
              key={opt}
              style={styles.cityItem}
              onPress={() => {
                setCity(opt);
                setCityDropdownOpen(false);
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '600' }}>{opt}</Text>
              {CITY_OPTION_DESCRIPTIONS[opt] ? (
                <Text style={[styles.cityItemDesc, { color: colors.tabIconDefault }]}>
                  ({CITY_OPTION_DESCRIPTIONS[opt]})
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
      <Text style={[styles.label, { color: colors.text }]}>About (optional)</Text>
      <TextInput
        style={[styles.input, styles.textArea, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="About you"
        placeholderTextColor={colors.tabIconDefault}
        value={about}
        onChangeText={setAbout}
        multiline
      />
      <Text style={[styles.label, { color: colors.text }]}>Status (optional)</Text>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
        placeholder="Status text (WhatsApp style)"
        placeholderTextColor={colors.tabIconDefault}
        value={statusText}
        onChangeText={setStatusText}
      />
      <Text style={[styles.label, { color: colors.text }]}>Date of birth *</Text>
      {Platform.OS === 'web' ? (
        // Web: fallback to text input (date picker component is native-only)
        <TextInput
          style={[styles.input, { color: colors.text, borderColor: colors.tabIconDefault }]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.tabIconDefault}
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
        />
      ) : (
        <>
          <Pressable
            style={StyleSheet.flatten([styles.input, styles.citySelector, { borderColor: colors.tabIconDefault }])}
            onPress={() => setDobPickerOpen(true)}
          >
            <Text style={{ color: dateOfBirth ? colors.text : colors.tabIconDefault }}>
              {dateOfBirth || 'Select date of birth'}
            </Text>
          </Pressable>
          {dobPickerOpen && (
            <DateTimePicker
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              value={dobDate}
              maximumDate={new Date()}
              onChange={(_, selectedDate) => {
                if (Platform.OS !== 'ios') {
                  setDobPickerOpen(false);
                }
                if (selectedDate) {
                  const year = selectedDate.getFullYear();
                  const month = `${selectedDate.getMonth() + 1}`.padStart(2, '0');
                  const day = `${selectedDate.getDate()}`.padStart(2, '0');
                  setDateOfBirth(`${year}-${month}-${day}`);
                }
              }}
            />
          )}
        </>
      )}
      </ScrollView>
      <View style={[styles.footerBar, { backgroundColor: colors.headerBg, borderTopColor: colors.tabIconDefault }]}>
        <Pressable style={[styles.footerButton, { backgroundColor: colors.tint }]} onPress={savePending} disabled={loading}>
          <Text style={styles.buttonText}>Save</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
