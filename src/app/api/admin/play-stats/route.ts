/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { PlayRecord } from '@/lib/types';

// 导出类型供页面组件使用
export type { PlayStatsResult } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行播放统计查看',
      },
      { status: 400 }
    );
  }

  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await getConfig();
    const storage = db;
    const username = authInfo.username;

    // 判定操作者角色
    let _operatorRole: 'owner' | 'admin';
    if (username === process.env.USERNAME) {
      _operatorRole = 'owner';
    } else {
      const userEntry = config.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
      _operatorRole = 'admin';
    }

    // 🔥 性能优化：添加缓存机制
    const CACHE_KEY = 'lunatv:play-stats:admin';
    const CACHE_TTL = 300; // 5分钟缓存

    // 尝试从Redis缓存读取（仅当使用Redis存储时）
    try {
      // 检查底层storage是否支持get方法（Redis存储才有）
      const underlyingStorage = (storage as any).storage;
      if (underlyingStorage && typeof underlyingStorage.get === 'function') {
        const cached = await underlyingStorage.get(CACHE_KEY);
        if (cached) {
          console.log('📊 [PlayStats] 从缓存返回数据');
          const cachedData = JSON.parse(cached as string);
          return NextResponse.json(cachedData, {
            headers: {
              'Cache-Control': `public, max-age=${CACHE_TTL}`,
              'X-Cache': 'HIT',
              'X-Cache-Age': String(Math.floor((Date.now() - (cachedData._cacheTime || Date.now())) / 1000))
            }
          });
        }
      }
    } catch (cacheError) {
      console.warn('📊 [PlayStats] 缓存读取失败，将重新计算:', cacheError);
    }

    console.log('📊 [PlayStats] 缓存未命中，开始计算统计数据...');
    const calculationStartTime = Date.now();

    // 使用LunaTV-stat相同的方式：直接在API路由中实现统计逻辑，从config获取用户列表
    const allUsers = config.UserConfig.Users;
    const userStats: Array<{
      username: string;
      totalWatchTime: number;
      totalPlays: number;
      lastPlayTime: number;
      recentRecords: PlayRecord[];
      avgWatchTime: number;
      mostWatchedSource: string;
      registrationDays: number;
      lastLoginTime: number;
      loginCount: number;
      createdAt: number;
    }> = [];
    let totalWatchTime = 0;
    let totalPlays = 0;
    const sourceCount: Record<string, number> = {};
    const dailyData: Record<string, { watchTime: number; plays: number }> = {};

    // 用户注册统计
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let todayNewUsers = 0;
    let totalRegisteredUsers = 0;
    const registrationData: Record<string, number> = {};

    // 计算近7天的日期范围
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 🔥 性能优化：并行查询所有用户的播放记录（替代串行循环）
    console.log(`📊 [PlayStats] 开始并行查询 ${allUsers.length} 个用户的播放记录...`);
    
    const userStatsPromises = allUsers.map(async (user) => {
      try {
        // 计算用户注册相关统计
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        const userCreatedAt = user.createdAt || PROJECT_START_DATE;

        const firstDate = new Date(userCreatedAt);
        const currentDate = new Date();
        const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
        const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const registrationDays = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // 统计今日新增用户
        if (userCreatedAt >= todayStart) {
          todayNewUsers++;
        }
        totalRegisteredUsers++;

        // 统计注册时间分布（近7天）
        if (userCreatedAt >= sevenDaysAgo.getTime()) {
          const regDate = new Date(userCreatedAt).toISOString().split('T')[0];
          registrationData[regDate] = (registrationData[regDate] || 0) + 1;
        }

        // 获取用户最后登录时间和登入次数
        let lastLoginTime = 0;
        let loginCount = 0;
        try {
          const userPlayStat = await storage.getUserPlayStat(user.username);
          lastLoginTime = userPlayStat.lastLoginTime || userPlayStat.lastLoginDate || userPlayStat.firstLoginTime || 0;
          loginCount = userPlayStat.loginCount || 0;
        } catch (err) {
          lastLoginTime = 0;
          loginCount = 0;
        }

        // 获取用户的所有播放记录
        const userPlayRecords = await storage.getAllPlayRecords(user.username);
        const records = Object.values(userPlayRecords);

        if (records.length === 0) {
          return {
            username: user.username,
            totalWatchTime: 0,
            totalPlays: 0,
            lastPlayTime: 0,
            recentRecords: [],
            avgWatchTime: 0,
            mostWatchedSource: '',
            registrationDays,
            lastLoginTime,
            loginCount,
            createdAt: userCreatedAt,
          };
        }

        // 计算用户统计
        let userWatchTime = 0;
        let userLastPlayTime = 0;
        const userSourceCount: Record<string, number> = {};

        records.forEach((record) => {
          userWatchTime += record.play_time || 0;
          if (record.save_time > userLastPlayTime) {
            userLastPlayTime = record.save_time;
          }

          const sourceName = record.source_name || '未知来源';
          userSourceCount[sourceName] = (userSourceCount[sourceName] || 0) + 1;

          // 统计近7天数据
          const recordDate = new Date(record.save_time);
          if (recordDate >= sevenDaysAgo) {
            const dateKey = recordDate.toISOString().split('T')[0];
            if (!dailyData[dateKey]) {
              dailyData[dateKey] = { watchTime: 0, plays: 0 };
            }
            dailyData[dateKey].watchTime += record.play_time || 0;
            dailyData[dateKey].plays += 1;
          }
        });

        // 获取最近播放记录
        const recentRecords = records
          .sort((a, b) => (b.save_time || 0) - (a.save_time || 0))
          .slice(0, 10);

        // 找出最常观看的来源
        let mostWatchedSource = '';
        let maxCount = 0;
        for (const [source, count] of Object.entries(userSourceCount)) {
          if (count > maxCount) {
            maxCount = count;
            mostWatchedSource = source;
          }
          // 更新全局来源统计
          sourceCount[source] = (sourceCount[source] || 0) + count;
        }

        return {
          username: user.username,
          totalWatchTime: userWatchTime,
          totalPlays: records.length,
          lastPlayTime: userLastPlayTime,
          recentRecords,
          avgWatchTime: records.length > 0 ? userWatchTime / records.length : 0,
          mostWatchedSource,
          registrationDays,
          lastLoginTime: lastLoginTime || userCreatedAt,
          loginCount,
          createdAt: userCreatedAt,
        };
      } catch (error) {
        // 单个用户查询失败，返回空统计
        const PROJECT_START_DATE = new Date('2025-09-14').getTime();
        const userCreatedAt = user.createdAt || PROJECT_START_DATE;
        const firstDate = new Date(userCreatedAt);
        const currentDate = new Date();
        const firstDay = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate());
        const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const registrationDays = Math.floor((currentDay.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        return {
          username: user.username,
          totalWatchTime: 0,
          totalPlays: 0,
          lastPlayTime: 0,
          recentRecords: [],
          avgWatchTime: 0,
          mostWatchedSource: '',
          registrationDays,
          lastLoginTime: userCreatedAt,
          loginCount: 0,
          createdAt: userCreatedAt,
        };
      }
    });

    // 🔥 并行执行所有查询
    const userStatsResults = await Promise.all(userStatsPromises);
    
    // 累计全站统计
    userStatsResults.forEach(userStat => {
      userStats.push(userStat);
      totalWatchTime += userStat.totalWatchTime;
      totalPlays += userStat.totalPlays;
    });

    console.log(`📊 [PlayStats] 并行查询完成，共处理 ${userStatsResults.length} 个用户`);

    // 按观看时间降序排序
    userStats.sort((a, b) => b.totalWatchTime - a.totalWatchTime);

    // 整理热门来源数据（取前5个）
    const topSources = Object.entries(sourceCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([source, count]) => ({ source, count }));

    // 整理近7天数据
    const dailyStats: Array<{ date: string; watchTime: number; plays: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const data = dailyData[dateKey] || { watchTime: 0, plays: 0 };
      dailyStats.push({
        date: dateKey,
        watchTime: data.watchTime,
        plays: data.plays,
      });
    }

    // 整理近7天注册数据
    const registrationStats: Array<{ date: string; newUsers: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const newUsers = registrationData[dateKey] || 0;
      registrationStats.push({
        date: dateKey,
        newUsers,
      });
    }

    // 计算活跃用户统计
    const oneDayAgo = now.getTime() - 24 * 60 * 60 * 1000;
    const sevenDaysAgoTime = sevenDaysAgo.getTime();
    const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    const activeUsers = {
      daily: userStats.filter(user => user.lastLoginTime >= oneDayAgo).length,
      weekly: userStats.filter(user => user.lastLoginTime >= sevenDaysAgoTime).length,
      monthly: userStats.filter(user => user.lastLoginTime >= thirtyDaysAgo).length,
    };

    const result = {
      totalUsers: allUsers.length,
      totalWatchTime,
      totalPlays,
      avgWatchTimePerUser: allUsers.length > 0 ? totalWatchTime / allUsers.length : 0,
      avgPlaysPerUser: allUsers.length > 0 ? totalPlays / allUsers.length : 0,
      userStats,
      topSources,
      dailyStats,
      // 新增的注册和活跃度统计
      registrationStats: {
        todayNewUsers,
        totalRegisteredUsers,
        registrationTrend: registrationStats,
      },
      activeUsers,
    };

    // 🔥 性能优化：存入缓存（仅当使用Redis存储时）
    try {
      const underlyingStorage = (storage as any).storage;
      if (underlyingStorage && typeof underlyingStorage.set === 'function') {
        const dataToCache = {
          ...result,
          _cacheTime: Date.now() // 记录缓存时间
        };
        await underlyingStorage.set(CACHE_KEY, JSON.stringify(dataToCache), 'EX', CACHE_TTL);
        const calculationTime = Date.now() - calculationStartTime;
        console.log(`📊 [PlayStats] 统计计算完成，耗时 ${calculationTime}ms，已缓存 ${CACHE_TTL}秒`);
      }
    } catch (cacheError) {
      console.error('📊 [PlayStats] 缓存存储失败:', cacheError);
      // 缓存失败不影响结果返回
    }

    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': 'MISS',
        'X-Calculation-Time': String(Date.now() - calculationStartTime)
      }
    });
  } catch (error) {
    // console.error('获取播放统计失败:', error);
    return NextResponse.json(
      {
        error: '获取播放统计失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}