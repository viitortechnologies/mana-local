import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Link, router } from 'expo-router';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRole } from '@/src/contexts/RoleContext';
import { registerPushToken, unregisterPushToken } from '@/src/lib/pushNotifications';
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

export default function ProfileScreen() {
  const { user, profile, isLoading, signOut, refreshProfile } = useAuth();
  const { userRoles, activeRole, setActiveRoleId, refreshUserRoles } = useRole();
  const [pushToggling, setPushToggling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const retriedRef = useRef(false);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useEffect(() => {
    if (user?.id && profile == null && !isLoading && !retriedRef.current) {
      retriedRef.current = true;
      refreshProfile();
    }
  }, [user?.id, profile, isLoading, refreshProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshProfile(), refreshUserRoles()]);
    setRefreshing(false);
  }, [refreshProfile, refreshUserRoles]);

  const pushEnabled = profile?.push_notifications_enabled ?? false;
  const PUSH_TOGGLE_TIMEOUT_MS = 15000;

  const onPushToggle = async (value: boolean) => {
    if (!user?.id) return;
    setPushToggling(true);

    const run = async () => {
      if (value) {
        const { ok, error } = await registerPushToken(user.id);
        if (ok) {
          await refreshProfile();
          Alert.alert('Success', 'Push notifications enabled.');
        } else {
          Alert.alert('Could not enable', error ?? 'Try again later.');
        }
      } else {
        const { ok, error } = await unregisterPushToken(user.id);
        if (ok) {
          await refreshProfile();
          Alert.alert('Success', 'Push notifications disabled.');
        } else {
          Alert.alert('Could not disable', error ?? 'Try again later.');
        }
      }
    };

    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out. Please try again.')), PUSH_TOGGLE_TIMEOUT_MS)
    );

    try {
      await Promise.race([run(), timeout]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setPushToggling(false);
    }
  };

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Profile card */}
      <View style={[styles.card, styles.cardElevated, { backgroundColor: colors.cardBg ?? colors.background, borderColor: colors.border }]}>
        {user && profile == null && !isLoading ? (
          <>
            <View style={styles.profileLoadingRow}>
              <ActivityIndicator size="small" color={colors.tint} />
              <Text style={[styles.profileLoadingText, { color: colors.secondaryText }]}>
                Profile didn’t load. Pull down to retry.
              </Text>
            </View>
            <Link href="/(tabs)/edit-profile" asChild>
              <Pressable style={[styles.editProfileButtonWrap, { borderTopColor: colors.border }]}>
                <View style={[styles.primaryButton, styles.editProfileButton, { backgroundColor: colors.tint }]}>
                  <Text style={styles.primaryButtonText}>Edit profile</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#ffffff" />
                </View>
              </Pressable>
            </Link>
          </>
        ) : (
          <>
            <View style={styles.headerRow}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatarPlaceholder, { backgroundColor: colors.tabIconDefault }]}>
                  <Text style={[styles.avatarInitial, { color: colors.background }]}>
                    {(profile?.name || user?.email || 'U').trim()[0]?.toUpperCase?.() ?? 'U'}
                  </Text>
                </View>
              )}
              <View style={styles.headerText}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                    {profile?.name ?? '—'}
                  </Text>
                  {profile?.profile_completed_at ? (
                    <FontAwesome name="shield" size={14} color={colors.tint} style={styles.shieldIcon} />
                  ) : null}
                </View>
                <Text style={[styles.email, { color: colors.secondaryText }]} numberOfLines={1}>
                  {profile?.phone ? maskPhoneForDisplay(profile.phone) : profile?.email ?? user?.email ?? '—'}
                </Text>
                {profile?.created_at ? (
                  <Text style={[styles.userSince, { color: colors.secondaryText }]}>
                    {formatUserSince(profile.created_at)}
                  </Text>
                ) : null}
              </View>
            </View>
            <Link href="/(tabs)/edit-profile" asChild>
              <Pressable style={[styles.editProfileButtonWrap, { borderTopColor: colors.border }]}>
                <View style={[styles.primaryButton, styles.editProfileButton, { backgroundColor: colors.tint }]}>
                  <Text style={styles.primaryButtonText}>Edit profile</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color="#ffffff" />
                </View>
              </Pressable>
            </Link>
          </>
        )}
      </View>

      {/* Settings */}
      <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Settings</Text>
      <View style={[styles.card, { backgroundColor: colors.cardBg ?? colors.background, borderColor: colors.border }]}>
        <View style={[styles.settingRow, styles.settingRowBorder, { borderBottomColor: colors.border }]}>
          <View style={styles.settingRowInner}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="bell-outline" size={22} color={colors.icon} />
            </View>
            <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>Push notifications</Text>
            <View style={styles.rowRight}>
              {pushToggling ? (
                <ActivityIndicator size="small" color={colors.tint} />
              ) : (
                <Switch
                  value={pushEnabled}
                  onValueChange={onPushToggle}
                  trackColor={{ false: colors.tabIconDefault, true: colors.tint }}
                  thumbColor="#fff"
                />
              )}
            </View>
          </View>
        </View>
        <Link href="/(tabs)/my-reuse" asChild>
          <Pressable style={[styles.settingRow, styles.settingRowBorder, { borderBottomColor: colors.border }]}>
            <View style={styles.settingRowInner}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="package-variant" size={22} color={colors.icon} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>My reuse products</Text>
              <View style={styles.rowRight}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
              </View>
            </View>
          </Pressable>
        </Link>
        <Link href="/(tabs)/my-requests" asChild>
          <Pressable style={[styles.settingRow, styles.settingRowLast]}>
            <View style={styles.settingRowInner}>
              <View style={styles.iconWrap}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={22} color={colors.icon} />
              </View>
              <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>My requests</Text>
              <View style={styles.rowRight}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
              </View>
            </View>
          </Pressable>
        </Link>
      </View>

      {/* Active role — right after Settings so menu below reflects selected role (avoids blinking) */}
      {userRoles.length > 1 && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>Active role</Text>
          <View style={[styles.card, { backgroundColor: colors.cardBg ?? colors.background, borderColor: colors.border }]}>
            {userRoles.map((ur, index) => (
              <Pressable
                key={ur.id}
                style={[
                  styles.settingRow,
                  index < userRoles.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                  index === userRoles.length - 1 && styles.settingRowLast,
                  activeRole?.id === ur.role_id && { backgroundColor: colors.headerBg },
                ]}
                onPress={() => ur.role && setActiveRoleId(ur.role_id)}
              >
                <View style={styles.settingRowInner}>
                  <View style={styles.iconWrapSpacer} />
                  <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>
                    {ur.role?.label ?? ur.role_id}
                  </Text>
                  <View style={styles.rowRight}>
                    {activeRole?.id === ur.role_id ? (
                      <View style={[styles.activeBadge, { backgroundColor: colors.tint }]}>
                        <Text style={styles.activeBadgeText}>Active</Text>
                      </View>
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}

      {/* Admin / Reviewer — shown based on active role selected above */}
      {(activeRole?.code === 'admin' || activeRole?.code === 'reviewer') && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.sectionTitle }]}>
            {activeRole?.code === 'admin' ? 'Admin' : 'Reviewer'}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.cardBg ?? colors.background, borderColor: colors.border }]}>
            <Link href="/(tabs)/approve-reuse" asChild>
              <Pressable style={[styles.settingRow, styles.settingRowBorder, { borderBottomColor: colors.border }]}>
                <View style={styles.settingRowInner}>
                  <View style={styles.iconWrap}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={22} color={colors.icon} />
                  </View>
                  <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>Manage products</Text>
                  <View style={styles.rowRight}>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
                  </View>
                </View>
              </Pressable>
            </Link>
            <Link href="/(tabs)/approve-posts" asChild>
              <Pressable style={[styles.settingRow, styles.settingRowBorder, { borderBottomColor: colors.border }]}>
                <View style={styles.settingRowInner}>
                  <View style={styles.iconWrap}>
                    <MaterialCommunityIcons name="forum-outline" size={22} color={colors.icon} />
                  </View>
                  <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>Approve posts</Text>
                  <View style={styles.rowRight}>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
                  </View>
                </View>
              </Pressable>
            </Link>
            {activeRole?.code === 'admin' && (
              <>
                <Link href="/(tabs)/send-push" asChild>
                  <Pressable style={[styles.settingRow, styles.settingRowBorder, { borderBottomColor: colors.border }]}>
                    <View style={styles.settingRowInner}>
                      <View style={styles.iconWrap}>
                        <MaterialCommunityIcons name="send-outline" size={22} color={colors.icon} />
                      </View>
                      <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>Send push notification</Text>
                      <View style={styles.rowRight}>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
                      </View>
                    </View>
                  </Pressable>
                </Link>
                <Link href="/(tabs)/users" asChild>
                  <Pressable style={[styles.settingRow, styles.settingRowLast]}>
                    <View style={styles.settingRowInner}>
                      <View style={styles.iconWrap}>
                        <MaterialCommunityIcons name="account-group-outline" size={22} color={colors.icon} />
                      </View>
                      <Text style={[styles.settingLabel, { color: colors.text }]} numberOfLines={1}>Users</Text>
                      <View style={styles.rowRight}>
                        <MaterialCommunityIcons name="chevron-right" size={20} color={colors.icon} />
                      </View>
                    </View>
                  </Pressable>
                </Link>
              </>
            )}
            {activeRole?.code === 'reviewer' && (
              <View style={[styles.settingRowLast, styles.hintBox]}>
                <Text style={[styles.hint, { color: colors.secondaryText }]}>
                  Approve, reject, hold or activate listings.
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* Sign out */}
      <View style={styles.signOutSection}>
        <Pressable
          style={[styles.signOutButton, { borderColor: colors.border }]}
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/phone');
          }}
        >
          <View style={styles.settingRowInner}>
            <View style={styles.iconWrap}>
              <MaterialCommunityIcons name="logout" size={22} color={colors.secondaryText} />
            </View>
            <Text style={[styles.signOutText, { color: colors.secondaryText }]}>Sign out</Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// 8px spacing grid: 8, 12, 16, 20, 24
const SPACING = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl + SPACING.md,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
  },
  cardElevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    marginTop: SPACING.xs,
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    gap: SPACING.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shieldIcon: { marginLeft: 4 },
  name: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  email: { fontSize: 15, marginBottom: 2 },
  userSince: { fontSize: 13, opacity: 0.9 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '700' },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 10,
    gap: 6,
    minHeight: 44,
  },
  editProfileButtonWrap: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  editProfileButton: {
    alignSelf: 'stretch',
  },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: '#ffffff' },
  profileLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  profileLoadingText: { fontSize: 14 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    alignSelf: 'stretch',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    minHeight: 48,
  },
  settingRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    flexWrap: 'nowrap',
  },
  settingRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  settingRowLast: { borderBottomWidth: 0 },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  iconWrapSpacer: {
    width: 28,
    marginRight: SPACING.sm,
    flexShrink: 0,
  },
  settingLabel: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '500' },
  rowRight: { flexShrink: 0, marginLeft: SPACING.xs },
  hintBox: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  hint: { fontSize: 13, lineHeight: 18 },
  activeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  signOutSection: { marginTop: SPACING.lg, marginBottom: SPACING.xl },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 48,
  },
  signOutText: { fontSize: 15, fontWeight: '500' },
});
