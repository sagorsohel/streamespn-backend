const axios = require('axios');
const { pool } = require('../db');

const PROD_API_BASE = process.env.PROD_API_URL || 'https://backendapi.streamespn.org/api';
const ADMIN_CREDENTIALS = {
  email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
  password: process.env.ADMIN_PASSWORD || 'sohoj@sohoj',
};

// Tournament ID references
const PROD_CATEGORY_ID = 7; // Tennis in Prod
const PROD_SUBCATEGORY_ID = 1310; // China Open in Prod
const LOCAL_CATEGORY_ID = 4; // Tennis in Local DB
const LOCAL_SUBCATEGORY_ID = 705; // China Open in Local DB

// High-resolution cutouts and images cache for known tennis players
const PLAYER_ASSET_CACHE = {
  'ekaterina alexandrova': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/uof9c51716793254.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/3wdjdn1675264812.jpg',
  },
  'diana shnaider': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/r0ms0y1713778928.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/nx41ik1713778891.jpg',
  },
  'polina kudermetova': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/g245gj1750673050.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/1gom6t1750673015.jpg',
  },
  'mirra andreeva': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/oua7n51748967536.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/f1ip4o1771243237.jpg',
  },
  'sinja kraus': {
    cutout: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Kraus_RGQ23.jpg/330px-Kraus_RGQ23.jpg',
    thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Kraus_RGQ23.jpg/330px-Kraus_RGQ23.jpg',
  },
  'dayana yastremska': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/346dt71709280570.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/6rx5zp1709288953.jpg',
  },
  'nikola bartunkova': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/dgu9vf1774776063.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/3c05dx1718374397.jpg',
  },
  'aryna sabalenka': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/4knki51748965857.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/mu2jmr1709317696.jpg',
  },
  'linda noskova': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/7ikpmb1716788733.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/fkd0lb1771243528.jpg',
  },
  'viktorija golubic': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/4vfk561760957368.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/8ge9451760957332.jpg',
  },
  'daria snigur': {
    cutout: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg/330px-Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg',
    thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg/330px-Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg',
  },
  'taylah preston': {
    cutout: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Taylah_Preston_%282024_DC_Open%29_02.jpg/330px-Taylah_Preston_%282024_DC_Open%29_02.jpg',
    thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Taylah_Preston_%282024_DC_Open%29_02.jpg/330px-Taylah_Preston_%282024_DC_Open%29_02.jpg',
  },
  'sara bejlek': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/l9gtpn1776070471.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/14huh91776070435.jpg',
  },
  'naomi osaka': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/4njchy1716751197.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/hhrmya1771243897.jpg',
  },
  'karolina muchova': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/2lsmsc1758657759.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/ioj74g1758657733.jpg',
  },
  'liudmila samsonova': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/w7dqr61716791632.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/0mfy1e1675265352.jpg',
  },
  'hubert hurkacz': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/b7okgh1674812969.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/hvgbuu1674812936.jpg',
  },
  'karen khachanov': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/fq4vn81674813360.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/ssew9g1674813307.jpg',
  },
  'alex de minaur': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/ec7ymd1675267811.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/ymwt421674814502.jpg',
  },
  'andrey rublev': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/jp6sam1675268673.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/q8gscs1674816699.jpg',
  },
  'daniil medvedev': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/bk4gah1675267907.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/hlhsx01674816220.jpg',
  },
  'francisco cerundolo': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/x393x11675355650.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/6mxjdf1675355594.jpg',
  },
  'alexander zverev': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/c8fy2l1748969907.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/6qkj3m1674815724.jpg',
  },
  'novak djokovic': {
    cutout: 'https://r2.thesportsdb.com/images/media/player/cutout/h6od2i1748970226.png',
    thumb: 'https://r2.thesportsdb.com/images/media/player/thumb/wvrxm31709318210.jpg',
  },
};

const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const resolvePlayerAsset = (displayName, athleteFlag) => {
  if (!displayName) return { cutout: athleteFlag || null, thumb: null };
  const lower = displayName.toLowerCase().trim();
  const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (PLAYER_ASSET_CACHE[lower]) return PLAYER_ASSET_CACHE[lower];
  if (PLAYER_ASSET_CACHE[normalized]) return PLAYER_ASSET_CACHE[normalized];

  for (const [key, val] of Object.entries(PLAYER_ASSET_CACHE)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }

  return {
    cutout: athleteFlag || 'https://r2.thesportsdb.com/images/media/league/badge/x16ihc1546113079.png',
    thumb: 'https://www.thesportsdb.com/images/sports/tennis.jpg',
  };
};

const normalizeLastName = (name) => {
  if (!name) return '';
  const clean = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1].replace(/[^\w]/g, '');
};

/**
 * Generate a symmetric match pair key for deduplication
 * e.g. "L. Noskova vs Viktorija Golubic" and "Viktorija Golubic vs Linda Noskova" => "golubic___noskova"
 */
const makeMatchKey = (name1, name2) => {
  const l1 = normalizeLastName(name1);
  const l2 = normalizeLastName(name2);
  return [l1, l2].sort().join('___');
};

let isChinaOpenSyncing = false;

const syncChinaOpenMatchesCore = async () => {
  if (isChinaOpenSyncing) {
    console.log('⏳ [CHINA OPEN SYNC] Sync is currently in progress, skipping duplicate call.');
    return { skipped: true };
  }
  isChinaOpenSyncing = true;

  console.log(`\n🎾 [CHINA OPEN SYNC] Starting scheduled update at ${new Date().toISOString()}...`);

  try {
    // 1. Fetch real-time feeds from ATP and WTA live scoreboards
    const [atpRes, wtaRes] = await Promise.all([
      axios.get('https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard', { timeout: 10000 }).catch(() => null),
      axios.get('https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard', { timeout: 10000 }).catch(() => null),
    ]);

    const feeds = [atpRes?.data, wtaRes?.data].filter(Boolean);
    const competitionsMap = new Map();

    // 2. Identify China Open events and gather competitions
    feeds.forEach((feed) => {
      const chinaOpenEvent = feed.events?.find((e) => (e.name || '').toLowerCase().includes('china open'));
      if (chinaOpenEvent && Array.isArray(chinaOpenEvent.groupings)) {
        chinaOpenEvent.groupings.forEach((g) => {
          const groupName = g.grouping?.displayName || 'Singles';
          (g.competitions || []).forEach((c) => {
            if (c.id && !competitionsMap.has(c.id)) {
              competitionsMap.set(c.id, { groupName, competition: c });
            }
          });
        });
      }
    });

    const allCompetitions = Array.from(competitionsMap.values());

    // 3. Filter competitions within window: Yesterday, Today, Tomorrow
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayStr = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    const tomorrowStr = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const activeDates = new Set([yesterdayStr, todayStr, tomorrowStr]);

    const activeCompetitions = allCompetitions.filter((item) => {
      const c = item.competition;
      const matchDateStr = (c.date || c.startDate || '').slice(0, 10);
      const isLive = c.status?.type?.state === 'in';
      return activeDates.has(matchDateStr) || isLive;
    });

    // 4. Map and deduplicate matches
    const parsedMatches = [];
    const seenMatchKeys = new Set();
    let orderCounter = 1;

    for (const item of activeCompetitions) {
      const c = item.competition;
      const comp1 = c.competitors?.[0];
      const comp2 = c.competitors?.[1];
      const p1 = comp1?.athlete;
      const p2 = comp2?.athlete;

      if (!p1?.displayName || !p2?.displayName) continue;

      const full1 = p1.displayName.trim();
      const full2 = p2.displayName.trim();

      // Skip unassigned / TBD matches
      if (
        full1.toLowerCase() === 'tbd' ||
        full2.toLowerCase() === 'tbd' ||
        full1.toLowerCase() === 'undefined' ||
        full2.toLowerCase() === 'undefined'
      ) {
        continue;
      }

      const matchKey = makeMatchKey(full1, full2);
      if (seenMatchKeys.has(matchKey)) continue;
      seenMatchKeys.add(matchKey);

      const name1 = p1.shortName || full1;
      const name2 = p2.shortName || full2;

      const matchDateStr = (c.date || c.startDate || now.toISOString()).slice(0, 10);
      const slug = `china-open-${slugify(name1)}-vs-${slugify(name2)}-${matchDateStr}`;

      // Status resolution
      let status = 'upcoming';
      if (c.status?.type?.state === 'in' || c.status?.type?.name === 'STATUS_IN_PROGRESS') {
        status = 'live';
      } else if (c.status?.type?.state === 'post' || c.status?.type?.completed || c.status?.type?.name === 'STATUS_FINAL') {
        status = 'finished';
      }

      // Sets & Linescores
      const line1 = comp1?.linescores?.map((l) => l.value) || [];
      const line2 = comp2?.linescores?.map((l) => l.value) || [];
      const setsWon1 = comp1?.linescores?.filter((l) => l.winner)?.length || 0;
      const setsWon2 = comp2?.linescores?.filter((l) => l.winner)?.length || 0;

      let scoreDetail = '';
      if (line1.length > 0 && line2.length > 0) {
        const parts = [];
        for (let i = 0; i < Math.max(line1.length, line2.length); i++) {
          if (line1[i] !== undefined && line2[i] !== undefined) {
            parts.push(`${line1[i]}-${line2[i]}`);
          }
        }
        scoreDetail = `(${parts.join(', ')})`;
      }

      let liveMinute = 'Scheduled';
      if (status === 'live') {
        liveMinute = c.status?.type?.detail || 'In Progress';
      } else if (status === 'finished') {
        liveMinute = scoreDetail ? `Final ${scoreDetail}` : 'Final';
      }

      const courtName = c.venue?.court || '';
      const roundName = c.round?.displayName || '';
      const livePeriod = [roundName, courtName].filter(Boolean).join(' · ');
      const venueStr = courtName ? `${courtName}, National Tennis Center, Beijing` : (c.venue?.fullName || 'Beijing, China');

      const asset1 = resolvePlayerAsset(full1, p1.flag?.href);
      const asset2 = resolvePlayerAsset(full2, p2.flag?.href);

      parsedMatches.push({
        title: `China Open: ${full1} vs ${full2}`,
        slug,
        matchKey,
        homeTeam: name1,
        homeTeamLogo: asset1.cutout,
        awayTeam: name2,
        awayTeamLogo: asset2.cutout,
        homeScore: status === 'upcoming' ? null : String(setsWon1),
        awayScore: status === 'upcoming' ? null : String(setsWon2),
        livePeriod: livePeriod || 'China Open',
        liveMinute,
        matchTime: c.date || c.startDate || new Date().toISOString(),
        status,
        venue: venueStr,
        playerImage: asset1.thumb || asset2.thumb || 'https://www.thesportsdb.com/images/sports/tennis.jpg',
        bgImage: asset2.thumb || asset1.thumb || 'https://www.thesportsdb.com/images/sports/tennis.jpg',
        displayOrder: orderCounter++,
      });
    }

    console.log(`📊 [CHINA OPEN SYNC] Extracted ${parsedMatches.length} valid matches for synchronization.`);

    // 5. Update Local Database
    try {
      await pool.query(
        `UPDATE sports_subcategories SET status = 1, show_on_home = 1, is_trending = 1 WHERE id = ?`,
        [LOCAL_SUBCATEGORY_ID]
      );

      const [existingLocalRows] = await pool.query('SELECT id, slug, home_team, away_team FROM matches WHERE subcategory_id = ?', [LOCAL_SUBCATEGORY_ID]);
      const localMatchMap = new Map();
      existingLocalRows.forEach((r) => {
        const key = makeMatchKey(r.home_team, r.away_team);
        localMatchMap.set(key, r);
        if (r.slug) localMatchMap.set(r.slug, r);
      });

      for (const match of parsedMatches) {
        const existing = localMatchMap.get(match.matchKey) || localMatchMap.get(match.slug);
        if (existing) {
          await pool.query(
            `UPDATE matches SET
              title = ?, home_team = ?, home_team_logo = ?, away_team = ?, away_team_logo = ?,
              home_score = ?, away_score = ?, live_period = ?, live_minute = ?,
              match_time = ?, status = ?, venue = ?, player_image = ?, bg_image = ?,
              display_order = ?, is_customized = 1
             WHERE id = ?`,
            [
              match.title,
              match.homeTeam,
              match.homeTeamLogo,
              match.awayTeam,
              match.awayTeamLogo,
              match.homeScore,
              match.awayScore,
              match.livePeriod,
              match.liveMinute,
              new Date(match.matchTime),
              match.status,
              match.venue,
              match.playerImage,
              match.bgImage,
              match.displayOrder,
              existing.id,
            ]
          );
        } else {
          await pool.query(
            `INSERT INTO matches (
              category_id, subcategory_id, match_type, slug, title,
              home_team, home_team_logo, away_team, away_team_logo,
              home_score, away_score, live_period, live_minute,
              match_time, status, venue, player_image, bg_image,
              display_order, is_customized
            ) VALUES (?, ?, 'team_vs_team', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              LOCAL_CATEGORY_ID,
              LOCAL_SUBCATEGORY_ID,
              match.slug,
              match.title,
              match.homeTeam,
              match.homeTeamLogo,
              match.awayTeam,
              match.awayTeamLogo,
              match.homeScore,
              match.awayScore,
              match.livePeriod,
              match.liveMinute,
              new Date(match.matchTime),
              match.status,
              match.venue,
              match.playerImage,
              match.bgImage,
              match.displayOrder,
            ]
          );
        }
      }
      console.log('💾 [CHINA OPEN SYNC] Local database synchronized.');
    } catch (localErr) {
      console.warn('⚠️ [CHINA OPEN SYNC] Local DB sync note:', localErr.message);
    }

    // 6. Push to Production API
    try {
      const loginRes = await axios.post(`${PROD_API_BASE}/auth/login`, ADMIN_CREDENTIALS, { timeout: 8000 });
      const prodToken = loginRes.data?.data?.token;

      if (prodToken) {
        const existingRes = await axios.get(`${PROD_API_BASE}/matches?subcategoryId=${PROD_SUBCATEGORY_ID}&all=true&limit=500`, {
          headers: { Authorization: `Bearer ${prodToken}` },
          timeout: 8000,
        });
        const existingProd = existingRes.data?.data?.matches || [];
        const prodMatchMap = new Map();
        existingProd.forEach((m) => {
          const key = makeMatchKey(m.homeTeam, m.awayTeam);
          prodMatchMap.set(key, m);
          if (m.slug) prodMatchMap.set(m.slug, m);
        });

        for (const match of parsedMatches) {
          const payload = {
            categoryId: PROD_CATEGORY_ID,
            subcategoryId: PROD_SUBCATEGORY_ID,
            matchType: 'team_vs_team',
            slug: match.slug,
            title: match.title,
            homeTeam: match.homeTeam,
            homeTeamLogo: match.homeTeamLogo,
            awayTeam: match.awayTeam,
            awayTeamLogo: match.awayTeamLogo,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            livePeriod: match.livePeriod,
            liveMinute: match.liveMinute,
            matchTime: match.matchTime,
            status: match.status,
            venue: match.venue,
            playerImage: match.playerImage,
            bgImage: match.bgImage,
            displayOrder: match.displayOrder,
          };

          const existing = prodMatchMap.get(match.matchKey) || prodMatchMap.get(match.slug);
          if (existing) {
            await axios.put(`${PROD_API_BASE}/matches/${existing.id}`, payload, {
              headers: { Authorization: `Bearer ${prodToken}` },
              timeout: 6000,
            });
          } else {
            await axios.post(`${PROD_API_BASE}/matches`, payload, {
              headers: { Authorization: `Bearer ${prodToken}` },
              timeout: 6000,
            });
          }
        }
        console.log(`🌐 [CHINA OPEN SYNC] Production API synchronized (${parsedMatches.length} matches).`);
      }
    } catch (prodErr) {
      console.warn('⚠️ [CHINA OPEN SYNC] Production API sync note:', prodErr.message);
    }

    return {
      success: true,
      totalSynced: parsedMatches.length,
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('❌ [CHINA OPEN SYNC] Sync error:', error.message);
    return { success: false, error: error.message };
  } finally {
    isChinaOpenSyncing = false;
  }
};

/**
 * 1-Hour Periodic Background Scheduler (every 1 hour = 3,600,000 ms)
 */
let hourlyIntervalId = null;

const startHourlyChinaOpenSyncScheduler = () => {
  if (hourlyIntervalId) {
    clearInterval(hourlyIntervalId);
  }

  console.log('⏱️ [HOURLY CHINA OPEN SCHEDULER] Background match updater started (running every 1 hour).');

  hourlyIntervalId = setInterval(async () => {
    try {
      console.log('⏰ [HOURLY CHINA OPEN SCHEDULER] Triggering hourly update for China Open matches...');
      await syncChinaOpenMatchesCore();
    } catch (err) {
      console.error('⚠️ [HOURLY CHINA OPEN SCHEDULER] Hourly sync error:', err.message);
    }
  }, 60 * 60 * 1000); // 1 hour = 3,600,000 ms
};

module.exports = {
  syncChinaOpenMatchesCore,
  startHourlyChinaOpenSyncScheduler,
};

// Standalone execution test: `node src/services/chinaOpenSyncService.js`
if (require.main === module) {
  syncChinaOpenMatchesCore().then((res) => {
    console.log('🏁 Standalone China Open Sync completed:', res);
    process.exit(0);
  });
}
