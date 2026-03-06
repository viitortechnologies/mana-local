import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { requestWithTimeout, TIMEOUT_MESSAGE } from '@/src/lib/requestWithTimeout';
import { useAuth } from '@/src/contexts/AuthContext';
import { useRole } from '@/src/contexts/RoleContext';
import type { Post } from '@/src/lib/types';
import { POST_CATEGORIES } from '@/src/lib/types';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

type FilterTab = 'all' | 'pending' | 'approved';

function postStatus(post: Post): 'pending' | 'approved' {
  return post.approved_at ? 'approved' : 'pending';
}

export default function ApprovePostsScreen() {
  const { user } = useAuth();
  const { activeRole } = useRole();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isModerator = activeRole?.code === 'admin' || activeRole?.code === 'reviewer';

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Failed to load posts', error);
        setPosts([]);
      } else {
        const list = (data ?? []) as Post[];
        const authorIds = [...new Set(list.map((p) => p.author_id))];
        if (authorIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, name, avatar_url, created_at')
            .in('id', authorIds);
          const profileMap = new Map(
            (profilesData ?? []).map((p: { id: string; name: string | null; avatar_url: string | null; created_at: string }) => [p.id, p])
          );
          list.forEach((p) => {
            const author = profileMap.get(p.author_id);
            (p as Post).profiles = author ? { name: author.name, avatar_url: author.avatar_url ?? null, created_at: author.created_at } : null;
          });
        }
        setPosts(list);
      }
    } catch (e) {
      console.warn('Approve posts load error', e);
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const filteredPosts =
    filterTab === 'all'
      ? posts
      : filterTab === 'pending'
        ? posts.filter((p) => postStatus(p) === 'pending')
        : posts.filter((p) => postStatus(p) === 'approved');

  const handleApprove = async (post: Post) => {
    if (!isModerator) return;
    setBusyId(post.id);
    try {
      const now = new Date().toISOString();
      const { error } = await requestWithTimeout(
        supabase.from('posts').update({ approved_at: now, updated_at: now }).eq('id', post.id)
      );
      if (error) {
        Alert.alert('Could not approve', error.message || 'Please try again.');
        return;
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, approved_at: now, updated_at: now } : p))
      );
    } catch (e: unknown) {
      const msg =
        (e as { message?: string })?.message === 'REQUEST_TIMEOUT'
          ? TIMEOUT_MESSAGE
          : (e as Error)?.message ?? 'Could not approve. Try again.';
      Alert.alert('Could not approve', msg);
    } finally {
      setBusyId(null);
    }
  };

  if (!isModerator) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.forbidden, { color: colors.text }]}>
          Only Admin or Reviewer can approve community posts.
        </Text>
        <Pressable style={[styles.backBtn, { marginTop: 16 }]} onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={{ color: colors.tint, fontWeight: '600' }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.headerRow, { borderBottomColor: colors.tabIconDefault }]}>
        <Pressable onPress={() => router.replace('/(tabs)/profile')} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.tint }]}>← Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Approve posts</Text>
      </View>

      <View style={[styles.tabRow, { borderBottomColor: colors.tabIconDefault }]}>
        {(['all', 'pending', 'approved'] as const).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, filterTab === tab && { borderBottomColor: colors.tint, borderBottomWidth: 2 }]}
            onPress={() => setFilterTab(tab)}
          >
            <Text style={[styles.tabText, { color: filterTab === tab ? colors.tint : colors.tabIconDefault }]}>
              {tab === 'all' ? 'All' : tab === 'pending' ? 'Pending' : 'Approved'}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
        }
      >
        {loading && posts.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.tint} />
          </View>
        ) : filteredPosts.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
              {filterTab === 'all' ? 'No posts.' : `No ${filterTab} posts.`}
            </Text>
          </View>
        ) : (
          filteredPosts.map((post) => {
            const status = postStatus(post);
            const isBusy = busyId === post.id;
            const categoryLabel = POST_CATEGORIES.find((c) => c.value === post.category)?.label ?? post.category;
            const authorLabel = post.profiles?.name?.trim() || 'Anonymous';

            return (
              <View
                key={post.id}
                style={[styles.card, { backgroundColor: colors.background, borderColor: colors.tabIconDefault }]}
              >
                <View style={styles.cardRow}>
                  {post.media_urls?.[0] ? (
                    <Image source={{ uri: post.media_urls[0] }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumbPlaceholder, { backgroundColor: colors.tabIconDefault }]} />
                  )}
                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
                        {post.title || '(No title)'}
                      </Text>
                      <View
                        style={[
                          styles.statusBadge,
                          status === 'pending' && { backgroundColor: '#d9770620' },
                          status === 'approved' && { backgroundColor: '#22c55e20' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            status === 'pending' && { color: '#d97706' },
                            status === 'approved' && { color: '#16a34a' },
                          ]}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.category, { color: colors.tabIconDefault }]}>{categoryLabel}</Text>
                    {post.body ? (
                      <Text style={[styles.body, { color: colors.tabIconDefault }]} numberOfLines={2}>
                        {post.body}
                      </Text>
                    ) : null}
                    <View style={styles.metaRow}>
                      {post.profiles?.avatar_url ? (
                        <Image source={{ uri: post.profiles.avatar_url }} style={styles.metaAvatar} />
                      ) : (
                        <View style={[styles.metaAvatarPlaceholder, { backgroundColor: colors.tint }]}>
                          <Text style={styles.metaAvatarInitial}>{(authorLabel || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <Text style={[styles.meta, { color: colors.tabIconDefault }]}>
                        By {authorLabel} · {new Date(post.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.actions}>
                  <Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild>
                    <Pressable style={[styles.viewBtn, { borderColor: colors.tint }]}>
                      <Text style={[styles.viewBtnText, { color: colors.tint }]}>View</Text>
                    </Pressable>
                  </Link>
                  {status === 'pending' && (
                    <Pressable
                      style={[styles.approveBtn, { backgroundColor: colors.tint }]}
                      onPress={() => handleApprove(post)}
                      disabled={!!isBusy}
                    >
                      {isBusy ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.approveBtnText}>Approve</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  forbidden: { fontSize: 16, textAlign: 'center' },
  backBtn: { padding: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: { marginRight: 12 },
  backText: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '700', flex: 1 },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tab: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  emptyBox: { paddingVertical: 48, alignItems: 'center' },
  emptyText: { fontSize: 16 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: { flexDirection: 'row', marginBottom: 12 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
  },
  thumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginRight: 12,
    opacity: 0.3,
  },
  cardBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '600', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  category: { fontSize: 12, marginBottom: 2 },
  body: { fontSize: 13, marginBottom: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  metaAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
  },
  metaAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaAvatarInitial: { fontSize: 11, fontWeight: '700', color: '#fff' },
  meta: { fontSize: 12 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewBtn: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  viewBtnText: { fontSize: 14, fontWeight: '600' },
  approveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
