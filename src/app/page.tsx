/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import {
  ChevronRight,
  Film,
  Tv,
  Calendar,
  Sparkles,
  Play,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getRecommendedShortDramas } from '@/lib/shortdrama.client';
import { cleanExpiredCache } from '@/lib/shortdrama-cache';
import { ShortDramaItem, ReleaseCalendarItem } from '@/lib/types';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories, getDoubanDetails } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import HeroBanner from '@/components/HeroBanner';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import SectionTitle from '@/components/SectionTitle';
import ShortDramaCard from '@/components/ShortDramaCard';
import SkeletonCard from '@/components/SkeletonCard';
import { useSite } from '@/components/SiteProvider';
import { TelegramWelcomeModal } from '@/components/TelegramWelcomeModal';
import VideoCard from '@/components/VideoCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [hotAnime, setHotAnime] = useState<DoubanItem[]>([]);
  const [hotShortDramas, setHotShortDramas] = useState<ShortDramaItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [upcomingReleases, setUpcomingReleases] = useState<
    ReleaseCalendarItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const { announcement } = useSite();
  const [username, setUsername] = useState<string>('');

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  // 🔥 性能优化：HeroBanner开关
  const [enableHeroBanner, setEnableHeroBanner] = useState(true); // 默认true（向后兼容）

  // 从server-config API获取配置
  useEffect(() => {
    fetch('/api/server-config')
      .then((res) => res.json())
      .then((data) => {
        if (data.homePageConfig?.enableHeroBanner !== undefined) {
          setEnableHeroBanner(data.homePageConfig.enableHeroBanner);
        }
      })
      .catch((err) => console.error('获取服务器配置失败:', err));
  }, []);

  // 合并初始化逻辑 - 优化性能，减少重渲染
  useEffect(() => {
    // 获取用户名
    const authInfo = getAuthInfoFromBrowserCookie();
    if (authInfo?.username) {
      setUsername(authInfo.username);
    }

    // 读取清空确认设置
    if (typeof window !== 'undefined') {
      const savedRequireClearConfirmation = localStorage.getItem(
        'requireClearConfirmation',
      );
      if (savedRequireClearConfirmation !== null) {
        setRequireClearConfirmation(JSON.parse(savedRequireClearConfirmation));
      }
    }

    // 检查公告弹窗状态
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // 收藏夹数据
  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
    origin?: 'vod' | 'live';
    type?: string;
    releaseDate?: string;
    remarks?: string;
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);
  const [favoriteFilter, setFavoriteFilter] = useState<
    'all' | 'movie' | 'tv' | 'anime' | 'shortdrama' | 'live' | 'variety'
  >('all');
  const [favoriteSortBy, setFavoriteSortBy] = useState<
    'recent' | 'title' | 'rating'
  >('recent');
  const [upcomingFilter, setUpcomingFilter] = useState<'all' | 'movie' | 'tv'>(
    'all',
  );
  const [showClearFavoritesDialog, setShowClearFavoritesDialog] =
    useState(false);
  const [requireClearConfirmation, setRequireClearConfirmation] =
    useState(false);

  useEffect(() => {
    // 清理过期缓存
    cleanExpiredCache().catch(console.error);

    const fetchRecommendData = async () => {
      try {
        setLoading(true);

        // 并行获取热门电影、热门剧集、热门综艺、热门动漫、热门短剧和即将上映
        const [
          moviesData,
          tvShowsData,
          varietyShowsData,
          animeData,
          shortDramasData,
          bangumiCalendarData,
          upcomingReleasesData,
        ] = await Promise.allSettled([
          getDoubanCategories({
            kind: 'movie',
            category: '热门',
            type: '全部',
          }),
          getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
          getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
          getDoubanCategories({
            kind: 'tv',
            category: 'tv',
            type: 'tv_animation',
          }),
          getRecommendedShortDramas(undefined, 8),
          GetBangumiCalendarData(),
          fetch('/api/release-calendar?limit=100').then((res) => {
            if (!res.ok) {
              console.error('获取即将上映数据失败，状态码:', res.status);
              return { items: [] };
            }
            return res.json();
          }),
        ]);

        // 处理电影数据
        if (
          moviesData.status === 'fulfilled' &&
          moviesData.value?.code === 200
        ) {
          const movies = moviesData.value.list;
          setHotMovies(movies);

          // 性能优化：使用 requestIdleCallback 延迟加载详情，不阻塞初始渲染
          const loadMovieDetails = () => {
            Promise.all(
              movies.slice(0, 2).map(async (movie) => {
                try {
                  const detailsRes = await getDoubanDetails(movie.id);
                  if (detailsRes.code === 200 && detailsRes.data) {
                    console.log(
                      `[HeroBanner] 电影 ${movie.title} - trailerUrl:`,
                      detailsRes.data.trailerUrl,
                    );
                    console.log(
                      `[HeroBanner] 电影 ${movie.title} - backdrop:`,
                      detailsRes.data.backdrop,
                    );
                    return {
                      id: movie.id,
                      plot_summary: detailsRes.data.plot_summary,
                      backdrop: detailsRes.data.backdrop,
                      trailerUrl: detailsRes.data.trailerUrl,
                    };
                  }
                } catch (error) {
                  console.warn(`获取电影 ${movie.id} 详情失败:`, error);
                }
                return null;
              }),
            ).then((results) => {
              setHotMovies((prev) =>
                prev.map((m) => {
                  const detail = results.find((r) => r?.id === m.id);
                  return detail
                    ? {
                        ...m,
                        plot_summary: detail.plot_summary,
                        backdrop: detail.backdrop,
                        trailerUrl: detail.trailerUrl,
                      }
                    : m;
                }),
              );
            });
          };

          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadMovieDetails, { timeout: 2000 });
          } else {
            setTimeout(loadMovieDetails, 1000);
          }
        } else {
          console.warn(
            '获取热门电影失败:',
            moviesData.status === 'rejected'
              ? moviesData.reason
              : '数据格式错误',
          );
        }

        // 处理剧集数据
        if (
          tvShowsData.status === 'fulfilled' &&
          tvShowsData.value?.code === 200
        ) {
          const tvShows = tvShowsData.value.list;
          setHotTvShows(tvShows);

          // 性能优化：使用 requestIdleCallback 延迟加载详情
          const loadTvDetails = () => {
            Promise.all(
              tvShows.slice(0, 2).map(async (show) => {
                try {
                  const detailsRes = await getDoubanDetails(show.id);
                  if (detailsRes.code === 200 && detailsRes.data) {
                    return {
                      id: show.id,
                      plot_summary: detailsRes.data.plot_summary,
                      backdrop: detailsRes.data.backdrop,
                      trailerUrl: detailsRes.data.trailerUrl,
                    };
                  }
                } catch (error) {
                  console.warn(`获取剧集 ${show.id} 详情失败:`, error);
                }
                return null;
              }),
            ).then((results) => {
              setHotTvShows((prev) =>
                prev.map((s) => {
                  const detail = results.find((r) => r?.id === s.id);
                  return detail
                    ? {
                        ...s,
                        plot_summary: detail.plot_summary,
                        backdrop: detail.backdrop,
                        trailerUrl: detail.trailerUrl,
                      }
                    : s;
                }),
              );
            });
          };

          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadTvDetails, { timeout: 2000 });
          } else {
            setTimeout(loadTvDetails, 1000);
          }
        } else {
          console.warn(
            '获取热门剧集失败:',
            tvShowsData.status === 'rejected'
              ? tvShowsData.reason
              : '数据格式错误',
          );
        }

        // 处理综艺数据
        if (
          varietyShowsData.status === 'fulfilled' &&
          varietyShowsData.value?.code === 200
        ) {
          const varietyShows = varietyShowsData.value.list;
          setHotVarietyShows(varietyShows);

          // 性能优化：使用 requestIdleCallback 延迟加载详情
          if (varietyShows.length > 0) {
            const loadVarietyDetails = () => {
              const show = varietyShows[0];
              getDoubanDetails(show.id)
                .then((detailsRes) => {
                  if (detailsRes.code === 200 && detailsRes.data) {
                    setHotVarietyShows((prev) =>
                      prev.map((s) =>
                        s.id === show.id
                          ? {
                              ...s,
                              plot_summary: detailsRes.data!.plot_summary,
                              backdrop: detailsRes.data!.backdrop,
                              trailerUrl: detailsRes.data!.trailerUrl,
                            }
                          : s,
                      ),
                    );
                  }
                })
                .catch((error) => {
                  console.warn(`获取综艺 ${show.id} 详情失败:`, error);
                });
            };

            if ('requestIdleCallback' in window) {
              requestIdleCallback(loadVarietyDetails, { timeout: 2000 });
            } else {
              setTimeout(loadVarietyDetails, 1000);
            }
          }
        } else {
          console.warn(
            '获取热门综艺失败:',
            varietyShowsData.status === 'rejected'
              ? varietyShowsData.reason
              : '数据格式错误',
          );
        }

        // 处理动漫数据
        if (animeData.status === 'fulfilled' && animeData.value?.code === 200) {
          const animes = animeData.value.list;
          setHotAnime(animes);

          // 性能优化：使用 requestIdleCallback 延迟加载详情
          if (animes.length > 0) {
            const loadAnimeDetails = () => {
              const anime = animes[0];
              getDoubanDetails(anime.id)
                .then((detailsRes) => {
                  if (detailsRes.code === 200 && detailsRes.data) {
                    setHotAnime((prev) =>
                      prev.map((a) =>
                        a.id === anime.id
                          ? {
                              ...a,
                              plot_summary: detailsRes.data!.plot_summary,
                              backdrop: detailsRes.data!.backdrop,
                              trailerUrl: detailsRes.data!.trailerUrl,
                            }
                          : a,
                      ),
                    );
                  }
                })
                .catch((error) => {
                  console.warn(`获取动漫 ${anime.id} 详情失败:`, error);
                });
            };

            if ('requestIdleCallback' in window) {
              requestIdleCallback(loadAnimeDetails, { timeout: 2000 });
            } else {
              setTimeout(loadAnimeDetails, 1000);
            }
          }
        } else {
          console.warn(
            '获取热门动漫失败:',
            animeData.status === 'rejected' ? animeData.reason : '数据格式错误',
          );
        }

        // 处理短剧数据
        if (shortDramasData.status === 'fulfilled') {
          const dramas = shortDramasData.value;
          setHotShortDramas(dramas);

          // 性能优化：使用 requestIdleCallback 延迟加载详情
          const loadDramaDetails = () => {
            Promise.all(
              dramas.slice(0, 2).map(async (drama) => {
                try {
                  const response = await fetch(
                    `/api/shortdrama/detail?id=${drama.id}&episode=1`,
                  );
                  if (response.ok) {
                    const detailData = await response.json();
                    if (detailData.desc) {
                      return { id: drama.id, description: detailData.desc };
                    }
                  }
                } catch (error) {
                  console.warn(`获取短剧 ${drama.id} 详情失败:`, error);
                }
                return null;
              }),
            ).then((results) => {
              setHotShortDramas((prev) =>
                prev.map((d) => {
                  const detail = results.find((r) => r?.id === d.id);
                  return detail ? { ...d, description: detail.description } : d;
                }),
              );
            });
          };

          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadDramaDetails, { timeout: 2000 });
          } else {
            setTimeout(loadDramaDetails, 1000);
          }
        } else {
          console.warn('获取热门短剧失败:', shortDramasData.reason);
          setHotShortDramas([]);
        }

        // 处理bangumi数据，防止接口失败导致页面崩溃
        if (
          bangumiCalendarData.status === 'fulfilled' &&
          Array.isArray(bangumiCalendarData.value)
        ) {
          const bangumiData = bangumiCalendarData.value;
          setBangumiCalendarData(bangumiData);

          // 性能优化：使用 requestIdleCallback 延迟加载详情
          const loadBangumiDetails = async () => {
            const today = new Date();
            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const currentWeekday = weekdays[today.getDay()];
            const todayAnimes =
              bangumiData.find((item) => item.weekday.en === currentWeekday)
                ?.items || [];

            if (todayAnimes.length > 0 && !todayAnimes[0].summary) {
              const anime = todayAnimes[0];
              try {
                const response = await fetch(
                  `/api/proxy/bangumi?path=v0/subjects/${anime.id}`,
                );
                if (response.ok) {
                  const detailData = await response.json();
                  if (detailData.summary) {
                    setBangumiCalendarData((prev) =>
                      prev.map((dayData) => {
                        if (dayData.weekday.en === currentWeekday) {
                          return {
                            ...dayData,
                            items: dayData.items.map((item) =>
                              item.id === anime.id
                                ? { ...item, summary: detailData.summary }
                                : item,
                            ),
                          };
                        }
                        return dayData;
                      }),
                    );
                  }
                }
              } catch (error) {
                console.warn(`获取番剧 ${anime.id} 详情失败:`, error);
              }
            }
          };

          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadBangumiDetails, { timeout: 2000 });
          } else {
            setTimeout(loadBangumiDetails, 1000);
          }
        } else {
          console.warn(
            'Bangumi接口失败或返回数据格式错误:',
            bangumiCalendarData.status === 'rejected'
              ? bangumiCalendarData.reason
              : '数据格式错误',
          );
          setBangumiCalendarData([]);
        }

        // 处理即将上映数据
        if (
          upcomingReleasesData.status === 'fulfilled' &&
          upcomingReleasesData.value?.items
        ) {
          const releases = upcomingReleasesData.value.items;
          console.log('📅 获取到的即将上映数据:', releases.length, '条');

          // 过滤出即将上映和刚上映的作品（过去7天到未来90天）
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const sevenDaysAgo = new Date(today);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const ninetyDaysLater = new Date(today);
          ninetyDaysLater.setDate(ninetyDaysLater.getDate() + 90);

          console.log(
            '📅 7天前日期:',
            sevenDaysAgo.toISOString().split('T')[0],
          );
          console.log('📅 今天日期:', today.toISOString().split('T')[0]);
          console.log(
            '📅 90天后日期:',
            ninetyDaysLater.toISOString().split('T')[0],
          );

          const upcoming = releases.filter((item: ReleaseCalendarItem) => {
            // 修复时区问题：使用字符串比较而不是Date对象比较
            const releaseDateStr = item.releaseDate; // 格式: "2025-11-07"
            const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
            const ninetyDaysStr = ninetyDaysLater.toISOString().split('T')[0];
            const isUpcoming =
              releaseDateStr >= sevenDaysAgoStr &&
              releaseDateStr <= ninetyDaysStr;
            return isUpcoming;
          });

          console.log('📅 日期过滤后的数据:', upcoming.length, '条');
          console.log(
            '📅 过滤后的标题:',
            upcoming.map(
              (i: ReleaseCalendarItem) => `${i.title} (${i.releaseDate})`,
            ),
          );

          // 智能去重：识别同系列内容（如"XX"和"XX第二季"）以及副标题（如"过关斩将：猎杀游戏"和"猎杀游戏"）
          const normalizeTitle = (title: string): string => {
            // 先统一冒号格式
            let normalized = title.replace(/：/g, ':').trim();

            // 处理副标题：如果有冒号，取冒号后的部分（主标题）
            // 例如 "过关斩将:猎杀游戏" -> "猎杀游戏"
            if (normalized.includes(':')) {
              const parts = normalized.split(':').map((p) => p.trim());
              // 取最后一部分作为主标题（通常主标题在冒号后面）
              normalized = parts[parts.length - 1];
            }

            // 再移除季数、集数等后缀和空格
            normalized = normalized
              .replace(/第[一二三四五六七八九十\d]+季/g, '')
              .replace(/[第]?[一二三四五六七八九十\d]+季/g, '')
              .replace(/Season\s*\d+/gi, '')
              .replace(/S\d+/gi, '')
              .replace(/\s+\d+$/g, '') // 移除末尾数字
              .replace(/\s+/g, '') // 移除所有空格
              .trim();

            return normalized;
          };

          // 去重：基于标题去重，保留最早的那条记录
          const uniqueUpcoming = upcoming.reduce(
            (acc: ReleaseCalendarItem[], current: ReleaseCalendarItem) => {
              const normalizedCurrent = normalizeTitle(current.title);

              // 先检查精确匹配
              const exactMatch = acc.find(
                (item) => item.title === current.title,
              );
              if (exactMatch) {
                // 精确匹配：保留上映日期更早的
                const existingIndex = acc.findIndex(
                  (item) => item.title === current.title,
                );
                if (
                  new Date(current.releaseDate) <
                  new Date(exactMatch.releaseDate)
                ) {
                  acc[existingIndex] = current;
                }
                return acc;
              }

              // 再检查归一化后的模糊匹配（识别同系列）
              const similarMatch = acc.find((item) => {
                const normalizedExisting = normalizeTitle(item.title);
                return normalizedCurrent === normalizedExisting;
              });

              if (similarMatch) {
                // 模糊匹配：优先保留没有"第X季"标记的原版
                const existingIndex = acc.findIndex(
                  (item) => normalizeTitle(item.title) === normalizedCurrent,
                );
                const currentHasSeason =
                  /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/i.test(
                    current.title,
                  );
                const existingHasSeason =
                  /第[一二三四五六七八九十\d]+季|Season\s*\d+|S\d+/i.test(
                    similarMatch.title,
                  );

                // 如果当前没有季数标记，而已存在的有，则替换
                if (!currentHasSeason && existingHasSeason) {
                  acc[existingIndex] = current;
                }
                // 如果都有季数标记或都没有，则保留日期更早的
                else if (currentHasSeason === existingHasSeason) {
                  if (
                    new Date(current.releaseDate) <
                    new Date(similarMatch.releaseDate)
                  ) {
                    acc[existingIndex] = current;
                  }
                }
                // 如果当前有季数标记而已存在的没有，则保留已存在的（不替换）
                return acc;
              }

              // 没有匹配，添加新项
              acc.push(current);
              return acc;
            },
            [],
          );

          console.log('📅 去重后的即将上映数据:', uniqueUpcoming.length, '条');

          // 智能分配：按更细的时间段分类，确保时间分散
          const todayStr = today.toISOString().split('T')[0];
          const sevenDaysLaterStr = new Date(
            today.getTime() + 7 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .split('T')[0];
          const thirtyDaysLaterStr = new Date(
            today.getTime() + 30 * 24 * 60 * 60 * 1000,
          )
            .toISOString()
            .split('T')[0];

          // 更细致的时间段划分
          const recentlyReleased = uniqueUpcoming.filter(
            (i: ReleaseCalendarItem) => i.releaseDate < todayStr,
          ); // 已上映
          const releasingToday = uniqueUpcoming.filter(
            (i: ReleaseCalendarItem) => i.releaseDate === todayStr,
          ); // 今日上映
          const nextSevenDays = uniqueUpcoming.filter(
            (i: ReleaseCalendarItem) =>
              i.releaseDate > todayStr && i.releaseDate <= sevenDaysLaterStr,
          ); // 未来7天
          const nextThirtyDays = uniqueUpcoming.filter(
            (i: ReleaseCalendarItem) =>
              i.releaseDate > sevenDaysLaterStr &&
              i.releaseDate <= thirtyDaysLaterStr,
          ); // 8-30天
          const laterReleasing = uniqueUpcoming.filter(
            (i: ReleaseCalendarItem) => i.releaseDate > thirtyDaysLaterStr,
          ); // 30天后

          // 智能分配：总共10个，按时间段分散选取
          const maxTotal = 10;
          let selectedItems: ReleaseCalendarItem[] = [];

          // 配额分配策略：2已上映 + 1今日(限制) + 4近期(7天) + 2中期(30天) + 1远期
          // 今日上映限制最多3个，避免全是今天的
          const maxTodayLimit = 3;
          const recentQuota = Math.min(2, recentlyReleased.length);
          const todayQuota = Math.min(1, releasingToday.length);
          const sevenDayQuota = Math.min(4, nextSevenDays.length);
          const thirtyDayQuota = Math.min(2, nextThirtyDays.length);
          const laterQuota = Math.min(1, laterReleasing.length);

          selectedItems = [
            ...recentlyReleased.slice(0, recentQuota),
            ...releasingToday.slice(0, todayQuota),
            ...nextSevenDays.slice(0, sevenDayQuota),
            ...nextThirtyDays.slice(0, thirtyDayQuota),
            ...laterReleasing.slice(0, laterQuota),
          ];

          // 如果没填满10个，按优先级补充（但限制今日上映总数）
          if (selectedItems.length < maxTotal) {
            const remaining = maxTotal - selectedItems.length;
            const currentTodayCount = selectedItems.filter(
              (i: ReleaseCalendarItem) => i.releaseDate === todayStr,
            ).length;

            // 优先从近期7天补充
            const additionalSeven = nextSevenDays.slice(
              sevenDayQuota,
              sevenDayQuota + remaining,
            );
            selectedItems = [...selectedItems, ...additionalSeven];

            // 还不够就从30天内补充
            if (selectedItems.length < maxTotal) {
              const stillRemaining = maxTotal - selectedItems.length;
              const additionalThirty = nextThirtyDays.slice(
                thirtyDayQuota,
                thirtyDayQuota + stillRemaining,
              );
              selectedItems = [...selectedItems, ...additionalThirty];
            }

            // 还不够就从远期补充
            if (selectedItems.length < maxTotal) {
              const stillRemaining = maxTotal - selectedItems.length;
              const additionalLater = laterReleasing.slice(
                laterQuota,
                laterQuota + stillRemaining,
              );
              selectedItems = [...selectedItems, ...additionalLater];
            }

            // 还不够就从已上映补充
            if (selectedItems.length < maxTotal) {
              const stillRemaining = maxTotal - selectedItems.length;
              const additionalRecent = recentlyReleased.slice(
                recentQuota,
                recentQuota + stillRemaining,
              );
              selectedItems = [...selectedItems, ...additionalRecent];
            }

            // 最后实在不够才从今日上映补充（但限制总数不超过maxTodayLimit）
            if (selectedItems.length < maxTotal) {
              const currentTodayCount = selectedItems.filter(
                (i: ReleaseCalendarItem) => i.releaseDate === todayStr,
              ).length;
              const todayRemaining = maxTodayLimit - currentTodayCount;
              if (todayRemaining > 0) {
                const stillRemaining = Math.min(
                  maxTotal - selectedItems.length,
                  todayRemaining,
                );
                const additionalToday = releasingToday.slice(
                  todayQuota,
                  todayQuota + stillRemaining,
                );
                selectedItems = [...selectedItems, ...additionalToday];
              }
            }
          }

          console.log('📅 分配结果:', {
            已上映: recentlyReleased.length,
            今日上映: releasingToday.length,
            '7天内': nextSevenDays.length,
            '8-30天': nextThirtyDays.length,
            '30天后': laterReleasing.length,
            最终显示: selectedItems.length,
          });

          setUpcomingReleases(selectedItems);
        } else {
          console.warn(
            '获取即将上映数据失败:',
            upcomingReleasesData.status === 'rejected'
              ? upcomingReleasesData.reason
              : '数据格式错误',
          );
          setUpcomingReleases([]);
        }
      } catch (error) {
        console.error('获取推荐数据失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendData();
  }, []);

  // 处理收藏数据更新的函数
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
        const playRecord = allPlayRecords[key];
        const currentEpisode = playRecord?.index;

        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode,
          search_title: fav?.search_title,
          origin: fav?.origin,
          type: fav?.type,
          releaseDate: fav?.releaseDate,
          remarks: fav?.remarks,
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  };

  // 处理清空所有收藏
  const handleClearFavorites = async () => {
    await clearAllFavorites();
    setFavoriteItems([]);
  };

  // 当切换到收藏夹时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      },
    );

    return unsubscribe;
  }, [activeTab]);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      {/* Telegram 新用户欢迎弹窗 */}
      <TelegramWelcomeModal />

      <div className='overflow-visible -mt-6 md:mt-0'>
        {/* 欢迎横幅 - 现代化精简设计 */}
        <div className='mb-6 relative overflow-hidden rounded-xl bg-linear-to-r from-blue-500/90 via-purple-500/90 to-pink-500/90 backdrop-blur-sm shadow-xl border border-white/20'>
          <div className='relative p-4 sm:p-5'>
            {/* 动态渐变背景 */}
            <div className='absolute inset-0 bg-linear-to-br from-white/5 via-transparent to-black/5'></div>

            <div className='relative z-10 flex items-center justify-between gap-4'>
              <div className='flex-1 min-w-0'>
                <h2 className='text-lg sm:text-xl font-bold text-white mb-1 flex items-center gap-2 flex-wrap'>
                  <span>
                    {(() => {
                      const hour = new Date().getHours();
                      if (hour < 12) return '早上好';
                      if (hour < 18) return '下午好';
                      return '晚上好';
                    })()}
                    {username && '，'}
                  </span>
                  {username && (
                    <span className='text-yellow-300 font-semibold'>
                      {username}
                    </span>
                  )}
                  <span className='inline-block animate-wave origin-bottom-right'>
                    👋
                  </span>
                </h2>
                <p className='text-sm text-white/90'>发现更多精彩影视内容 ✨</p>
              </div>

              {/* 装饰图标 - 更小更精致 */}
              <div className='hidden md:flex items-center justify-center shrink-0 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20'>
                <Film className='w-6 h-6 text-white' />
              </div>
            </div>
          </div>
        </div>

        {/* 顶部 Tab 切换 - AI 按钮已移至右上角导航栏 */}
        <div className='mb-8 flex items-center justify-center'>
          <CapsuleSwitch
            options={[
              { label: '首页', value: 'home' },
              { label: '收藏夹', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
        </div>

        <div className='w-full mx-auto'>
          {activeTab === 'favorites' ? (
            // 收藏夹视图
            <section className='mb-8'>
              <div className='mb-6 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  我的收藏
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className='flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-white hover:bg-red-600 dark:text-red-400 dark:hover:text-white dark:hover:bg-red-500 border border-red-300 dark:border-red-700 hover:border-red-600 dark:hover:border-red-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md'
                    onClick={() => {
                      // 根据用户设置决定是否显示确认对话框
                      if (requireClearConfirmation) {
                        setShowClearFavoritesDialog(true);
                      } else {
                        handleClearFavorites();
                      }
                    }}
                  >
                    <Trash2 className='w-4 h-4' />
                    <span>清空收藏</span>
                  </button>
                )}
              </div>

              {/* 统计信息 */}
              {favoriteItems.length > 0 &&
                (() => {
                  const stats = {
                    total: favoriteItems.length,
                    movie: favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'movie';
                      // 向后兼容：没有 type 时用 episodes 判断
                      if (
                        item.source === 'shortdrama' ||
                        item.source_name === '短剧'
                      )
                        return false;
                      if (item.source === 'bangumi') return false; // 排除动漫
                      if (item.origin === 'live') return false; // 排除直播
                      // vod 来源：按集数判断
                      return item.episodes === 1;
                    }).length,
                    tv: favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'tv';
                      // 向后兼容：没有 type 时用 episodes 判断
                      if (
                        item.source === 'shortdrama' ||
                        item.source_name === '短剧'
                      )
                        return false;
                      if (item.source === 'bangumi') return false; // 排除动漫
                      if (item.origin === 'live') return false; // 排除直播
                      // vod 来源：按集数判断
                      return item.episodes > 1;
                    }).length,
                    anime: favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'anime';
                      // 向后兼容：用 source 判断
                      return item.source === 'bangumi';
                    }).length,
                    shortdrama: favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'shortdrama';
                      // 向后兼容：用 source 判断
                      return (
                        item.source === 'shortdrama' ||
                        item.source_name === '短剧'
                      );
                    }).length,
                    live: favoriteItems.filter((item) => item.origin === 'live')
                      .length,
                    variety: favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'variety';
                      // 向后兼容：暂无 fallback
                      return false;
                    }).length,
                  };
                  return (
                    <div className='mb-4 flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400'>
                      <span className='px-3 py-1 bg-gray-100 dark:bg-gray-800 rounded-full'>
                        共{' '}
                        <strong className='text-gray-900 dark:text-gray-100'>
                          {stats.total}
                        </strong>{' '}
                        项
                      </span>
                      {stats.movie > 0 && (
                        <span className='px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full'>
                          电影 {stats.movie}
                        </span>
                      )}
                      {stats.tv > 0 && (
                        <span className='px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full'>
                          剧集 {stats.tv}
                        </span>
                      )}
                      {stats.anime > 0 && (
                        <span className='px-3 py-1 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded-full'>
                          动漫 {stats.anime}
                        </span>
                      )}
                      {stats.shortdrama > 0 && (
                        <span className='px-3 py-1 bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 rounded-full'>
                          短剧 {stats.shortdrama}
                        </span>
                      )}
                      {stats.live > 0 && (
                        <span className='px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-full'>
                          直播 {stats.live}
                        </span>
                      )}
                      {stats.variety > 0 && (
                        <span className='px-3 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded-full'>
                          综艺 {stats.variety}
                        </span>
                      )}
                    </div>
                  );
                })()}

              {/* 筛选标签 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex flex-wrap gap-2'>
                  {[
                    { key: 'all' as const, label: '全部', icon: '📚' },
                    { key: 'movie' as const, label: '电影', icon: '🎬' },
                    { key: 'tv' as const, label: '剧集', icon: '📺' },
                    { key: 'anime' as const, label: '动漫', icon: '🎌' },
                    { key: 'shortdrama' as const, label: '短剧', icon: '🎭' },
                    { key: 'live' as const, label: '直播', icon: '📡' },
                    { key: 'variety' as const, label: '综艺', icon: '🎪' },
                  ].map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setFavoriteFilter(key)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        favoriteFilter === key
                          ? 'bg-linear-to-r from-blue-500 to-purple-500 text-white shadow-lg scale-105'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      <span className='mr-1'>{icon}</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* 排序选项 */}
              {favoriteItems.length > 0 && (
                <div className='mb-4 flex items-center gap-2 text-sm'>
                  <span className='text-gray-600 dark:text-gray-400'>
                    排序：
                  </span>
                  <div className='flex gap-2'>
                    {[
                      { key: 'recent' as const, label: '最近添加' },
                      { key: 'title' as const, label: '标题 A-Z' },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setFavoriteSortBy(key)}
                        className={`px-3 py-1 rounded-md transition-colors ${
                          favoriteSortBy === key
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {(() => {
                  // 筛选
                  let filtered = favoriteItems;
                  if (favoriteFilter === 'movie') {
                    filtered = favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'movie';
                      // 向后兼容：没有 type 时用 episodes 判断
                      if (
                        item.source === 'shortdrama' ||
                        item.source_name === '短剧'
                      )
                        return false;
                      if (item.source === 'bangumi') return false; // 排除动漫
                      if (item.origin === 'live') return false; // 排除直播
                      // vod 来源：按集数判断
                      return item.episodes === 1;
                    });
                  } else if (favoriteFilter === 'tv') {
                    filtered = favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'tv';
                      // 向后兼容：没有 type 时用 episodes 判断
                      if (
                        item.source === 'shortdrama' ||
                        item.source_name === '短剧'
                      )
                        return false;
                      if (item.source === 'bangumi') return false; // 排除动漫
                      if (item.origin === 'live') return false; // 排除直播
                      // vod 来源：按集数判断
                      return item.episodes > 1;
                    });
                  } else if (favoriteFilter === 'anime') {
                    filtered = favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'anime';
                      // 向后兼容：用 source 判断
                      return item.source === 'bangumi';
                    });
                  } else if (favoriteFilter === 'shortdrama') {
                    filtered = favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'shortdrama';
                      // 向后兼容：用 source 判断
                      return (
                        item.source === 'shortdrama' ||
                        item.source_name === '短剧'
                      );
                    });
                  } else if (favoriteFilter === 'live') {
                    filtered = favoriteItems.filter(
                      (item) => item.origin === 'live',
                    );
                  } else if (favoriteFilter === 'variety') {
                    filtered = favoriteItems.filter((item) => {
                      // 优先用 type 字段判断
                      if (item.type) return item.type === 'variety';
                      // 向后兼容：暂无 fallback
                      return false;
                    });
                  }

                  // 排序
                  if (favoriteSortBy === 'title') {
                    filtered = [...filtered].sort((a, b) =>
                      a.title.localeCompare(b.title, 'zh-CN'),
                    );
                  }
                  // 'recent' 已经在 updateFavoriteItems 中按 save_time 排序了

                  return filtered.map((item) => {
                    // 智能计算即将上映状态
                    let calculatedRemarks = item.remarks;

                    if (item.releaseDate) {
                      const now = new Date();
                      now.setHours(0, 0, 0, 0); // 归零时间，只比较日期
                      const releaseDate = new Date(item.releaseDate);
                      const daysDiff = Math.ceil(
                        (releaseDate.getTime() - now.getTime()) /
                          (1000 * 60 * 60 * 24),
                      );

                      // 根据天数差异动态更新显示文字
                      if (daysDiff < 0) {
                        const daysAgo = Math.abs(daysDiff);
                        calculatedRemarks = `已上映${daysAgo}天`;
                      } else if (daysDiff === 0) {
                        calculatedRemarks = '今日上映';
                      } else {
                        calculatedRemarks = `${daysDiff}天后上映`;
                      }
                    }

                    return (
                      <div key={item.id + item.source} className='w-full'>
                        <VideoCard
                          query={item.search_title}
                          {...item}
                          from='favorite'
                          remarks={calculatedRemarks}
                        />
                      </div>
                    );
                  });
                })()}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full flex flex-col items-center justify-center py-16 px-4'>
                    {/* SVG 插画 - 空收藏夹 */}
                    <div className='mb-6 relative'>
                      <div className='absolute inset-0 bg-linear-to-r from-pink-300 to-purple-300 dark:from-pink-600 dark:to-purple-600 opacity-20 blur-3xl rounded-full animate-pulse'></div>
                      <svg
                        className='w-32 h-32 relative z-10'
                        viewBox='0 0 200 200'
                        fill='none'
                        xmlns='http://www.w3.org/2000/svg'
                      >
                        {/* 心形主体 */}
                        <path
                          d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                          className='fill-gray-300 dark:fill-gray-600 stroke-gray-400 dark:stroke-gray-500 transition-colors duration-300'
                          strokeWidth='3'
                        />
                        {/* 虚线边框 */}
                        <path
                          d='M100 170C100 170 30 130 30 80C30 50 50 30 70 30C85 30 95 40 100 50C105 40 115 30 130 30C150 30 170 50 170 80C170 130 100 170 100 170Z'
                          fill='none'
                          stroke='currentColor'
                          strokeWidth='2'
                          strokeDasharray='5,5'
                          className='text-gray-400 dark:text-gray-500'
                        />
                      </svg>
                    </div>

                    {/* 文字提示 */}
                    <h3 className='text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2'>
                      收藏夹空空如也
                    </h3>
                    <p className='text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs'>
                      快去发现喜欢的影视作品，点击 ❤️ 添加到收藏吧！
                    </p>
                  </div>
                )}
              </div>

              {/* 确认对话框 */}
              <ConfirmDialog
                isOpen={showClearFavoritesDialog}
                title='确认清空收藏'
                message={`确定要清空所有收藏吗？\n\n这将删除 ${favoriteItems.length} 项收藏，此操作无法撤销。`}
                confirmText='确认清空'
                cancelText='取消'
                variant='danger'
                onConfirm={handleClearFavorites}
                onCancel={() => setShowClearFavoritesDialog(false)}
              />
            </section>
          ) : (
            // 首页视图
            <>
              {/* Hero Banner 轮播 - 🔥 根据配置显示 */}
              {enableHeroBanner &&
                !loading &&
                (hotMovies.length > 0 ||
                  hotTvShows.length > 0 ||
                  hotVarietyShows.length > 0 ||
                  hotShortDramas.length > 0) && (
                  <section className='mb-8'>
                    <HeroBanner
                      items={[
                        // 豆瓣电影
                        ...hotMovies.slice(0, 2).map((movie) => ({
                          id: movie.id,
                          title: movie.title,
                          poster: movie.poster,
                          backdrop: movie.backdrop,
                          trailerUrl: movie.trailerUrl,
                          description: movie.plot_summary,
                          year: movie.year,
                          rate: movie.rate,
                          douban_id: Number(movie.id),
                          type: 'movie',
                        })),
                        // 豆瓣电视剧
                        ...hotTvShows.slice(0, 2).map((show) => ({
                          id: show.id,
                          title: show.title,
                          poster: show.poster,
                          backdrop: show.backdrop,
                          trailerUrl: show.trailerUrl,
                          description: show.plot_summary,
                          year: show.year,
                          rate: show.rate,
                          douban_id: Number(show.id),
                          type: 'tv',
                        })),
                        // 豆瓣综艺
                        ...hotVarietyShows.slice(0, 1).map((show) => ({
                          id: show.id,
                          title: show.title,
                          poster: show.poster,
                          backdrop: show.backdrop,
                          trailerUrl: show.trailerUrl,
                          description: show.plot_summary,
                          year: show.year,
                          rate: show.rate,
                          douban_id: Number(show.id),
                          type: 'variety',
                        })),
                        // 豆瓣动漫
                        ...hotAnime.slice(0, 1).map((anime) => ({
                          id: anime.id,
                          title: anime.title,
                          poster: anime.poster,
                          backdrop: anime.backdrop,
                          trailerUrl: anime.trailerUrl,
                          description: anime.plot_summary,
                          year: anime.year,
                          rate: anime.rate,
                          douban_id: Number(anime.id),
                          type: 'anime',
                        })),
                      ]}
                      autoPlayInterval={8000}
                      showControls={true}
                      showIndicators={true}
                      enableVideo={true}
                    />
                  </section>
                )}

              {/* 继续观看 */}
              <ContinueWatching />

              {/* 即将上映 */}
              {(() => {
                console.log('🔍 即将上映 section 渲染检查:', {
                  loading,
                  upcomingReleasesCount: upcomingReleases.length,
                });
                return null;
              })()}
              {!loading && upcomingReleases.length > 0 && (
                <section className='mb-8'>
                  <div className='mb-4 flex items-center justify-between'>
                    <SectionTitle
                      title='即将上映'
                      icon={Calendar}
                      iconColor='text-orange-500'
                    />
                    <Link
                      href='/release-calendar'
                      className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                    >
                      查看更多
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>

                  {/* Tab 切换 */}
                  <div className='mb-4 flex gap-2'>
                    {[
                      {
                        key: 'all',
                        label: '全部',
                        count: upcomingReleases.length,
                      },
                      {
                        key: 'movie',
                        label: '电影',
                        count: upcomingReleases.filter(
                          (r) => r.type === 'movie',
                        ).length,
                      },
                      {
                        key: 'tv',
                        label: '电视剧',
                        count: upcomingReleases.filter((r) => r.type === 'tv')
                          .length,
                      },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() =>
                          setUpcomingFilter(key as 'all' | 'movie' | 'tv')
                        }
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          upcomingFilter === key
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        {label}
                        {count > 0 && (
                          <span
                            className={`ml-1.5 text-xs ${
                              upcomingFilter === key
                                ? 'text-white/80'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            ({count})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  <ScrollableRow enableVirtualization={true}>
                    {upcomingReleases
                      .filter(
                        (release) =>
                          upcomingFilter === 'all' ||
                          release.type === upcomingFilter,
                      )
                      .map((release, index) => {
                        // 计算距离上映还有几天
                        const now = new Date();
                        now.setHours(0, 0, 0, 0); // 归零时间，只比较日期
                        const releaseDate = new Date(release.releaseDate);
                        const daysDiff = Math.ceil(
                          (releaseDate.getTime() - now.getTime()) /
                            (1000 * 60 * 60 * 24),
                        );

                        // 根据天数差异显示不同文字
                        let remarksText;
                        if (daysDiff < 0) {
                          remarksText = `已上映${Math.abs(daysDiff)}天`;
                        } else if (daysDiff === 0) {
                          remarksText = '今日上映';
                        } else {
                          remarksText = `${daysDiff}天后上映`;
                        }

                        return (
                          <div
                            key={`${release.id}-${index}`}
                            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                          >
                            <VideoCard
                              source='upcoming_release'
                              id={release.id}
                              source_name='即将上映'
                              from='douban'
                              title={release.title}
                              poster={
                                release.cover || '/placeholder-poster.jpg'
                              }
                              year={release.releaseDate.split('-')[0]}
                              type={release.type}
                              remarks={remarksText}
                              releaseDate={release.releaseDate}
                              query={release.title}
                              episodes={
                                release.episodes ||
                                (release.type === 'tv' ? undefined : 1)
                              }
                            />
                          </div>
                        );
                      })}
                  </ScrollableRow>
                </section>
              )}

              {/* 热门电影 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门电影'
                    icon={Film}
                    iconColor='text-red-500'
                  />
                  <Link
                    href='/douban?type=movie'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotMovies.map((movie, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={movie.id}
                            source_name='豆瓣'
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={Number(movie.id)}
                            rate={movie.rate}
                            year={movie.year}
                            type='movie'
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门剧集 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门剧集'
                    icon={Tv}
                    iconColor='text-blue-500'
                  />
                  <Link
                    href='/douban?type=tv'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotTvShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={show.id}
                            source_name='豆瓣'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            type='tv'
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 每日新番放送 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='新番放送'
                    icon={Calendar}
                    iconColor='text-purple-500'
                  />
                  <Link
                    href='/douban?type=anime'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 展示当前日期的番剧
                      (() => {
                        // 获取当前日期对应的星期
                        const today = new Date();
                        const weekdays = [
                          'Sun',
                          'Mon',
                          'Tue',
                          'Wed',
                          'Thu',
                          'Fri',
                          'Sat',
                        ];
                        const currentWeekday = weekdays[today.getDay()];

                        // 找到当前星期对应的番剧数据
                        const todayAnimes =
                          bangumiCalendarData.find(
                            (item) => item.weekday.en === currentWeekday,
                          )?.items || [];

                        return todayAnimes.map((anime, index) => (
                          <div
                            key={`${anime.id}-${index}`}
                            className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                          >
                            <VideoCard
                              from='douban'
                              source='bangumi'
                              id={anime.id.toString()}
                              source_name='Bangumi'
                              title={anime.name_cn || anime.name}
                              poster={
                                anime.images?.large ||
                                anime.images?.common ||
                                anime.images?.medium ||
                                anime.images?.small ||
                                anime.images?.grid ||
                                '/placeholder-poster.jpg'
                              }
                              douban_id={anime.id}
                              rate={anime.rating?.score?.toFixed(1) || ''}
                              year={anime.air_date?.split('-')?.[0] || ''}
                              isBangumi={true}
                            />
                          </div>
                        ));
                      })()}
                </ScrollableRow>
              </section>

              {/* 热门综艺 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门综艺'
                    icon={Sparkles}
                    iconColor='text-pink-500'
                  />
                  <Link
                    href='/douban?type=show'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotVarietyShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            source='douban'
                            id={show.id}
                            source_name='豆瓣'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                            type='variety'
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 热门短剧 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <SectionTitle
                    title='热门短剧'
                    icon={Play}
                    iconColor='text-orange-500'
                  />
                  <Link
                    href='/shortdrama'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors'
                  >
                    查看更多
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow enableVirtualization={true}>
                  {loading
                    ? // 加载状态显示灰色占位数据
                      Array.from({ length: 8 }).map((_, index) => (
                        <SkeletonCard key={index} />
                      ))
                    : // 显示真实数据
                      hotShortDramas.map((drama, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <ShortDramaCard drama={drama} />
                        </div>
                      ))}
                </ScrollableRow>
              </section>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
          onTouchStart={(e) => {
            // 如果点击的是背景区域，阻止触摸事件冒泡，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            // 如果触摸的是背景区域，阻止触摸移动，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            // 如果触摸的是背景区域，阻止触摸结束事件，防止背景滚动
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          style={{
            touchAction: 'none', // 禁用所有触摸操作
          }}
        >
          <div
            className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
            onTouchMove={(e) => {
              // 允许公告内容区域正常滚动，阻止事件冒泡到外层
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto', // 允许内容区域的正常触摸操作
            }}
          >
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                提示
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label='关闭'
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-linear-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
