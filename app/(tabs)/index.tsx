import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/src/lib/supabase';
import { useLocation } from '@/src/contexts/LocationContext';
import { useAuth } from '@/src/contexts/AuthContext';
import type { Post, PostCategory } from '@/src/lib/types';
import { POST_CATEGORIES } from '@/src/lib/types';
import { isVideoUrl } from '@/constants/MediaLimits';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { BannerCarousel } from '@/components/BannerCarousel';
import { EnvironmentSection } from '@/components/EnvironmentSection';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const LIST_PADDING = 40; // 20 * 2 (matches list paddingHorizontal)
const CARD_WIDTH = SCREEN_WIDTH - LIST_PADDING;
const COVER_ASPECT = 1; // square cover like Instagram

function daysSince(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / (24 * 60 * 60 * 1000)));
}

type SheetType = 'likes' | 'comments' | 'shares' | null;

function PostCard({
  post,
  onOpenLikes,
  onOpenComments,
  onOpenShares,
  onOpenMenu,
}: {
  post: Post;
  onOpenLikes: (postId: string) => void;
  onOpenComments: (postId: string) => void;
  onOpenShares: (postId: string) => void;
  onOpenMenu: (post: Post) => void;
}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const categoryLabel = POST_CATEGORIES.find((c) => c.value === post.category)?.label ?? post.category;
  const authorLabel = post.profiles?.name?.trim() ? post.profiles.name.trim() : 'Anonymous';
  const days = daysSince(post.profiles?.created_at ?? null);
  const mediaUrls = post.media_urls ?? [];
  const hasMedia = mediaUrls.length > 0;
  const [mediaIndex, setMediaIndex] = useState(0);

  const onMediaScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / CARD_WIDTH);
    if (index >= 0 && index < mediaUrls.length) setMediaIndex(index);
  };

  return (
    <View
      style={StyleSheet.flatten([
        styles.card,
        { backgroundColor: colors.cardBg ?? colors.background, borderColor: colors.border ?? colors.tabIconDefault },
      ])}
    >
      {/* Above post: profile + 3-dots */}
      <View style={[styles.cardHeaderRow, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
        <Link href={{ pathname: '/(tabs)/member/[id]', params: { id: post.author_id } }} asChild>
          <Pressable style={styles.cardAuthorRow}>
            {post.profiles?.avatar_url ? (
              <Image source={{ uri: post.profiles.avatar_url }} style={styles.cardAuthorAvatar} />
            ) : (
              <View style={[styles.cardAuthorAvatarPlaceholder, { backgroundColor: colors.tint }]}>
                <Text style={styles.cardAuthorAvatarInitial}>
                  {(authorLabel || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.cardAuthorInfo}>
              <Text style={[styles.cardAuthor, { color: colors.text }]} numberOfLines={1}>
                {authorLabel}
              </Text>
              <Text style={[styles.cardAuthorMeta, { color: colors.tabIconDefault }]}>{days}d ago</Text>
            </View>
          </Pressable>
        </Link>
        <Pressable
          style={styles.cardMenuBtn}
          onPress={() => onOpenMenu(post)}
          hitSlop={12}
        >
          <MaterialCommunityIcons name="dots-horizontal" size={22} color={colors.tabIconDefault} />
        </Pressable>
      </View>

      {/* Post media — tappable to open post; horizontal scroll fixed width so swipe works */}
      {hasMedia ? (
        <>
          <Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild>
            <Pressable style={styles.cardMediaWrap}>
              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onMediaScroll}
                style={[styles.cardMediaScroll, { width: CARD_WIDTH }]}
                contentContainerStyle={styles.cardMediaScrollContent}
                nestedScrollEnabled={Platform.OS === 'android'}
                bounces={false}
              >
                {mediaUrls.map((url, i) => {
                  const isVideo = isVideoUrl(url);
                  return (
                    <View key={i} style={[styles.cardMediaSlide, { width: CARD_WIDTH, height: CARD_WIDTH * COVER_ASPECT }]}>
                      {isVideo ? (
                        <View style={[styles.cardMediaPlaceholder, { backgroundColor: colors.tabIconDefault + '25' }]}>
                          <MaterialCommunityIcons name="play-circle-outline" size={48} color={colors.tint} />
                          <Text style={[styles.cardMediaPlaceholderLabel, { color: colors.tabIconDefault }]}>Video</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Link>
          {mediaUrls.length > 1 ? (
            <View style={styles.cardDotsWrap}>
              {mediaUrls.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.cardDot,
                    { backgroundColor: i === mediaIndex ? colors.tint : colors.tabIconDefault + '60' },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Below post: likes, comments, shares — each opens a sheet */}
      <View style={[styles.cardStatsRow, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
        <Pressable style={styles.cardStatBtn} onPress={() => onOpenLikes(post.id)}>
          <MaterialCommunityIcons name="heart-outline" size={20} color={colors.tabIconDefault} />
          <Text style={[styles.cardStatText, { color: colors.tabIconDefault }]}>
            {post.like_count ?? 0} likes
          </Text>
        </Pressable>
        <Pressable style={styles.cardStatBtn} onPress={() => onOpenComments(post.id)}>
          <MaterialCommunityIcons name="comment-outline" size={20} color={colors.tabIconDefault} />
          <Text style={[styles.cardStatText, { color: colors.tabIconDefault }]}>
            {post.comment_count ?? 0} comments
          </Text>
        </Pressable>
        <Pressable style={styles.cardStatBtn} onPress={() => onOpenShares(post.id)}>
          <MaterialCommunityIcons name="share-outline" size={20} color={colors.tabIconDefault} />
          <Text style={[styles.cardStatText, { color: colors.tabIconDefault }]}>
            {post.share_count ?? 0} shares
          </Text>
        </Pressable>
      </View>

      {/* Title and description — tappable to open post; when no media this is the main content */}
      <Link href={{ pathname: '/post/[id]', params: { id: post.id } }} asChild>
        <Pressable style={[styles.cardBody, !hasMedia && styles.cardBodyNoMedia]}>
          <View style={styles.cardTopRow}>
            <View style={[styles.categoryPill, { backgroundColor: colors.tint + '22' }]}>
              <Text style={[styles.categoryPillText, { color: colors.tint }]} numberOfLines={1}>
                {categoryLabel}
              </Text>
            </View>
          </View>
          {(post.title || post.body) ? (
            <>
              {post.title ? (
                <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                  {post.title}
                </Text>
              ) : null}
              {post.body ? (
                <Text style={[styles.cardBodyText, { color: colors.tabIconDefault }]} numberOfLines={3}>
                  {post.body}
                </Text>
              ) : null}
            </>
          ) : null}
        </Pressable>
      </Link>
    </View>
  );
}

const PAGE_SIZE = 10;

export default function CommunityScreen() {
  const { selectedLocation } = useLocation();
  const { canPost } = useAuth();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const fabBottom = 28 + (Platform.OS === 'ios' ? insets.bottom : 0);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    isRefetching,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['posts', selectedLocation?.id],
    enabled: !!selectedLocation?.id,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!selectedLocation?.id) return [] as Post[];

      // When locations fail to load, selectedLocation.id is "fallback-0" etc.
      // Resolve to a real UUID by pincode so posts show for those fallback locations.
      let locationId: string = selectedLocation.id;
      if (String(locationId).startsWith('fallback-') && selectedLocation.pincode) {
        const { data: loc, error: locError } = await supabase
          .from('locations')
          .select('id')
          .eq('pincode', selectedLocation.pincode)
          .maybeSingle();

        if (locError) {
          console.warn('Failed to resolve fallback location for posts', locError);
        }

        if (!loc?.id) {
          // No matching real location; nothing to show for this fallback area.
          return [] as Post[];
        }
        locationId = loc.id;
      }

      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: postsData, error } = await supabase
        .from('posts')
        .select('*')
        .eq('location_id', locationId)
        .not('approved_at', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.warn('Failed to load posts', error);
        return [] as Post[];
      }
      const list = (postsData ?? []) as Post[];
      if (list.length > 0) {
        const authorIds = [...new Set(list.map((p) => p.author_id))];
        const [profilesRes, countsRes] = await Promise.all([
          supabase.from('profiles').select('id, name, avatar_url, created_at').in('id', authorIds),
          supabase.rpc('get_post_comment_counts', { post_ids: list.map((p) => p.id) }),
        ]);
        const profileMap = new Map(
          (profilesRes.data ?? []).map((p: { id: string; name: string | null; avatar_url: string | null; created_at: string }) => [p.id, p])
        );
        const countMap = new Map<string, number>();
        if (!countsRes.error && Array.isArray(countsRes.data)) {
          (countsRes.data as { post_id: string; comment_count: number | string }[]).forEach((r) => {
            countMap.set(r.post_id, Number(r.comment_count) || 0);
          });
        }
        list.forEach((p) => {
          const author = profileMap.get(p.author_id);
          (p as Post).profiles = author ? { name: author.name, avatar_url: author.avatar_url ?? null, created_at: author.created_at } : null;
          (p as Post).comment_count = countMap.get(p.id) ?? 0;
        });
      }
      return list;
    },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PAGE_SIZE ? undefined : allPages.length,
  });

  const rawPosts = useMemo(
    () => (data?.pages ? data.pages.flat() : ([] as Post[])),
    [data]
  );

  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [activeCategory, setActiveCategory] = useState<PostCategory | null>(null);

  const [sheetType, setSheetType] = useState<SheetType>(null);
  const [sheetPostId, setSheetPostId] = useState<string | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const sheetAnim = useRef(new Animated.Value(0)).current;
  const SHEET_HEIGHT = Dimensions.get('window').height * 0.5;
  const sheetTranslateY = sheetAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  const openSheet = useCallback((type: SheetType, postId: string) => {
    setSheetPostId(postId);
    setSheetType(type);
    setSheetClosing(false);
    sheetAnim.setValue(0);
    Animated.spring(sheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [sheetAnim]);

  const closeSheet = useCallback(() => {
    setSheetClosing(true);
    Animated.timing(sheetAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setSheetType(null);
        setSheetPostId(null);
        setSheetClosing(false);
      }
    });
  }, [sheetAnim]);

  const handleOpenMenu = useCallback((post: Post) => {
    Alert.alert(
      'Post options',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Share',
          onPress: async () => {
            try {
              const authorName = (post.profiles?.name?.trim() || 'Anonymous').trim();
              const postDate = post.created_at
                ? new Date(post.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
                : '';
              const titleLine = (post.title?.trim() || 'Post').toUpperCase();
              const bodyText = (post.body?.trim() || '').trim();
              const parts = [`★ ${titleLine} ★`];
              if (bodyText) parts.push('', bodyText);
              parts.push('', '—', `Posted by: ${authorName}`, postDate ? `Date: ${postDate}` : '', '', 'Shared from Mana Local app.', '#ManaLocal');
              await Share.share({ message: parts.filter(Boolean).join('\n'), title: post.title ?? 'Post from Mana Local' });
              await supabase.rpc('increment_post_share', { post_id: post.id });
            } catch (_) {}
          },
        },
        { text: 'Report', onPress: () => { /* TODO: report flow */ } },
      ]
    );
  }, []);

  const [sheetLikes, setSheetLikes] = useState<{ id: string; name: string | null; avatar_url: string | null }[]>([]);
  const [sheetComments, setSheetComments] = useState<{ id: string; body: string; author_id: string; name: string | null; avatar_url: string | null; created_at: string }[]>([]);
  const [sheetShareCount, setSheetShareCount] = useState<number>(0);
  const [sheetLoading, setSheetLoading] = useState(false);

  React.useEffect(() => {
    if (!sheetPostId || !sheetType) return;
    let cancelled = false;
    setSheetLoading(true);
    if (sheetType === 'likes') {
      (async () => {
        const { data: likers } = await supabase.rpc('get_post_likers', { post_id: sheetPostId });
        if (cancelled) return;
        setSheetLikes((likers ?? []).map((r: { id: string; name: string | null; avatar_url: string | null }) => ({ id: r.id, name: r.name, avatar_url: r.avatar_url })));
        setSheetLoading(false);
      })();
    } else if (sheetType === 'comments') {
      (async () => {
        const { data: list } = await supabase.rpc('get_post_comment_list', { post_id: sheetPostId });
        if (cancelled) return;
        setSheetComments((list ?? []) as { id: string; body: string; author_id: string; name: string | null; avatar_url: string | null; created_at: string }[]);
        setSheetLoading(false);
      })();
    } else if (sheetType === 'shares') {
      (async () => {
        const { data: postData } = await supabase.from('posts').select('share_count').eq('id', sheetPostId).single();
        if (cancelled) return;
        setSheetShareCount((postData as { share_count: number } | null)?.share_count ?? 0);
        setSheetLoading(false);
      })();
    }
    return () => { cancelled = true; };
  }, [sheetPostId, sheetType]);

  const posts = useMemo(() => {
    let list = rawPosts;
    if (activeCategory) {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          (p.title?.toLowerCase().includes(q)) ||
          (p.body?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rawPosts, activeCategory, searchQuery]);

  const activeCategoryLabel = activeCategory ? POST_CATEGORIES.find((c) => c.value === activeCategory)?.label : null;

  if (isLoading && !data) {
    return (
      <View style={StyleSheet.flatten([styles.centered, { backgroundColor: colors.background }])}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  const emptyComponent = (
    <View style={styles.emptyState}>
      <Text style={StyleSheet.flatten([styles.empty, { color: colors.tabIconDefault }])}>No posts yet in this location.</Text>
      {canPost ? (
        <Link href="/(tabs)/new-post" asChild>
          <Pressable style={StyleSheet.flatten([styles.emptyButton, { backgroundColor: colors.tint }])}>
            <Text style={styles.emptyButtonText}>Create first post</Text>
          </Pressable>
        </Link>
      ) : (
        <>
          <Text style={StyleSheet.flatten([styles.emptyHint, { color: colors.tabIconDefault }])}>
            Complete your profile to create posts here.
          </Text>
          <Pressable
            style={StyleSheet.flatten([styles.emptyButton, { borderWidth: 1, borderColor: colors.tint }])}
            onPress={() =>
              Alert.alert(
                'How to create posts',
                'Complete your profile (name, email, photo, etc.) from the Profile tab. Once your profile is complete, you can create community posts.'
              )
            }
          >
            <Text style={StyleSheet.flatten([styles.emptyButtonText, { color: colors.tint }])}>How do I post?</Text>
          </Pressable>
        </>
      )}
    </View>
  );

  const onFabPress = () => {
    if (canPost) {
      // Navigation handled by Link
    } else {
      Alert.alert(
        'How to create posts',
        'Complete your profile (name, email, photo, etc.) from the Profile tab. Once your profile is complete, you can create community posts.'
      );
    }
  };

  const chipBorder = colors.border ?? colors.tabIconDefault + '99';

  return (
    <View
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      collapsable={false}
      pointerEvents="box-none"
    >
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View>
            <View style={[styles.screenHeader, { backgroundColor: colors.background, borderBottomColor: chipBorder }]}>
              <Text style={[styles.screenTitle, { color: colors.text }]}>Community</Text>
              <Text style={[styles.screenSubtitle, { color: colors.tabIconDefault }]}>
                Posts and discussions in your area
              </Text>
            </View>
            <BannerCarousel />
            <EnvironmentSection cityName={selectedLocation?.name ?? 'Armoor'} />
            <Pressable
              style={[styles.filterRow, { borderBottomColor: chipBorder, backgroundColor: colors.background }]}
              onPress={() => {
                setSearchInputValue(searchQuery);
                setFilterModalVisible(true);
              }}
            >
              <Text style={[styles.filterRowLabel, { color: colors.text }]} numberOfLines={1}>
                {activeCategoryLabel ?? 'All'}
                {searchQuery.trim() ? ` · "${searchQuery.trim()}"` : ''}
              </Text>
              <View style={[styles.filterIconWrap, { backgroundColor: colors.tint + '22' }]}>
                <MaterialCommunityIcons name="filter-variant" size={22} color={colors.tint} />
              </View>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onOpenLikes={(id) => openSheet('likes', id)}
            onOpenComments={(id) => openSheet('comments', id)}
            onOpenShares={(id) => openSheet('shares', id)}
            onOpenMenu={handleOpenMenu}
          />
        )}
        contentContainerStyle={[styles.list, posts.length === 0 && styles.listEmpty]}
        ListEmptyComponent={
          rawPosts.length === 0
            ? emptyComponent
            : (
              <View style={styles.emptyFiltered}>
                <Text style={[styles.emptyFilteredText, { color: colors.text }]}>No posts match your filter.</Text>
                <Text style={[styles.emptyFilteredHint, { color: colors.tabIconDefault }]}>
                  Try a different category or search.
                </Text>
              </View>
            )
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            tintColor={colors.tint}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
      />

      {/* Likes / Comments / Shares bottom sheet */}
      <Modal
        visible={(sheetType !== null && sheetPostId !== null) || sheetClosing}
        transparent
        animationType="fade"
        onRequestClose={closeSheet}
      >
        <Pressable style={styles.feedSheetBackdrop} onPress={closeSheet} />
        <Animated.View
          style={[
            styles.feedSheetContainer,
            { height: SHEET_HEIGHT, backgroundColor: colors.background, borderTopColor: colors.border },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <Pressable style={styles.feedSheetHandle} onPress={closeSheet}>
            <View style={[styles.feedSheetHandleBar, { backgroundColor: colors.tabIconDefault }]} />
          </Pressable>
          <View style={[styles.feedSheetHeader, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
            <Text style={[styles.feedSheetTitle, { color: colors.text }]}>
              {sheetType === 'likes' && 'Likes'}
              {sheetType === 'comments' && 'Comments'}
              {sheetType === 'shares' && 'Shares'}
            </Text>
            <Pressable onPress={closeSheet} hitSlop={12}>
              <MaterialCommunityIcons name="close" size={24} color={colors.tabIconDefault} />
            </Pressable>
          </View>
          {sheetLoading ? (
            <View style={styles.feedSheetLoading}>
              <ActivityIndicator size="large" color={colors.tint} />
            </View>
          ) : sheetType === 'likes' ? (
            <FlatList
              data={sheetLikes}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <Link href={{ pathname: '/(tabs)/member/[id]', params: { id: item.id } }} asChild>
                  <Pressable style={[styles.feedSheetRow, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
                    {item.avatar_url ? (
                      <Image source={{ uri: item.avatar_url }} style={styles.feedSheetAvatar} />
                    ) : (
                      <View style={[styles.feedSheetAvatarPlaceholder, { backgroundColor: colors.tint }]}>
                        <Text style={styles.feedSheetAvatarInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={[styles.feedSheetRowText, { color: colors.text }]} numberOfLines={1}>{item.name || 'Anonymous'}</Text>
                  </Pressable>
                </Link>
              )}
              contentContainerStyle={styles.feedSheetListContent}
              ListEmptyComponent={<Text style={[styles.feedSheetEmpty, { color: colors.tabIconDefault }]}>No likes yet</Text>}
            />
          ) : sheetType === 'comments' ? (
            <FlatList
              data={sheetComments}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={[styles.feedSheetCommentRow, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.feedSheetAvatar} />
                  ) : (
                    <View style={[styles.feedSheetAvatarPlaceholder, { backgroundColor: colors.tint }]}>
                      <Text style={styles.feedSheetAvatarInitial}>{(item.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.feedSheetCommentBody}>
                    <Text style={[styles.feedSheetCommentAuthor, { color: colors.tabIconDefault }]}>{item.name || 'Anonymous'}</Text>
                    <Text style={[styles.feedSheetCommentText, { color: colors.text }]}>{item.body}</Text>
                    <Text style={[styles.feedSheetCommentTime, { color: colors.tabIconDefault }]}>
                      {item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={styles.feedSheetListContent}
              ListEmptyComponent={<Text style={[styles.feedSheetEmpty, { color: colors.tabIconDefault }]}>No comments yet</Text>}
            />
          ) : sheetType === 'shares' ? (
            <View style={styles.feedSheetSharesBody}>
              <MaterialCommunityIcons name="share-outline" size={48} color={colors.tint} />
              <Text style={[styles.feedSheetSharesTitle, { color: colors.text }]}>Shares</Text>
              <Text style={[styles.feedSheetSharesCount, { color: colors.tabIconDefault }]}>
                This post has been shared {sheetShareCount} time{sheetShareCount !== 1 ? 's' : ''}.
              </Text>
              <Text style={[styles.feedSheetSharesHint, { color: colors.tabIconDefault }]}>Share counts are not broken down by user.</Text>
            </View>
          ) : null}
        </Animated.View>
      </Modal>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.filterModalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterModalVisible(false)} />
          <Pressable style={[styles.filterModalBox, { backgroundColor: colors.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={[styles.filterModalHeader, { borderBottomColor: colors.border ?? colors.tabIconDefault }]}>
              <Text style={[styles.filterModalTitle, { color: colors.text }]}>Filter & search</Text>
              <Pressable onPress={() => setFilterModalVisible(false)} hitSlop={12}>
                <MaterialCommunityIcons name="close" size={24} color={colors.tabIconDefault} />
              </Pressable>
            </View>
            <Text style={[styles.filterModalSectionLabel, { color: colors.tabIconDefault }]}>Search posts</Text>
            <TextInput
              style={[styles.filterModalSearch, { color: colors.text, borderColor: colors.tabIconDefault }]}
              placeholder="Search by title or content..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchInputValue}
              onChangeText={setSearchInputValue}
              returnKeyType="search"
            />
            <Text style={[styles.filterModalSectionLabel, { color: colors.tabIconDefault }]}>Category</Text>
            <ScrollView style={styles.filterModalCategoryList} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
              <Pressable
                style={[
                  styles.filterModalCategoryItem,
                  { borderColor: colors.border ?? colors.tabIconDefault },
                  !activeCategory && { backgroundColor: colors.tint + '20', borderColor: colors.tint },
                ]}
                onPress={() => {
                  setActiveCategory(null);
                  setFilterModalVisible(false);
                }}
              >
                <Text style={[styles.filterModalCategoryText, { color: colors.text }]}>All</Text>
                {!activeCategory && <MaterialCommunityIcons name="check" size={20} color={colors.tint} />}
              </Pressable>
              {POST_CATEGORIES.map((c) => {
                const active = activeCategory === c.value;
                return (
                  <Pressable
                    key={c.value}
                    style={[
                      styles.filterModalCategoryItem,
                      { borderColor: colors.border ?? colors.tabIconDefault },
                      active && { backgroundColor: colors.tint + '20', borderColor: colors.tint },
                    ]}
                    onPress={() => {
                      setActiveCategory(c.value);
                      setFilterModalVisible(false);
                    }}
                  >
                    <Text style={[styles.filterModalCategoryText, { color: colors.text }]}>{c.label}</Text>
                    {active && <MaterialCommunityIcons name="check" size={20} color={colors.tint} />}
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={[styles.filterModalFooter, { borderTopColor: colors.border ?? colors.tabIconDefault }]}>
              <Pressable
                style={[styles.filterModalApplyBtn, { backgroundColor: colors.tint }]}
                onPress={() => {
                  setSearchQuery(searchInputValue.trim());
                  setFilterModalVisible(false);
                }}
              >
                <Text style={styles.filterModalApplyText}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.fabContainer} pointerEvents="box-none">
        {canPost ? (
          <Link href="/(tabs)/new-post" asChild>
            <Pressable
              style={StyleSheet.flatten([styles.fab, { backgroundColor: colors.tint, bottom: fabBottom }])}
              collapsable={false}
            >
              <View style={styles.fabIconWrap}>
                <Text style={styles.fabIcon} numberOfLines={1}>+</Text>
              </View>
            </Pressable>
          </Link>
        ) : (
          <Pressable
            style={StyleSheet.flatten([styles.fab, { backgroundColor: colors.tint, bottom: fabBottom }])}
            onPress={onFabPress}
            collapsable={false}
          >
            <View style={styles.fabIconWrap}>
              <Text style={styles.fabIcon} numberOfLines={1}>+</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 100 },
  listEmpty: { flexGrow: 1 },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  screenSubtitle: { fontSize: 15, fontWeight: '500', opacity: 0.9 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterRowLabel: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 12 },
  filterIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  filterModalBox: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  filterModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filterModalTitle: { fontSize: 18, fontWeight: '700' },
  filterModalSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    marginHorizontal: 20,
    opacity: 0.9,
  },
  filterModalSearch: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginHorizontal: 20,
  },
  filterModalCategoryList: {
    maxHeight: 280,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  filterModalCategoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  filterModalCategoryText: { fontSize: 15, fontWeight: '500' },
  filterModalFooter: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  filterModalApplyBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  filterModalApplyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  feedSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  feedSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  feedSheetHandle: { alignItems: 'center', paddingVertical: 10 },
  feedSheetHandleBar: { width: 36, height: 4, borderRadius: 2, opacity: 0.5 },
  feedSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  feedSheetTitle: { fontSize: 18, fontWeight: '700' },
  feedSheetLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  feedSheetListContent: { paddingBottom: 24 },
  feedSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  feedSheetAvatar: { width: 40, height: 40, borderRadius: 20 },
  feedSheetAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  feedSheetAvatarInitial: { fontSize: 16, fontWeight: '700', color: '#fff' },
  feedSheetRowText: { fontSize: 16, fontWeight: '500', flex: 1 },
  feedSheetEmpty: { fontSize: 15, textAlign: 'center', paddingVertical: 32 },
  feedSheetCommentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  feedSheetCommentBody: { flex: 1, minWidth: 0 },
  feedSheetCommentAuthor: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  feedSheetCommentText: { fontSize: 15, lineHeight: 22 },
  feedSheetCommentTime: { fontSize: 12, marginTop: 4 },
  feedSheetSharesBody: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  feedSheetSharesTitle: { fontSize: 20, fontWeight: '700', marginTop: 12 },
  feedSheetSharesCount: { fontSize: 16, marginTop: 8 },
  feedSheetSharesHint: { fontSize: 13, marginTop: 8, fontStyle: 'italic' },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardMenuBtn: { padding: 8 },
  cardMediaWrap: { width: CARD_WIDTH },
  cardMediaScroll: { width: CARD_WIDTH, height: CARD_WIDTH * COVER_ASPECT, flexGrow: 0 },
  cardMediaScrollContent: {},
  cardMediaSlide: { overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  cardMediaPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMediaPlaceholderLabel: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  cardDotsWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  cardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cardStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardStatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardStatText: { fontSize: 14, fontWeight: '500' },
  cardBody: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    minWidth: 0,
  },
  cardBodyNoMedia: { paddingTop: 20 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryPillText: { fontSize: 12, fontWeight: '600' },
  cardMeta: { fontSize: 11, flexShrink: 0 },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  cardBodyText: {
    fontSize: 15,
    lineHeight: 22,
  },
  cardAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  cardAuthorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  cardAuthorAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAuthorAvatarInitial: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cardAuthorInfo: { flex: 1, minWidth: 0, justifyContent: 'center' },
  cardAuthor: { fontSize: 15, fontWeight: '600' },
  cardAuthorMeta: { fontSize: 13, marginTop: 2, opacity: 0.85 },
  emptyState: { paddingVertical: 40, paddingHorizontal: 24, alignItems: 'center' },
  empty: { textAlign: 'center', marginBottom: 16, fontSize: 15 },
  emptyHint: { textAlign: 'center', marginBottom: 16, fontSize: 13 },
  emptyButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  emptyButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  emptyFiltered: {
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyFilteredText: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyFilteredHint: { fontSize: 14 },
  fabContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  fabIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 28,
    textAlign: 'center',
    width: 32,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
});
