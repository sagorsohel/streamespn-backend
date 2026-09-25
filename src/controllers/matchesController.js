const { eq, ne, gte, lte, lt, asc, desc, and, or, isNull, sql, inArray } = require('drizzle-orm');
const axios = require('axios');
const { db, pool, ensureDatabaseExists } = require('../db');
const { matches, sportsCategories, sportsSubcategories } = require('../db/schema');
const { SPORTSDB_API_KEY } = require('../services/sportsDbService');

// Helper to generate clean URL slug
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

// Helper to generate guaranteed clean & unique URL slug with team names, date, and UTC time
const generateCleanMatchSlug = (homeTeam, awayTeam, title, matchTime, eventId = '') => {
  const d = matchTime ? new Date(matchTime) : new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const dateTimeStr = `${year}-${month}-${day}-${hours}-${minutes}`;

  const cleanHome = slugify(homeTeam);
  const cleanAway = slugify(awayTeam);
  const cleanTitle = slugify(title);

  if (cleanHome && cleanAway) {
    return `${cleanHome}-vs-${cleanAway}-${dateTimeStr}`;
  } else if (cleanTitle) {
    return `${cleanTitle}-${dateTimeStr}`;
  }
  return `match-${eventId || Date.now()}-${dateTimeStr}`;
};

let isSlugMigrationDone = false;
const cleanAndMigrateExistingSlugs = async () => {
  if (isSlugMigrationDone) return;
  isSlugMigrationDone = true;
  try {
    const allDbMatches = await db
      .select({
        id: matches.id,
        homeTeam: matches.homeTeam,
        awayTeam: matches.awayTeam,
        title: matches.title,
        matchTime: matches.matchTime,
        sportsdbEventId: matches.sportsdbEventId,
        slug: matches.slug,
      })
      .from(matches);

    for (const m of allDbMatches) {
      const clean = generateCleanMatchSlug(m.homeTeam, m.awayTeam, m.title, m.matchTime, m.sportsdbEventId || m.id);
      if (clean && clean !== m.slug) {
        await db.update(matches).set({ slug: clean }).where(eq(matches.id, m.id));
      }
    }
  } catch (err) {
    // ignore
  }
};

// Helper to ensure matches table exists & auto-activate subcategories with matches
const ensureTableExists = async () => {
  await ensureDatabaseExists();
  const connection = await pool.getConnection();
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`matches\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`sportsdb_event_id\` VARCHAR(100),
      \`category_id\` INT NOT NULL,
      \`subcategory_id\` INT,
      \`match_type\` ENUM('team_vs_team', 'title_event') NOT NULL DEFAULT 'team_vs_team',
      \`slug\` VARCHAR(255),
      \`title\` VARCHAR(255),
      \`home_team\` VARCHAR(255),
      \`home_team_logo\` TEXT,
      \`away_team\` VARCHAR(255),
      \`away_team_logo\` TEXT,
      \`home_score\` VARCHAR(50),
      \`away_score\` VARCHAR(50),
      \`match_time\` TIMESTAMP NULL,
      \`status\` ENUM('upcoming', 'live', 'finished') NOT NULL DEFAULT 'upcoming',
      \`venue\` VARCHAR(255),
      \`player_image\` TEXT,
      \`bg_image\` TEXT,
      \`referral_link\` TEXT,
      \`display_order\` INT NOT NULL DEFAULT 0,
      \`is_customized\` TINYINT(1) NOT NULL DEFAULT 0,
      \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  try {
    await connection.query(`ALTER TABLE \`matches\` ADD COLUMN \`slug\` VARCHAR(255);`);
  } catch (e) {}

  try {
    await connection.query(`ALTER TABLE \`matches\` ADD COLUMN \`live_minute\` VARCHAR(50);`);
  } catch (e) {}

  try {
    await connection.query(`ALTER TABLE \`sports_subcategories\` ADD COLUMN \`is_home_banner\` TINYINT(1) NOT NULL DEFAULT 0;`);
  } catch (e) {}

  try {
    await connection.query(`ALTER TABLE \`matches\` ADD COLUMN \`live_period\` VARCHAR(50);`);
  } catch (e) {}

  connection.release();
};

// Ensure matches table exists (lazy-init singleton lock)
let isTableChecked = false;
const ensureTableExistsOnce = async () => {
  if (!isTableChecked) {
    await ensureTableExists();
    await cleanAndMigrateExistingSlugs();
    isTableChecked = true;
  }
};

// Get All Matches (with status tab, category filter, search)
const getMatches = async (req, res, next) => {
  try {
    await ensureTableExistsOnce();
    syncLiveScoresWithSportsDB().catch(() => {});
    const { status, tab, categoryId, subcategoryId, page, limit, all, admin, home } = req.query;
    const filterTab = tab || status;
    const showAll = all === 'true' || all === '1' || admin === 'true';

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    startOfTomorrow.setHours(0, 0, 0, 0);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);

    // Buffer to support global timezones (UTC-12 to UTC+14):
    // Prevents server timezone vs client local timezone mismatch
    const queryRangeStart = new Date(startOfToday.getTime() - 14 * 3600 * 1000);
    const queryRangeEnd = new Date(endOfTomorrow.getTime() + 14 * 3600 * 1000);

    const conditions = [];

    // Filter out matches of disabled subcategories for public website queries
    if (!showAll) {
      conditions.push(or(isNull(matches.subcategoryId), eq(sportsSubcategories.status, true)));
    }

    // Filter out matches whose subcategories are disabled for homepage visibility
    if ((home === 'true' || home === '1') && !showAll) {
      conditions.push(or(isNull(matches.subcategoryId), eq(sportsSubcategories.showOnHome, true)));
    }

    if (filterTab === 'live') {
      // Live matches: ALWAYS show regardless of matchTime / start time
      conditions.push(eq(matches.status, 'live'));
    } else if (filterTab === 'upcoming') {
      conditions.push(and(eq(matches.status, 'upcoming'), gte(matches.matchTime, queryRangeStart), lte(matches.matchTime, endOfToday)));
    } else if (filterTab === 'nextDay' || filterTab === 'tomorrow') {
      conditions.push(and(ne(matches.status, 'finished'), ne(matches.status, 'live'), gte(matches.matchTime, startOfTomorrow), lte(matches.matchTime, queryRangeEnd)));
    } else if (filterTab === 'finished') {
      conditions.push(eq(matches.status, 'finished'));
    } else if (!showAll) {
      // For public website:
      // 1. Live matches: ALWAYS show, even if matchTime was from earlier / older.
      // 2. Upcoming matches: MUST not be finished, and within Today/Tomorrow window (with timezone buffer).
      // Old past matches whose date has changed are excluded!
      conditions.push(
        or(
          eq(matches.status, 'live'),
          and(
            ne(matches.status, 'finished'),
            gte(matches.matchTime, queryRangeStart),
            lte(matches.matchTime, queryRangeEnd)
          )
        )
      );
    } else {
      conditions.push(ne(matches.status, 'finished'));
    }

    if (categoryId && categoryId !== 'all') {
      const catNum = Number(categoryId);
      if (!isNaN(catNum)) {
        conditions.push(eq(matches.categoryId, catNum));
      } else {
        try {
          const catRes = await db
            .select({ id: sportsCategories.id })
            .from(sportsCategories)
            .where(sql`LOWER(REPLACE(${sportsCategories.sportName}, ' ', '-')) = ${String(categoryId).toLowerCase()}`)
            .limit(1);
          if (catRes.length > 0) {
            conditions.push(eq(matches.categoryId, catRes[0].id));
          }
        } catch (e) {}
      }
    }
    if (subcategoryId && subcategoryId !== 'all') {
      const subNum = Number(subcategoryId);
      if (!isNaN(subNum)) {
        conditions.push(eq(matches.subcategoryId, subNum));
      } else {
        try {
          const subRes = await db
            .select({ id: sportsSubcategories.id })
            .from(sportsSubcategories)
            .where(sql`LOWER(REPLACE(${sportsSubcategories.name}, ' ', '-')) = ${String(subcategoryId).toLowerCase()}`)
            .limit(1);
          if (subRes.length > 0) {
            conditions.push(eq(matches.subcategoryId, subRes[0].id));
          }
        } catch (e) {}
      }
    }

    let query = db
      .select({
        id: matches.id,
        sportsdbEventId: matches.sportsdbEventId,
        categoryId: matches.categoryId,
        subcategoryId: matches.subcategoryId,
        matchType: matches.matchType,
        slug: matches.slug,
        title: matches.title,
        homeTeam: matches.homeTeam,
        homeTeamLogo: matches.homeTeamLogo,
        awayTeam: matches.awayTeam,
        awayTeamLogo: matches.awayTeamLogo,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        livePeriod: matches.livePeriod,
        liveMinute: matches.liveMinute,
        matchTime: matches.matchTime,
        status: matches.status,
        venue: matches.venue,
        playerImage: matches.playerImage,
        bgImage: matches.bgImage,
        referralLink: matches.referralLink,
        displayOrder: matches.displayOrder,
        isCustomized: matches.isCustomized,
        createdAt: matches.createdAt,
        updatedAt: matches.updatedAt,
        categoryName: sportsCategories.sportName,
        categoryLogo: sportsCategories.iconUrl,
        categoryPlayerImage: sportsCategories.playerImage,
        categoryBgImage: sportsCategories.bgImage,
        categoryThumbUrl: sportsCategories.thumbUrl,
        categoryReferralLink: sportsCategories.referralLink,
        subcategoryName: sportsSubcategories.name,
        subcategoryLogo: sportsSubcategories.logoUrl,
        subcategoryReferralLink: sportsSubcategories.referralLink,
      })
      .from(matches)
      .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
      .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const statusOrder = sql`CASE 
      WHEN ${matches.status} = 'live' THEN 1 
      WHEN ${matches.status} = 'upcoming' THEN 2 
      ELSE 3 
    END`;

    const limitNum = limit ? (Number(limit) || 50) : null;
    const pageNum = page ? (Number(page) || 1) : 1;
    const offset = limitNum ? (pageNum - 1) * limitNum : 0;

    query = query.orderBy(statusOrder, asc(matches.matchTime));

    if (limitNum) {
      query = query.limit(limitNum).offset(offset);
    }

    const results = await query;

    return res.status(200).json({
      success: true,
      count: results.length,
      data: {
        matches: results,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Matches for Home Page Featured Hero Banner Carousel
const getBannerMatches = async (req, res, next) => {
  try {
    await ensureTableExists();

    const selectFields = {
      id: matches.id,
      sportsdbEventId: matches.sportsdbEventId,
      categoryId: matches.categoryId,
      subcategoryId: matches.subcategoryId,
      matchType: matches.matchType,
      slug: matches.slug,
      title: matches.title,
      homeTeam: matches.homeTeam,
      homeTeamLogo: matches.homeTeamLogo,
      awayTeam: matches.awayTeam,
      awayTeamLogo: matches.awayTeamLogo,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      livePeriod: matches.livePeriod,
      liveMinute: matches.liveMinute,
      matchTime: matches.matchTime,
      status: matches.status,
      venue: matches.venue,
      playerImage: matches.playerImage,
      bgImage: matches.bgImage,
      referralLink: matches.referralLink,
      displayOrder: matches.displayOrder,
      isCustomized: matches.isCustomized,
      createdAt: matches.createdAt,
      updatedAt: matches.updatedAt,
      categoryName: sportsCategories.sportName,
      categoryLogo: sportsCategories.iconUrl,
      categoryPlayerImage: sportsCategories.playerImage,
      categoryBgImage: sportsCategories.bgImage,
      categoryThumbUrl: sportsCategories.thumbUrl,
      categoryReferralLink: sportsCategories.referralLink,
      subcategoryName: sportsSubcategories.name,
      subcategoryLogo: sportsSubcategories.logoUrl,
      subcategoryReferralLink: sportsSubcategories.referralLink,
    };

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(now);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const endOfTomorrow = new Date(startOfTomorrow);
    endOfTomorrow.setHours(23, 59, 59, 999);

    const queryRangeStart = new Date(startOfToday.getTime() - 14 * 3600 * 1000);
    const queryRangeEnd = new Date(endOfTomorrow.getTime() + 14 * 3600 * 1000);

    const bannerMatchCondition = or(
      eq(matches.status, 'live'),
      and(
        ne(matches.status, 'finished'),
        gte(matches.matchTime, queryRangeStart),
        lte(matches.matchTime, queryRangeEnd)
      )
    );

    const statusOrder = sql`CASE 
      WHEN ${matches.status} = 'live' THEN 1 
      WHEN ${matches.status} = 'upcoming' THEN 2 
      ELSE 3 
    END`;

    // 1. Check if any subcategory has isHomeBanner = true, status = true, and showOnHome = true
    const bannerSubcats = await db
      .select({ id: sportsSubcategories.id })
      .from(sportsSubcategories)
      .where(and(eq(sportsSubcategories.isHomeBanner, true), eq(sportsSubcategories.status, true), eq(sportsSubcategories.showOnHome, true)));

    if (bannerSubcats.length > 0) {
      const bannerSubcatIds = bannerSubcats.map((s) => s.id);
      const bannerMatches = await db
        .select(selectFields)
        .from(matches)
        .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
        .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
        .where(
          and(
            inArray(matches.subcategoryId, bannerSubcatIds),
            bannerMatchCondition
          )
        )
        .orderBy(statusOrder, asc(matches.matchTime))
        .limit(10);

      if (bannerMatches.length > 0) {
        return res.status(200).json({
          success: true,
          source: 'manual_banner',
          count: bannerMatches.length,
          data: { matches: bannerMatches },
        });
      }
    }

    // 2. Fallback: If no subcategory is marked for banner (or has 0 active matches)
    // Find subcategories with matchCount >= 10, or highest active match count
    const topSubcatsWithMatches = await db
      .select({
        id: sportsSubcategories.id,
      })
      .from(sportsSubcategories)
      .leftJoin(matches, eq(sportsSubcategories.id, matches.subcategoryId))
      .where(and(eq(sportsSubcategories.status, true), eq(sportsSubcategories.showOnHome, true)))
      .groupBy(sportsSubcategories.id)
      .having(sql`COUNT(CASE WHEN ${matches.id} IS NOT NULL AND (${matches.status} = 'live' OR (${matches.status} != 'finished' AND ${matches.matchTime} >= ${queryRangeStart} AND ${matches.matchTime} <= ${queryRangeEnd})) THEN 1 ELSE NULL END) >= 10`)
      .orderBy(desc(sql`COUNT(CASE WHEN ${matches.id} IS NOT NULL AND (${matches.status} = 'live' OR (${matches.status} != 'finished' AND ${matches.matchTime} >= ${queryRangeStart} AND ${matches.matchTime} <= ${queryRangeEnd})) THEN 1 ELSE NULL END)`));

    if (topSubcatsWithMatches.length > 0) {
      const topIds = topSubcatsWithMatches.map((s) => s.id);
      const matchesFromTop = await db
        .select(selectFields)
        .from(matches)
        .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
        .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
        .where(
          and(
            inArray(matches.subcategoryId, topIds),
            bannerMatchCondition
          )
        )
        .orderBy(statusOrder, asc(matches.matchTime))
        .limit(10);

      if (matchesFromTop.length > 0) {
        return res.status(200).json({
          success: true,
          source: 'top_leagues_fallback',
          count: matchesFromTop.length,
          data: { matches: matchesFromTop },
        });
      }
    }

    // 3. Ultimate Fallback: Top 10 live or upcoming matches overall
    const fallbackMatches = await db
      .select(selectFields)
      .from(matches)
      .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
      .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
      .where(
        and(
          bannerMatchCondition,
          or(
            isNull(matches.subcategoryId),
            and(eq(sportsSubcategories.status, true), eq(sportsSubcategories.showOnHome, true))
          )
        )
      )
      .orderBy(statusOrder, asc(matches.matchTime))
      .limit(10);

    return res.status(200).json({
      success: true,
      source: 'general_fallback',
      count: fallbackMatches.length,
      data: { matches: fallbackMatches },
    });
  } catch (error) {
    next(error);
  }
};

// Helper to resolve category from sport name and league name dynamically
const resolveCategoryForLiveMatch = (sportName, leagueName, categories) => {
  const sLower = (sportName || '').toLowerCase().trim();
  const lLower = (leagueName || '').toLowerCase().trim();

  // 1. Direct match with sportName in DB
  let matched = categories.find((c) => c.sportName.toLowerCase().trim() === sLower);
  if (matched) return matched;

  // 2. Keyword matching
  if (sLower.includes('american football') || sLower.includes('nfl') || lLower.includes('nfl')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('american football'));
  } else if (sLower.includes('soccer') || (sLower.includes('football') && !sLower.includes('american'))) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('soccer') || c.sportName.toLowerCase() === 'football');
  } else if (sLower.includes('basketball') || sLower.includes('nba') || lLower.includes('nba')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('basketball'));
  } else if (sLower.includes('baseball') || lLower.includes('mlb') || lLower.includes('baseball') || lLower.includes('cpbl') || lLower.includes('kbo') || lLower.includes('npb')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('baseball'));
  } else if (sLower.includes('hockey') || lLower.includes('nhl') || lLower.includes('khl') || lLower.includes('vhl') || lLower.includes('hockey')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('hockey'));
  } else if (sLower.includes('tennis') && !sLower.includes('table')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('tennis') && !c.sportName.toLowerCase().includes('table'));
  } else if (sLower.includes('cricket')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('cricket'));
  } else if (sLower.includes('rugby')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('rugby'));
  } else if (sLower.includes('fighting') || sLower.includes('mma') || sLower.includes('boxing') || sLower.includes('ufc')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('fighting'));
  } else if (sLower.includes('motorsport') || sLower.includes('formula 1') || sLower.includes('f1') || sLower.includes('racing') || lLower.includes('nascar')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('motorsport'));
  } else if (sLower.includes('volleyball')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('volleyball'));
  } else if (sLower.includes('table tennis') || sLower.includes('ping pong')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('table tennis'));
  } else if (sLower.includes('cycling')) {
    matched = categories.find((c) => c.sportName.toLowerCase().includes('cycling'));
  }

  // 3. Substring match fallback
  if (!matched) {
    matched = categories.find((c) => sLower.includes(c.sportName.toLowerCase()));
  }

  // If no registered category matches (e.g. Baseball, Ice Hockey, etc.), return null (DO NOT fallback to Soccer!)
  return matched || null;
};

// Helper to resolve or auto-create subcategory with official badge
const resolveOrCreateSubcategory = async (catId, leagueName, idLeague, subcategoryMap) => {
  if (!leagueName || !leagueName.trim()) return null;
  const cleanLeague = leagueName.trim();
  const lowerLeague = cleanLeague.toLowerCase();

  const keyWithCat = `${catId}:${lowerLeague}`;
  let matchedSubcat = subcategoryMap.get(keyWithCat);
  if (!matchedSubcat) {
    const rawMatch = subcategoryMap.get(lowerLeague);
    if (rawMatch && rawMatch.categoryId === catId) {
      matchedSubcat = rawMatch;
    }
  }

  if (matchedSubcat) {
    // If it exists but is disabled (status = false), auto-activate it so the live match is visible
    if (!matchedSubcat.status) {
      try {
        await db
          .update(sportsSubcategories)
          .set({ status: true })
          .where(eq(sportsSubcategories.id, matchedSubcat.id));
        matchedSubcat.status = true;
      } catch (e) {}
    }
    return matchedSubcat.id;
  }

  // Subcategory not found in DB -> Fetch official league badge if available and create it!
  let badgeUrl = null;
  if (idLeague) {
    try {
      const lRes = await axios.get(
        `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/lookupleague.php?id=${idLeague}`,
        { timeout: 3000 }
      );
      const leagueData = lRes.data?.leagues?.[0];
      if (leagueData) {
        badgeUrl = leagueData.strBadge || leagueData.strLogo || null;
      }
    } catch (e) {}
  }

  try {
    const [insertResult] = await db.insert(sportsSubcategories).values({
      categoryId: catId,
      name: cleanLeague,
      logoUrl: badgeUrl,
      status: true, // Auto-active so the match and league show up!
      isTrending: false,
      isHomeBanner: false,
      showOnHome: true,
      referralLink: null,
      displayOrder: 0,
      isCustomized: false,
    });

    const newSubcatId = insertResult.insertId;
    const newSubcatObj = {
      id: newSubcatId,
      categoryId: catId,
      name: cleanLeague,
      logoUrl: badgeUrl,
      status: true,
    };
    subcategoryMap.set(keyWithCat, newSubcatObj);
    subcategoryMap.set(lowerLeague, newSubcatObj);
    return newSubcatId;
  } catch (insertErr) {
    // In case of race condition or duplicate, re-fetch from DB
    try {
      const reCheck = await db
        .select()
        .from(sportsSubcategories)
        .where(
          and(
            eq(sportsSubcategories.categoryId, catId),
            sql`LOWER(${sportsSubcategories.name}) = ${lowerLeague}`
          )
        )
        .limit(1);
      if (reCheck.length > 0) {
        subcategoryMap.set(keyWithCat, reCheck[0]);
        subcategoryMap.set(lowerLeague, reCheck[0]);
        return reCheck[0].id;
      }
    } catch (e) {}
    return null;
  }
};

let lastLiveSyncTime = 0;

const syncLiveScoresWithSportsDB = async () => {
  const now = Date.now();
  if (now - lastLiveSyncTime < 20000) return;
  lastLiveSyncTime = now;

  try {
    const res = await fetch('https://www.thesportsdb.com/api/v1/json/3/livescore.php');
    const data = await res.json();
    if (!data.livescore || !Array.isArray(data.livescore)) return;

    // Load categories & subcategories from DB for dynamic mapping
    const dbCategories = await db.select().from(sportsCategories);
    const dbSubcategories = await db.select().from(sportsSubcategories);
    const subcategoryMap = new Map(
      dbSubcategories.map((s) => [s.name.toLowerCase().trim(), s])
    );

    for (const item of data.livescore) {
      if (!item.strHomeTeam || !item.strAwayTeam) continue;

      const statusStr = (item.strStatus || '').toLowerCase().trim();
      const progressStr = (item.strProgress || '').toLowerCase().trim();
      let targetStatus = 'upcoming';

      // 1. Check if Finished (SportsDB often returns strStatus: null and strProgress: "Final" or "Final/OT" or "FT")
      if (
        statusStr === 'ft' ||
        statusStr === 'finished' ||
        statusStr === 'aet' ||
        statusStr.includes('final') ||
        statusStr.includes('ended') ||
        progressStr.includes('final') ||
        progressStr.includes('ft') ||
        progressStr.includes('finished') ||
        progressStr.includes('ended')
      ) {
        targetStatus = 'finished';
      } else if (
        statusStr.includes('1h') ||
        statusStr.includes('2h') ||
        statusStr.includes('ht') ||
        statusStr.includes('live') ||
        statusStr.includes('in play') ||
        statusStr.includes('q1') ||
        statusStr.includes('q2') ||
        statusStr.includes('q3') ||
        statusStr.includes('q4') ||
        statusStr.startsWith('in') ||
        statusStr.startsWith('p1') ||
        statusStr.startsWith('p2') ||
        statusStr.startsWith('p3') ||
        statusStr.includes('half') ||
        statusStr.includes('ot') ||
        statusStr.includes('set') ||
        progressStr.includes('1h') ||
        progressStr.includes('2h') ||
        progressStr.includes('ht') ||
        progressStr.includes('q1') ||
        progressStr.includes('q2') ||
        progressStr.includes('q3') ||
        progressStr.includes('q4')
      ) {
        targetStatus = 'live';
      } else if (statusStr === 'ns' || statusStr === 'not started' || statusStr.includes('sched')) {
        targetStatus = 'upcoming';
      } else if (item.intHomeScore !== null || item.intAwayScore !== null) {
        targetStatus = 'live';
      }

      const homeScoreVal = item.intHomeScore !== null && item.intHomeScore !== undefined ? String(item.intHomeScore) : null;
      const awayScoreVal = item.intAwayScore !== null && item.intAwayScore !== undefined ? String(item.intAwayScore) : null;

      // Resolve category & subcategory dynamically
      const matchedCat = resolveCategoryForLiveMatch(item.strSport, item.strLeague, dbCategories);
      // Skip sports that are not part of our active sports categories (e.g., Baseball, Ice Hockey)
      if (!matchedCat) {
        continue;
      }
      const catId = matchedCat.id;
      let subcatId = null;
      let finalCatId = catId;
      if (item.strLeague) {
        subcatId = await resolveOrCreateSubcategory(catId, item.strLeague, item.idLeague, subcategoryMap);
        const resolvedSub = subcategoryMap.get(item.strLeague.toLowerCase().trim());
        if (resolvedSub && resolvedSub.categoryId) {
          finalCatId = resolvedSub.categoryId;
        }
      }

      try {
        const updateFields = {
          homeScore: homeScoreVal,
          awayScore: awayScoreVal,
          livePeriod: item.strStatus || null,
          liveMinute: item.strProgress || null,
          status: targetStatus,
        };

        // If existing match has NULL subcategoryId, automatically backfill and repair it!
        if (subcatId) {
          updateFields.subcategoryId = sql`COALESCE(${matches.subcategoryId}, ${subcatId})`;
        }
        if (finalCatId) {
          updateFields.categoryId = sql`COALESCE(${matches.categoryId}, ${finalCatId})`;
        }

        // 🎬 100% Resolve Media Player Banner from SportsDB (strThumb / strPoster / strBanner / strFanart)
        const liveEventThumb =
          (item.strThumb && item.strThumb.trim()) ||
          (item.strPoster && item.strPoster.trim()) ||
          (item.strBanner && item.strBanner.trim()) ||
          (item.strFanart && item.strFanart.trim()) ||
          null;
        const liveEventBg =
          (item.strBanner && item.strBanner.trim()) ||
          (item.strFanart && item.strFanart.trim()) ||
          liveEventThumb ||
          null;

        if (liveEventThumb) {
          updateFields.playerImage = sql`COALESCE(NULLIF(TRIM(${matches.playerImage}), ''), ${liveEventThumb})`;
        }
        if (liveEventBg) {
          updateFields.bgImage = sql`COALESCE(NULLIF(TRIM(${matches.bgImage}), ''), ${liveEventBg})`;
        }

        const updateRes = await db
          .update(matches)
          .set(updateFields)
          .where(
            and(
              eq(matches.isCustomized, false),
              eq(matches.categoryId, finalCatId),
              or(
                eq(matches.sportsdbEventId, item.idEvent),
                and(
                  sql`LOWER(${matches.homeTeam}) LIKE ${'%' + item.strHomeTeam.toLowerCase() + '%'}`,
                  sql`LOWER(${matches.awayTeam}) LIKE ${'%' + item.strAwayTeam.toLowerCase() + '%'}`
                )
              )
            )
          );

        if (updateRes[0]?.affectedRows === 0 && targetStatus === 'live') {
          if (finalCatId) {
            const cleanSlug = generateCleanMatchSlug(item.strHomeTeam, item.strAwayTeam, null, new Date(item.strTimestamp || Date.now()), item.idEvent);
            await db.insert(matches).values({
              sportsdbEventId: item.idEvent,
              categoryId: finalCatId,
              subcategoryId: subcatId, // ✅ Properly resolved and assigned!
              matchType: 'team_vs_team',
              slug: cleanSlug,
              title: null,
              homeTeam: item.strHomeTeam,
              homeTeamLogo: item.strHomeTeamBadge || null,
              awayTeam: item.strAwayTeam,
              awayTeamLogo: item.strAwayTeamBadge || null,
              homeScore: homeScoreVal,
              awayScore: awayScoreVal,
              livePeriod: item.strStatus || null,
              liveMinute: item.strProgress || null,
              matchTime: new Date(item.strTimestamp || Date.now()),
              status: 'live',
              venue: item.strVenue || null,
              playerImage: liveEventThumb,
              bgImage: liveEventBg,
              displayOrder: 0,
              isCustomized: false,
            });
          }
        }
      } catch (e) {}
    }
  } catch (err) {
    // silent catch
  }
};

// Get Live Scores, Period & Live Minute Only (Lightweight Polling Endpoint for Real-Time Live Sync)
const getLiveScores = async (req, res, next) => {
  try {
    // Auto-sync with SportsDB live score feed in background (non-blocking, throttled 20s)
    syncLiveScoresWithSportsDB().catch(() => {});

    const { all, admin } = req.query;
    const showAll = all === 'true' || all === '1' || admin === 'true';

    const conditions = [eq(matches.status, 'live')];
    if (!showAll) {
      conditions.push(or(isNull(matches.subcategoryId), eq(sportsSubcategories.status, true)));
    }

    const liveMatches = await db
      .select({
        id: matches.id,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        livePeriod: matches.livePeriod,
        liveMinute: matches.liveMinute,
        status: matches.status,
      })
      .from(matches)
      .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
      .where(and(...conditions));

    return res.status(200).json({
      success: true,
      data: liveMatches,
    });
  } catch (error) {
    next(error);
  }
};

// Get Single Match by ID or Slug
const getMatchById = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;
    const { all, admin } = req.query;
    const showAll = all === 'true' || all === '1' || admin === 'true';
    const isNum = !isNaN(Number(id));

    const baseWhere = (whereCond) =>
      showAll
        ? whereCond
        : and(whereCond, or(isNull(matches.subcategoryId), eq(sportsSubcategories.status, true)));

    let found = await db
      .select({
        id: matches.id,
        sportsdbEventId: matches.sportsdbEventId,
        categoryId: matches.categoryId,
        subcategoryId: matches.subcategoryId,
        matchType: matches.matchType,
        slug: matches.slug,
        title: matches.title,
        homeTeam: matches.homeTeam,
        homeTeamLogo: matches.homeTeamLogo,
        awayTeam: matches.awayTeam,
        awayTeamLogo: matches.awayTeamLogo,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
        livePeriod: matches.livePeriod,
        liveMinute: matches.liveMinute,
        matchTime: matches.matchTime,
        status: matches.status,
        venue: matches.venue,
        playerImage: matches.playerImage,
        bgImage: matches.bgImage,
        referralLink: matches.referralLink,
        displayOrder: matches.displayOrder,
        isCustomized: matches.isCustomized,
        createdAt: matches.createdAt,
        updatedAt: matches.updatedAt,
        categoryName: sportsCategories.sportName,
        categoryLogo: sportsCategories.iconUrl,
        categoryPlayerImage: sportsCategories.playerImage,
        categoryBgImage: sportsCategories.bgImage,
        categoryThumbUrl: sportsCategories.thumbUrl,
        categoryReferralLink: sportsCategories.referralLink,
        subcategoryName: sportsSubcategories.name,
        subcategoryLogo: sportsSubcategories.logoUrl,
        subcategoryReferralLink: sportsSubcategories.referralLink,
      })
      .from(matches)
      .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
      .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
      .where(baseWhere(isNum ? eq(matches.id, Number(id)) : eq(matches.slug, id)))
      .limit(1);

    // Fallback candidate search for URL-encoded, special character, or slugified variants
    if (found.length === 0 && !isNum) {
      const decoded = decodeURIComponent(id);
      const slugifiedId = slugify(id);
      const slugifiedDecoded = slugify(decoded);
      const legacyStripped = decoded.toLowerCase().replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
      const spanishVariation1 = decoded.replace(/espaa/g, 'espana');
      const spanishVariation2 = decoded.replace(/espana/g, 'espaa');

      const candidates = Array.from(
        new Set([
          decoded,
          slugifiedId,
          slugifiedDecoded,
          legacyStripped,
          spanishVariation1,
          spanishVariation2,
          slugify(spanishVariation1),
        ])
      ).filter((c) => c && c !== id);

      for (const cand of candidates) {
        found = await db
          .select({
            id: matches.id,
            sportsdbEventId: matches.sportsdbEventId,
            categoryId: matches.categoryId,
            subcategoryId: matches.subcategoryId,
            matchType: matches.matchType,
            slug: matches.slug,
            title: matches.title,
            homeTeam: matches.homeTeam,
            homeTeamLogo: matches.homeTeamLogo,
            awayTeam: matches.awayTeam,
            awayTeamLogo: matches.awayTeamLogo,
            homeScore: matches.homeScore,
            awayScore: matches.awayScore,
            livePeriod: matches.livePeriod,
            liveMinute: matches.liveMinute,
            matchTime: matches.matchTime,
            status: matches.status,
            venue: matches.venue,
            playerImage: matches.playerImage,
            bgImage: matches.bgImage,
            referralLink: matches.referralLink,
            displayOrder: matches.displayOrder,
            isCustomized: matches.isCustomized,
            createdAt: matches.createdAt,
            updatedAt: matches.updatedAt,
            categoryName: sportsCategories.sportName,
            categoryLogo: sportsCategories.iconUrl,
            categoryPlayerImage: sportsCategories.playerImage,
            categoryBgImage: sportsCategories.bgImage,
            categoryThumbUrl: sportsCategories.thumbUrl,
            categoryReferralLink: sportsCategories.referralLink,
            subcategoryName: sportsSubcategories.name,
            subcategoryLogo: sportsSubcategories.logoUrl,
            subcategoryReferralLink: sportsSubcategories.referralLink,
          })
          .from(matches)
          .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
          .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
          .where(baseWhere(eq(matches.slug, cand)))
          .limit(1);

        if (found.length > 0) break;
      }
    }

    // Fuzzy team lookup if exact slug candidate matches were not found
    if (found.length === 0 && !isNum && id.includes('-vs-')) {
      try {
        const parts = id.split('-vs-');
        if (parts.length >= 2) {
          const team1 = parts[0].replace(/-\d{4}-\d{2}-\d{2}$/, '').trim();
          const team2 = parts[1].replace(/-\d{4}-\d{2}-\d{2}$/, '').trim();

          if (team1 && team2) {
            found = await db
              .select({
                id: matches.id,
                sportsdbEventId: matches.sportsdbEventId,
                categoryId: matches.categoryId,
                subcategoryId: matches.subcategoryId,
                matchType: matches.matchType,
                slug: matches.slug,
                title: matches.title,
                homeTeam: matches.homeTeam,
                homeTeamLogo: matches.homeTeamLogo,
                awayTeam: matches.awayTeam,
                awayTeamLogo: matches.awayTeamLogo,
                homeScore: matches.homeScore,
                awayScore: matches.awayScore,
                livePeriod: matches.livePeriod,
                liveMinute: matches.liveMinute,
                matchTime: matches.matchTime,
                status: matches.status,
                venue: matches.venue,
                playerImage: matches.playerImage,
                bgImage: matches.bgImage,
                referralLink: matches.referralLink,
                displayOrder: matches.displayOrder,
                isCustomized: matches.isCustomized,
                createdAt: matches.createdAt,
                updatedAt: matches.updatedAt,
                categoryName: sportsCategories.sportName,
                categoryLogo: sportsCategories.iconUrl,
                categoryPlayerImage: sportsCategories.playerImage,
                categoryBgImage: sportsCategories.bgImage,
                categoryThumbUrl: sportsCategories.thumbUrl,
                categoryReferralLink: sportsCategories.referralLink,
                subcategoryName: sportsSubcategories.name,
                subcategoryLogo: sportsSubcategories.logoUrl,
                subcategoryReferralLink: sportsSubcategories.referralLink,
              })
              .from(matches)
              .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
              .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
              .where(
                baseWhere(
                  and(
                    sql`${matches.slug} LIKE ${'%' + team1 + '%'}`,
                    sql`${matches.slug} LIKE ${'%' + team2 + '%'}`
                  )
                )
              )
              .limit(1);
          }
        }
      } catch (e) {
        // ignore
      }
    }

    if (found.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Match with ID or slug "${id}" not found.`,
      });
    }

    const matchObj = found[0];

    // Real-time score check: If match start time has arrived/passed and match is not marked finished,
    // fetch latest score and status from SportsDB so the user sees real-time score / final score!
    if (
      matchObj &&
      matchObj.sportsdbEventId &&
      !matchObj.isCustomized &&
      matchObj.status !== 'finished' &&
      new Date(matchObj.matchTime) <= new Date()
    ) {
      try {
        const evRes = await axios.get(
          `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/lookupevent.php?id=${matchObj.sportsdbEventId}`,
          { timeout: 3000 }
        );
        const evData = evRes.data?.events?.[0];
        if (evData) {
          const statusStr = (evData.strStatus || '').toLowerCase().trim();
          let targetStatus = matchObj.status;

          if (
            statusStr === 'ft' ||
            statusStr === 'finished' ||
            statusStr === 'aet' ||
            statusStr.includes('final')
          ) {
            targetStatus = 'finished';
          } else if (
            statusStr.includes('1h') ||
            statusStr.includes('2h') ||
            statusStr.includes('ht') ||
            statusStr.includes('live') ||
            statusStr.includes('in play')
          ) {
            targetStatus = 'live';
          }

          const hScore = evData.intHomeScore !== null && evData.intHomeScore !== undefined ? String(evData.intHomeScore) : matchObj.homeScore;
          const aScore = evData.intAwayScore !== null && evData.intAwayScore !== undefined ? String(evData.intAwayScore) : matchObj.awayScore;

          // 🎬 Resolve Media Player Banner & Backdrop from SportsDB
          const lookupThumb =
            (evData.strThumb && evData.strThumb.trim()) ||
            (evData.strPoster && evData.strPoster.trim()) ||
            (evData.strBanner && evData.strBanner.trim()) ||
            (evData.strFanart && evData.strFanart.trim()) ||
            null;
          const lookupBg =
            (evData.strBanner && evData.strBanner.trim()) ||
            (evData.strFanart && evData.strFanart.trim()) ||
            lookupThumb ||
            null;

          const imageUpdate = {};
          if ((!matchObj.playerImage || matchObj.playerImage.trim() === '') && lookupThumb) {
            matchObj.playerImage = lookupThumb;
            imageUpdate.playerImage = lookupThumb;
          }
          if ((!matchObj.bgImage || matchObj.bgImage.trim() === '') && lookupBg) {
            matchObj.bgImage = lookupBg;
            imageUpdate.bgImage = lookupBg;
          }

          if (targetStatus !== matchObj.status || hScore !== matchObj.homeScore || aScore !== matchObj.awayScore || Object.keys(imageUpdate).length > 0) {
            matchObj.status = targetStatus;
            matchObj.homeScore = hScore;
            matchObj.awayScore = aScore;
            matchObj.livePeriod = evData.strStatus || matchObj.livePeriod;
            matchObj.liveMinute = evData.strProgress || matchObj.liveMinute;

            await db
              .update(matches)
              .set({
                status: targetStatus,
                homeScore: hScore,
                awayScore: aScore,
                livePeriod: matchObj.livePeriod,
                liveMinute: matchObj.liveMinute,
                ...imageUpdate,
              })
              .where(eq(matches.id, matchObj.id));
          }
        }
      } catch (lookupErr) {
        // Silently continue
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        match: matchObj,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create Match (Sets isCustomized: true & auto-activates subcategory)
const createMatch = async (req, res, next) => {
  try {
    await ensureTableExists();
    const {
      categoryId,
      subcategoryId,
      matchType,
      slug,
      title,
      homeTeam,
      homeTeamLogo,
      awayTeam,
      awayTeamLogo,
      homeScore,
      awayScore,
      matchTime,
      status,
      venue,
      playerImage,
      bgImage,
      referralLink,
      displayOrder,
    } = req.body;

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a parent sport category.',
      });
    }

    const existingInDb = await db.select().from(matches);
    const maxOrder = existingInDb.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);

    const matchDateStr = matchTime ? new Date(matchTime).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const generatedSlug = slug
      ? slugify(slug)
      : matchType === 'team_vs_team' && homeTeam && awayTeam
      ? slugify(`${homeTeam}-vs-${awayTeam}-${matchDateStr}`)
      : slugify(`${title || 'match'}-${matchDateStr}`);

    const [result] = await db.insert(matches).values({
      categoryId: Number(categoryId),
      subcategoryId: subcategoryId ? Number(subcategoryId) : null,
      matchType: matchType || 'team_vs_team',
      slug: generatedSlug,
      title: title ? title.trim() : null,
      homeTeam: homeTeam ? homeTeam.trim() : null,
      homeTeamLogo: homeTeamLogo || null,
      awayTeam: awayTeam ? awayTeam.trim() : null,
      awayTeamLogo: awayTeamLogo || null,
      homeScore: homeScore !== undefined ? String(homeScore) : null,
      awayScore: awayScore !== undefined ? String(awayScore) : null,
      livePeriod: req.body.livePeriod !== undefined ? (req.body.livePeriod ? String(req.body.livePeriod) : null) : null,
      liveMinute: req.body.liveMinute !== undefined ? (req.body.liveMinute ? String(req.body.liveMinute) : null) : null,
      matchTime: matchTime ? new Date(matchTime) : new Date(),
      status: status || 'upcoming',
      venue: venue ? venue.trim() : null,
      playerImage: playerImage || null,
      bgImage: bgImage || null,
      referralLink: referralLink || null,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    });

    // Auto-activate subcategory if assigned
    if (subcategoryId) {
      await db
        .update(sportsSubcategories)
        .set({ status: true })
        .where(eq(sportsSubcategories.id, Number(subcategoryId)));
    }

    const newMatch = {
      id: result.insertId,
      categoryId: Number(categoryId),
      subcategoryId: subcategoryId ? Number(subcategoryId) : null,
      matchType: matchType || 'team_vs_team',
      slug: generatedSlug,
      title: title || null,
      homeTeam: homeTeam || null,
      homeTeamLogo: homeTeamLogo || null,
      awayTeam: awayTeam || null,
      awayTeamLogo: awayTeamLogo || null,
      homeScore: homeScore !== undefined ? String(homeScore) : null,
      awayScore: awayScore !== undefined ? String(awayScore) : null,
      matchTime: matchTime || new Date().toISOString(),
      status: status || 'upcoming',
      venue: venue || null,
      playerImage: playerImage || null,
      bgImage: bgImage || null,
      referralLink: referralLink || null,
      displayOrder: displayOrder !== undefined ? Number(displayOrder) : maxOrder + 1,
      isCustomized: true,
    };

    return res.status(201).json({
      success: true,
      message: 'Match created successfully and parent subcategory activated.',
      data: {
        match: newMatch,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update Match (Sets isCustomized: true & auto-activates subcategory)
const updateMatch = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;
    const {
      categoryId,
      subcategoryId,
      matchType,
      slug,
      title,
      homeTeam,
      homeTeamLogo,
      awayTeam,
      awayTeamLogo,
      homeScore,
      awayScore,
      matchTime,
      status,
      venue,
      playerImage,
      bgImage,
      referralLink,
      displayOrder,
    } = req.body;

    const existing = await db
      .select()
      .from(matches)
      .where(eq(matches.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Match with ID ${id} not found.`,
      });
    }

    const matchDateStr = (matchTime ? new Date(matchTime) : existing[0].matchTime ? new Date(existing[0].matchTime) : new Date()).toISOString().slice(0, 10);
    let updatedSlug = existing[0].slug;
    if (slug !== undefined && slug.trim()) {
      updatedSlug = slugify(slug);
    } else if (homeTeam || awayTeam || title || matchTime) {
      const hTeam = homeTeam !== undefined ? homeTeam : existing[0].homeTeam;
      const aTeam = awayTeam !== undefined ? awayTeam : existing[0].awayTeam;
      const mTitle = title !== undefined ? title : existing[0].title;
      updatedSlug = (hTeam && aTeam)
        ? slugify(`${hTeam}-vs-${aTeam}-${matchDateStr}`)
        : slugify(`${mTitle || 'match'}-${matchDateStr}`);
    }

    await db
      .update(matches)
      .set({
        categoryId: categoryId !== undefined ? Number(categoryId) : existing[0].categoryId,
        subcategoryId: subcategoryId !== undefined ? (subcategoryId ? Number(subcategoryId) : null) : existing[0].subcategoryId,
        matchType: matchType !== undefined ? matchType : existing[0].matchType,
        slug: updatedSlug,
        title: title !== undefined ? title : existing[0].title,
        homeTeam: homeTeam !== undefined ? homeTeam : existing[0].homeTeam,
        homeTeamLogo: homeTeamLogo !== undefined ? homeTeamLogo : existing[0].homeTeamLogo,
        awayTeam: awayTeam !== undefined ? awayTeam : existing[0].awayTeam,
        awayTeamLogo: awayTeamLogo !== undefined ? awayTeamLogo : existing[0].awayTeamLogo,
        homeScore: homeScore !== undefined ? (homeScore !== null ? String(homeScore) : null) : existing[0].homeScore,
        awayScore: awayScore !== undefined ? (awayScore !== null ? String(awayScore) : null) : existing[0].awayScore,
        livePeriod: req.body.livePeriod !== undefined ? (req.body.livePeriod ? String(req.body.livePeriod) : null) : existing[0].livePeriod,
        liveMinute: req.body.liveMinute !== undefined ? (req.body.liveMinute ? String(req.body.liveMinute) : null) : existing[0].liveMinute,
        matchTime: matchTime !== undefined ? (matchTime ? new Date(matchTime) : null) : existing[0].matchTime,
        status: status !== undefined ? status : existing[0].status,
        venue: venue !== undefined ? venue : existing[0].venue,
        playerImage: playerImage !== undefined ? playerImage : existing[0].playerImage,
        bgImage: bgImage !== undefined ? bgImage : existing[0].bgImage,
        referralLink: referralLink !== undefined ? referralLink : existing[0].referralLink,
        displayOrder: displayOrder !== undefined ? Number(displayOrder) : existing[0].displayOrder,
        isCustomized: true, // Lock category against sync overwrites!
      })
      .where(eq(matches.id, Number(id)));

    // Auto-activate subcategory if assigned
    if (subcategoryId) {
      await db
        .update(sportsSubcategories)
        .set({ status: true })
        .where(eq(sportsSubcategories.id, Number(subcategoryId)));
    }

    const updated = await db
      .select()
      .from(matches)
      .where(eq(matches.id, Number(id)))
      .limit(1);

    return res.status(200).json({
      success: true,
      message: 'Match updated successfully and subcategory status updated.',
      data: {
        match: updated[0],
      },
    });
  } catch (error) {
    next(error);
  }
};

// Delete Match
const deleteMatch = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { id } = req.params;

    const existing = await db
      .select()
      .from(matches)
      .where(eq(matches.id, Number(id)))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Match with ID ${id} not found.`,
      });
    }

    await db.delete(matches).where(eq(matches.id, Number(id)));

    return res.status(200).json({
      success: true,
      message: 'Match deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

// Reorder Matches
const reorderMatches = async (req, res, next) => {
  try {
    await ensureTableExists();
    const { items } = req.body; // Array of { id, displayOrder }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of items with { id, displayOrder }.',
      });
    }

    for (const item of items) {
      if (item.id && item.displayOrder !== undefined) {
        await db
          .update(matches)
          .set({ displayOrder: Number(item.displayOrder) })
          .where(eq(matches.id, Number(item.id)));
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Matches reordered successfully.',
    });
  } catch (error) {
    next(error);
  }
};

let isSyncingCore = false;

// Midnight 12:00 AM Automated Cleanup Function (with 11:00 PM cutoff rule)
const cleanupMidnightMatchesCore = async (midnightTime = new Date()) => {
  try {
    // 11:00 PM cutoff: exactly 1 hour prior to 12:00 AM midnight
    const cutoff11PM = new Date(midnightTime.getTime() - 60 * 60 * 1000);

    // Rule:
    // 1. Matches must be 'finished'
    // 2. Not customized by admin (isCustomized = false)
    // 3. Finished on or before 11:00 PM:
    //    - matches.updatedAt <= cutoff11PM
    //    - OR matchTime started early enough to finish before 11 PM (matchTime <= cutoff11PM - 2.5 hours)
    // 4. Matches that finished AFTER 11:00 PM (updatedAt > cutoff11PM) are strictly PRESERVED
    //    and will only be removed during the next midnight's cleanup.
    // 5. 'live' or 'upcoming' matches are NEVER deleted.
    const res = await db
      .delete(matches)
      .where(
        and(
          eq(matches.status, 'finished'),
          eq(matches.isCustomized, false),
          or(
            lte(matches.updatedAt, cutoff11PM),
            lte(matches.matchTime, new Date(cutoff11PM.getTime() - 2.5 * 3600 * 1000))
          )
        )
      );

    const deletedCount = res[0]?.affectedRows || 0;
    if (deletedCount > 0) {
      console.log(`🧹 [MIDNIGHT CLEANUP] Cleaned up ${deletedCount} finished matches ended on/before 11:00 PM (${cutoff11PM.toLocaleTimeString()}).`);
    }
    return deletedCount;
  } catch (err) {
    console.error('❌ [MIDNIGHT CLEANUP] Error in cleanupMidnightMatchesCore:', err.message);
    return 0;
  }
};

// Core Sync Function: Syncs Today & Tomorrow, excludes finished matches, skips existing matches, and updates live/upcoming matches
const syncMatchesCore = async () => {
  if (isSyncingCore) {
    return { added: 0, preserved: 0, skipped: true, totalFetched: 0 };
  }
  isSyncingCore = true;

  try {
    await ensureTableExists();

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.valueOf() + 86400000).toISOString().split('T')[0];

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    // 🧹 Clean up only very old obsolete matches (older than 48 hours and finished)
    // Note: Today's and yesterday's matches are handled safely by the midnight 11 PM cutoff scheduler!
    let deletedCount = 0;
    try {
      const obsoleteThreshold = new Date(now.getTime() - 48 * 3600 * 1000);
      const deleteRes = await db
        .delete(matches)
        .where(
          and(
            eq(matches.status, 'finished'),
            eq(matches.isCustomized, false),
            lt(matches.matchTime, obsoleteThreshold)
          )
        );
      deletedCount = deleteRes[0]?.affectedRows || 0;
    } catch (delErr) {
      // ignore
    }

  // 📡 2. Sync Today and Tomorrow ONLY (2 Days)
  const datesToSync = [today, tomorrow];
  let rawEvents = [];

  const apiResponses = await Promise.all(
    datesToSync.map((dateStr) =>
      axios
        .get(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/eventsday.php?d=${dateStr}`, {
          timeout: 10000,
        })
        .then((res) => (res.data && res.data.events ? res.data.events : []))
        .catch(() => [])
    )
  );

  apiResponses.forEach((events) => {
    rawEvents.push(...events);
  });

  if (rawEvents.length === 0) {
    return { added: 0, preserved: 0, deleted: deletedCount, totalFetched: 0 };
  }

  const dbCategories = await db.select().from(sportsCategories);
  const dbSubcategories = await db.select().from(sportsSubcategories);
  const dbMatches = await db.select().from(matches);

  const categoryMap = new Map(dbCategories.map((c) => [c.sportName.toLowerCase().trim(), c]));
  const subcategoryMap = new Map();
  dbSubcategories.forEach((s) => {
    subcategoryMap.set(`${s.categoryId}:${s.name.toLowerCase().trim()}`, s);
    if (!subcategoryMap.has(s.name.toLowerCase().trim())) {
      subcategoryMap.set(s.name.toLowerCase().trim(), s);
    }
  });
  const matchEventMap = new Map(
    dbMatches.filter((m) => m.sportsdbEventId).map((m) => [m.sportsdbEventId, m])
  );
  const matchSlugSet = new Set(dbMatches.map((m) => m.slug));

  let maxOrder = dbMatches.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);
  let addedCount = 0;
  let preservedCount = 0;
  const activeSubcategoryIds = new Set();

  for (const ev of rawEvents) {
    const eventId = ev.idEvent;
    const sportName = (ev.strSport || '').trim();
    const leagueName = (ev.strLeague || '').trim();
    const homeTeam = (ev.strHomeTeam || '').trim();
    const awayTeam = (ev.strAwayTeam || '').trim();
    const eventName = (ev.strEvent || '').trim();
    const eventDateStr = ev.dateEvent || today;

    let matchedCategory = categoryMap.get(sportName.toLowerCase());
    if (!matchedCategory) {
      if (sportName.toLowerCase() === 'american football') {
        matchedCategory = categoryMap.get('nfl') || categoryMap.get('football');
      } else if (sportName.toLowerCase() === 'nfl') {
        matchedCategory = categoryMap.get('american football');
      } else if (sportName.toLowerCase() === 'soccer') {
        matchedCategory = categoryMap.get('football');
      } else if (sportName.toLowerCase().includes('hockey')) {
        matchedCategory = categoryMap.get('ice hockey') || categoryMap.get('hockey');
      } else if (sportName.toLowerCase().includes('baseball')) {
        matchedCategory = categoryMap.get('baseball');
      } else if (sportName.toLowerCase().includes('golf')) {
        matchedCategory = categoryMap.get('golf');
      }
    }

    const lowerLeague = leagueName ? leagueName.toLowerCase() : '';
    let matchedSubcat = (matchedCategory && lowerLeague)
      ? subcategoryMap.get(`${matchedCategory.id}:${lowerLeague}`)
      : null;

    if (!matchedSubcat && lowerLeague) {
      const rawSub = subcategoryMap.get(lowerLeague);
      if (rawSub && (!matchedCategory || rawSub.categoryId === matchedCategory.id)) {
        matchedSubcat = rawSub;
      }
    }

    if (!matchedCategory && matchedSubcat) {
      matchedCategory = dbCategories.find((c) => c.id === matchedSubcat.categoryId);
    }

    if (!matchedCategory) continue;

    const categoryId = matchedCategory.id;
    let subcategoryId = null;

    if (leagueName) {
      // 🛑 Permanent Admin Disable Protection:
      // If this subcategory was disabled (status = false/0) by admin:
      // DO NOT sync or import matches for it until admin explicitly enables it!
      if (matchedSubcat && (matchedSubcat.status === false || matchedSubcat.status === 0)) {
        continue;
      }

      if (!matchedSubcat) {
        try {
          const subcatLogo = ev.strLeagueBadge || ev.strBadge || ev.strLogo || null;
          const [subResult] = await db.insert(sportsSubcategories).values({
            categoryId: categoryId,
            name: leagueName,
            logoUrl: subcatLogo,
            description: null,
            status: true,
            showOnHome: true,
            referralLink: null,
          });

          matchedSubcat = {
            id: subResult.insertId,
            categoryId: categoryId,
            name: leagueName,
            logoUrl: subcatLogo,
            status: true,
          };
          subcategoryMap.set(`${categoryId}:${lowerLeague}`, matchedSubcat);
          subcategoryMap.set(lowerLeague, matchedSubcat);
        } catch (subErr) {
          // ignore
        }
      }

      if (matchedSubcat) {
        subcategoryId = matchedSubcat.id;
        // If existing subcategory has no logo or has an accidental match poster, update with official strLeagueBadge
        const leagueBadge = ev.strLeagueBadge || ev.strBadge || ev.strLogo;
        if (leagueBadge && (!matchedSubcat.logoUrl || matchedSubcat.logoUrl.includes('/event/poster/'))) {
          try {
            await db
              .update(sportsSubcategories)
              .set({ logoUrl: leagueBadge })
              .where(eq(sportsSubcategories.id, matchedSubcat.id));
            matchedSubcat.logoUrl = leagueBadge;
          } catch (updateErr) {
            // ignore
          }
        }
      }
    }

    const isTeamVsTeam = homeTeam && awayTeam;
    const matchType = isTeamVsTeam ? 'team_vs_team' : 'title_event';
    const title = isTeamVsTeam ? null : eventName;

    let matchTimeVal = new Date();
    if (ev.strTimestamp) {
      const ts = ev.strTimestamp.endsWith('Z') || ev.strTimestamp.includes('+') ? ev.strTimestamp : `${ev.strTimestamp}Z`;
      matchTimeVal = new Date(ts);
    } else if (ev.dateEvent) {
      const timePart = ev.strTime || '00:00:00';
      matchTimeVal = new Date(`${ev.dateEvent}T${timePart}Z`);
    }

    const generatedSlug = generateCleanMatchSlug(homeTeam, awayTeam, title, matchTimeVal, eventId);

    let status = 'upcoming';
    const statusStr = (ev.strStatus || '').toLowerCase().trim();

    if (
      statusStr.includes('finished') ||
      statusStr.includes('ft') ||
      statusStr.includes('aet')
    ) {
      status = 'finished';
    } else if (
      statusStr.includes('live') ||
      statusStr.includes('in play') ||
      statusStr.includes('1h') ||
      statusStr.includes('2h') ||
      statusStr.includes('1st') ||
      statusStr.includes('2nd') ||
      statusStr.includes('ht') ||
      statusStr.includes('q1') ||
      statusStr.includes('q2') ||
      statusStr.includes('q3') ||
      statusStr.includes('q4')
    ) {
      status = 'live';
    } else if (matchTimeVal > now) {
      status = 'upcoming';
    } else if (matchTimeVal < new Date(now.getTime() - 4 * 3600 * 1000) && ev.intHomeScore !== null) {
      status = 'finished';
    } else {
      status = 'upcoming';
    }

    const existingMatch = (eventId && matchEventMap.get(eventId)) || dbMatches.find((m) => m.slug === generatedSlug);

    // 🎬 Resolve Media Player Banner & Backdrop 100% from TheSportsDB (Priority: strThumb -> strPoster -> strBanner -> strFanart)
    const eventThumb =
      (ev.strThumb && ev.strThumb.trim()) ||
      (ev.strPoster && ev.strPoster.trim()) ||
      (ev.strBanner && ev.strBanner.trim()) ||
      (ev.strFanart && ev.strFanart.trim()) ||
      null;

    const eventBg =
      (ev.strBanner && ev.strBanner.trim()) ||
      (ev.strFanart && ev.strFanart.trim()) ||
      eventThumb ||
      null;

    if (existingMatch) {
      preservedCount++;
      if (!existingMatch.isCustomized) {
        const newHomeScore = ev.intHomeScore !== null && ev.intHomeScore !== undefined ? String(ev.intHomeScore) : null;
        const newAwayScore = ev.intAwayScore !== null && ev.intAwayScore !== undefined ? String(ev.intAwayScore) : null;
        const updateFields = {};
        let needsUpdate = false;

        // 🎬 100% Ensure Featured Media Player Banner is set from TheSportsDB if missing or empty
        if ((!existingMatch.playerImage || existingMatch.playerImage.trim() === '') && eventThumb) {
          updateFields.playerImage = eventThumb;
          existingMatch.playerImage = eventThumb;
          needsUpdate = true;
        }
        if ((!existingMatch.bgImage || existingMatch.bgImage.trim() === '') && eventBg) {
          updateFields.bgImage = eventBg;
          existingMatch.bgImage = eventBg;
          needsUpdate = true;
        }

        if (status !== existingMatch.status) {
          updateFields.status = status;
          needsUpdate = true;
        }
        if (newHomeScore !== null && newHomeScore !== existingMatch.homeScore) {
          updateFields.homeScore = newHomeScore;
          needsUpdate = true;
        }
        if (newAwayScore !== null && newAwayScore !== existingMatch.awayScore) {
          updateFields.awayScore = newAwayScore;
          needsUpdate = true;
        }
        if (ev.strStatus && ev.strStatus !== existingMatch.livePeriod) {
          updateFields.livePeriod = ev.strStatus;
          needsUpdate = true;
        }
        if (ev.strProgress && ev.strProgress !== existingMatch.liveMinute) {
          updateFields.liveMinute = ev.strProgress;
          needsUpdate = true;
        }

        if (needsUpdate) {
          try {
            await db.update(matches).set(updateFields).where(eq(matches.id, existingMatch.id));
          } catch (e) {}
        }
      }
      continue;
    }

    // ⛔ 1. EXCLUDE FINISHED MATCHES (Do NOT insert newly imported matches if already ended)
    if (status === 'finished') {
      continue;
    }

    // ⛔ 2. EXCLUDE MATCHES OUTSIDE TODAY & TOMORROW
    const endOfTomorrow = new Date(now);
    endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
    endOfTomorrow.setHours(23, 59, 59, 999);

    if (matchTimeVal < startOfToday || matchTimeVal > endOfTomorrow) {
      continue;
    }

    if (subcategoryId) {
      activeSubcategoryIds.add(subcategoryId);
    }

    // Insert new match
    maxOrder++;
    await db.insert(matches).values({
      sportsdbEventId: eventId,
      categoryId: categoryId,
      subcategoryId: subcategoryId,
      matchType: matchType,
      slug: generatedSlug,
      title: title,
      homeTeam: isTeamVsTeam ? homeTeam : null,
      homeTeamLogo: ev.strHomeTeamBadge || null,
      awayTeam: isTeamVsTeam ? awayTeam : null,
      awayTeamLogo: ev.strAwayTeamBadge || null,
      homeScore: ev.intHomeScore !== null && ev.intHomeScore !== undefined ? String(ev.intHomeScore) : null,
      awayScore: ev.intAwayScore !== null && ev.intAwayScore !== undefined ? String(ev.intAwayScore) : null,
      livePeriod: ev.strStatus || null,
      liveMinute: ev.strProgress || null,
      matchTime: matchTimeVal,
      status: status,
      venue: ev.strVenue || null,
      playerImage: eventThumb,
      bgImage: eventBg,
      referralLink: null,
      displayOrder: maxOrder,
      isCustomized: false,
    });

    addedCount++;
  }

    return {
      added: addedCount,
      preserved: preservedCount,
      deleted: deletedCount,
      totalFetched: rawEvents.length,
    };
  } finally {
    isSyncingCore = false;
  }
};

// Express Route Controller: Triggered by Admin "Sync Matches (Today & Tomorrow)" button
const syncMatches = async (req, res, next) => {
  try {
    const result = await syncMatchesCore();
    return res.status(200).json({
      success: true,
      message: `Matches sync completed for Today & Tomorrow! Deleted ${result.deleted} past matches, added ${result.added} new matches, ${result.preserved} matches preserved.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// Daily 12:00 AM (Midnight) Automated Background Scheduler (with 11:00 PM cutoff rule)
const startDaily12AMScheduler = () => {
  const scheduleNextRun = () => {
    const now = new Date();
    const next12AM = new Date();
    next12AM.setHours(0, 0, 0, 0);

    if (now >= next12AM) {
      next12AM.setDate(next12AM.getDate() + 1); // Target next day 12:00 AM (Midnight)
    }

    const delayMs = next12AM.getTime() - now.getTime();
    console.log(`[DAILY SYNC CRON] Next auto-sync scheduled for midnight ${next12AM.toLocaleString()} (in ${(delayMs / 3600000).toFixed(2)} hours).`);

    setTimeout(async () => {
      console.log('⏰ [DAILY SYNC CRON] Triggering automated 12:00 AM (Midnight) daily match sync & cleanup...');
      try {
        // 1. Run midnight cleanup (removes matches finished on or before 11:00 PM)
        await cleanupMidnightMatchesCore(new Date());

        // 2. Sync upcoming matches for today & tomorrow
        const result = await syncMatchesCore();
        console.log('✅ [DAILY SYNC CRON] Automated 12:00 AM sync completed:', result);
      } catch (err) {
        console.error('❌ [DAILY SYNC CRON] Automated sync error:', err.message);
      }
      scheduleNextRun();
    }, delayMs);
  };

  scheduleNextRun();
};

// 10-Minute Periodic Background Match & Score Scheduler
const start10MinSyncScheduler = () => {
  console.log('⏱️ [10-MIN SCHEDULER] Background match & score auto-sync initialized (running every 10 minutes).');

  setInterval(async () => {
    try {
      console.log('🔄 [10-MIN SYNC] Periodic check for new & updated matches from TheSportsDB...');
      const result = await syncMatchesCore();
      if (!result?.skipped) {
        console.log(`✅ [10-MIN SYNC] Sync done: ${result?.added || 0} new added, ${result?.preserved || 0} updated/preserved.`);
      }
      // Also sync live scores for currently ongoing matches
      await syncLiveScoresWithSportsDB();
    } catch (err) {
      console.error('⚠️ [10-MIN SYNC] Periodic sync warning:', err.message);
    }
  }, 10 * 60 * 1000); // 10 minutes = 600,000 ms
};

// Express Route Controller: Delete/Clear ALL matches from database
const deleteAllMatches = async (req, res, next) => {
  try {
    await ensureTableExistsOnce();
    const connection = await pool.getConnection();
    await connection.query('DELETE FROM `matches`;');
    await connection.query('UPDATE `sports_subcategories` SET `status` = 0;');
    connection.release();

    return res.status(200).json({
      success: true,
      message: 'All match data removed successfully! Subcategories status reset.',
    });
  } catch (error) {
    next(error);
  }
};

// Reusable function to repair any matches that have missing subcategories
const repairMatchesMissingSubcategoryCore = async () => {
  try {
    const matchesWithoutSubcat = await db
      .select({
        id: matches.id,
        sportsdbEventId: matches.sportsdbEventId,
        categoryId: matches.categoryId,
        homeTeam: matches.homeTeam,
        awayTeam: matches.awayTeam,
      })
      .from(matches)
      .where(
        and(
          isNull(matches.subcategoryId),
          sql`${matches.sportsdbEventId} IS NOT NULL AND ${matches.sportsdbEventId} != ''`
        )
      )
      .limit(100);

    if (matchesWithoutSubcat.length === 0) {
      return { repairedCount: 0 };
    }

    console.log(`🔧 [REPAIR] Found ${matchesWithoutSubcat.length} matches with missing subcategory. Starting repair...`);

    const dbCategories = await db.select().from(sportsCategories);
    const dbSubcategories = await db.select().from(sportsSubcategories);
    const subcategoryMap = new Map(
      dbSubcategories.map((s) => [s.name.toLowerCase().trim(), s])
    );

    let repairedCount = 0;

    for (const match of matchesWithoutSubcat) {
      try {
        const evRes = await axios.get(
          `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/lookupevent.php?id=${match.sportsdbEventId}`,
          { timeout: 5000 }
        );
        const ev = evRes.data?.events?.[0];
        if (!ev) continue;

        const leagueName = ev.strLeague?.trim();
        const sportName = ev.strSport?.trim();
        if (!leagueName) continue;

        const matchedCat = resolveCategoryForLiveMatch(sportName, leagueName, dbCategories);
        if (!matchedCat) continue;
        let targetCatId = matchedCat.id;
        const subcatId = await resolveOrCreateSubcategory(targetCatId, leagueName, ev.idLeague, subcategoryMap);

        const resolvedSub = subcategoryMap.get(leagueName.toLowerCase());
        if (resolvedSub && resolvedSub.categoryId) {
          targetCatId = resolvedSub.categoryId;
        }

        if (subcatId) {
          await db
            .update(matches)
            .set({
              subcategoryId: subcatId,
              categoryId: targetCatId,
            })
            .where(eq(matches.id, match.id));
          repairedCount++;
        }
      } catch (itemErr) {
        // continue
      }
    }

    if (repairedCount > 0) {
      console.log(`✅ [REPAIR] Successfully repaired ${repairedCount} matches with their official subcategories!`);
    }

    return { repairedCount };
  } catch (err) {
    console.error('❌ [REPAIR] Error repairing matches with missing subcategories:', err.message);
    return { repairedCount: 0 };
  }
};

module.exports = {
  getMatches,
  getBannerMatches,
  getLiveScores,
  getMatchById,
  createMatch,
  updateMatch,
  deleteMatch,
  deleteAllMatches,
  reorderMatches,
  syncMatches,
  syncMatchesCore,
  cleanupMidnightMatchesCore,
  repairMatchesMissingSubcategoryCore,
  startDaily12AMScheduler,
  startDaily4AMScheduler: startDaily12AMScheduler,
  start10MinSyncScheduler,
};
