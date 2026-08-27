const { eq, asc, desc, and, or, sql } = require('drizzle-orm');
const axios = require('axios');
const { db, pool, ensureDatabaseExists } = require('../db');
const { matches, sportsCategories, sportsSubcategories } = require('../db/schema');
const { SPORTSDB_API_KEY } = require('../services/sportsDbService');

// Helper to generate clean URL slug
const slugify = (text) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
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
    await connection.query(`ALTER TABLE \`matches\` ADD COLUMN \`live_period\` VARCHAR(50);`);
  } catch (e) {}

  // AUTO-ACTIVATE: Turn ON status (status = 1) for all subcategories that have matches assigned!
  try {
    await connection.query(`
      UPDATE \`sports_subcategories\` 
      SET \`status\` = 1 
      WHERE \`id\` IN (SELECT DISTINCT \`subcategory_id\` FROM \`matches\` WHERE \`subcategory_id\` IS NOT NULL);
    `);
  } catch (e) {
    // ignore
  }

  connection.release();
};

let isTableChecked = false;
const ensureTableExistsOnce = async () => {
  if (isTableChecked) return;
  try {
    await ensureTableExists();
    isTableChecked = true;
  } catch (e) {
    // retry next time
  }
};

// Get All Matches (with status tab, category filter, search)
const getMatches = async (req, res, next) => {
  try {
    await ensureTableExistsOnce();
    const { status, categoryId, subcategoryId, page, limit } = req.query;

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
        categoryThumbUrl: sportsCategories.thumbUrl,
        categoryReferralLink: sportsCategories.referralLink,
        subcategoryName: sportsSubcategories.name,
        subcategoryLogo: sportsSubcategories.logoUrl,
      })
      .from(matches)
      .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
      .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id));

    const conditions = [];

    if (status && ['upcoming', 'live', 'finished'].includes(status)) {
      conditions.push(eq(matches.status, status));
    }
    if (categoryId && categoryId !== 'all') {
      conditions.push(eq(matches.categoryId, Number(categoryId)));
    }
    if (subcategoryId && subcategoryId !== 'all') {
      conditions.push(eq(matches.subcategoryId, Number(subcategoryId)));
    }

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

let lastLiveSyncTime = 0;

const syncLiveScoresWithSportsDB = async () => {
  const now = Date.now();
  if (now - lastLiveSyncTime < 20000) return;
  lastLiveSyncTime = now;

  try {
    const res = await fetch('https://www.thesportsdb.com/api/v1/json/3/livescore.php');
    const data = await res.json();
    if (!data.livescore || !Array.isArray(data.livescore)) return;

    for (const item of data.livescore) {
      if (!item.strHomeTeam || !item.strAwayTeam) continue;

      const statusStr = (item.strStatus || '').toLowerCase().trim();
      let targetStatus = 'upcoming';
      if (statusStr === 'ft' || statusStr === 'finished' || statusStr === 'aet') {
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
        statusStr.includes('q4')
      ) {
        targetStatus = 'live';
      } else if (statusStr === 'ns' || statusStr === 'not started' || statusStr.includes('sched')) {
        targetStatus = 'upcoming';
      }

      const homeScoreVal = item.intHomeScore !== null && item.intHomeScore !== undefined ? String(item.intHomeScore) : null;
      const awayScoreVal = item.intAwayScore !== null && item.intAwayScore !== undefined ? String(item.intAwayScore) : null;

      try {
        await db
          .update(matches)
          .set({
            homeScore: homeScoreVal,
            awayScore: awayScoreVal,
            livePeriod: item.strStatus || null,
            liveMinute: item.strProgress || null,
            status: targetStatus,
          })
          .where(
            and(
              eq(matches.isCustomized, false),
              or(
                eq(matches.sportsdbEventId, item.idEvent),
                and(
                  sql`LOWER(${matches.homeTeam}) LIKE ${'%' + item.strHomeTeam.toLowerCase() + '%'}`,
                  sql`LOWER(${matches.awayTeam}) LIKE ${'%' + item.strAwayTeam.toLowerCase() + '%'}`
                )
              )
            )
          );
      } catch (e) {}
    }
  } catch (err) {
    // silent catch
  }
};

// Get Live Scores, Period & Live Minute Only (Lightweight Polling Endpoint for Real-Time Live Sync)
const getLiveScores = async (req, res, next) => {
  try {
    // Auto-sync with SportsDB live score feed (throttled 20s)
    await syncLiveScoresWithSportsDB();

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
      .where(eq(matches.status, 'live'));

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
    const isNum = !isNaN(Number(id));

    const found = await db
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
        categoryThumbUrl: sportsCategories.thumbUrl,
        categoryReferralLink: sportsCategories.referralLink,
        subcategoryName: sportsSubcategories.name,
        subcategoryLogo: sportsSubcategories.logoUrl,
      })
      .from(matches)
      .leftJoin(sportsCategories, eq(matches.categoryId, sportsCategories.id))
      .leftJoin(sportsSubcategories, eq(matches.subcategoryId, sportsSubcategories.id))
      .where(isNum ? eq(matches.id, Number(id)) : eq(matches.slug, id))
      .limit(1);

    if (found.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Match with ID or slug "${id}" not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        match: found[0],
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

// Auto-Sync Matches from TheSportsDB (Yesterday, Today, Tomorrow) & Auto-Activate Subcategories
const syncMatches = async (req, res, next) => {
  try {
    await ensureTableExists();

    // Calculate dates: Yesterday, Today, Tomorrow
    const now = new Date();
    const yesterday = new Date(now.valueOf() - 86400000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    const tomorrow = new Date(now.valueOf() + 86400000).toISOString().split('T')[0];

    const datesToSync = [yesterday, today, tomorrow];
    let rawEvents = [];

    // Fetch 3 days of events from TheSportsDB in parallel
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
      return res.status(200).json({
        success: true,
        message: 'No events returned from TheSportsDB for Yesterday, Today, or Tomorrow.',
        data: { added: 0, updated: 0, preserved: 0 },
      });
    }

    // Fetch existing Categories & Subcategories from DB
    const dbCategories = await db.select().from(sportsCategories);
    const dbSubcategories = await db.select().from(sportsSubcategories);
    const dbMatches = await db.select().from(matches);

    const categoryMap = new Map(dbCategories.map((c) => [c.sportName.toLowerCase().trim(), c]));
    const subcategoryMap = new Map(dbSubcategories.map((s) => [s.name.toLowerCase().trim(), s]));
    const matchEventMap = new Map(
      dbMatches.filter((m) => m.sportsdbEventId).map((m) => [m.sportsdbEventId, m])
    );

    let maxOrder = dbMatches.reduce((max, item) => Math.max(max, item.displayOrder || 0), 0);
    let addedCount = 0;
    let updatedCount = 0;
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

      // Find or match category
      const matchedCategory = categoryMap.get(sportName.toLowerCase());
      if (!matchedCategory) continue; // Only import events for sports categories present in DB!

      const categoryId = matchedCategory.id;
      const matchedSubcat = subcategoryMap.get(leagueName.toLowerCase());
      const subcategoryId = matchedSubcat ? matchedSubcat.id : null;

      if (subcategoryId) {
        activeSubcategoryIds.add(subcategoryId);
      }

      // Determine match type
      const isTeamVsTeam = homeTeam && awayTeam;
      const matchType = isTeamVsTeam ? 'team_vs_team' : 'title_event';
      const title = isTeamVsTeam ? null : eventName;
      const generatedSlug = isTeamVsTeam
        ? slugify(`${homeTeam}-vs-${awayTeam}-${eventDateStr}`)
        : slugify(`${eventName}-${eventDateStr}`);

      // Determine match time strictly in UTC
      let matchTimeVal = new Date();
      if (ev.strTimestamp) {
        const ts = ev.strTimestamp.endsWith('Z') || ev.strTimestamp.includes('+') ? ev.strTimestamp : `${ev.strTimestamp}Z`;
        matchTimeVal = new Date(ts);
      } else if (ev.dateEvent) {
        const timePart = ev.strTime || '00:00:00';
        matchTimeVal = new Date(`${ev.dateEvent}T${timePart}Z`);
      }

      const now = new Date();

      // Determine status strictly based on real match status & time
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

      // Check if match already exists in DB
      const existingMatch = matchEventMap.get(eventId);

      if (existingMatch) {
        // ADMIN LOCK PROTECTION: If admin customized this match, DO NOT overwrite!
        if (existingMatch.isCustomized) {
          preservedCount++;
          continue;
        }

        // Update existing match from SportsDB
        await db
          .update(matches)
          .set({
            slug: existingMatch.slug || generatedSlug,
            matchTime: matchTimeVal,
            homeScore: ev.intHomeScore !== null && ev.intHomeScore !== undefined ? String(ev.intHomeScore) : existingMatch.homeScore,
            awayScore: ev.intAwayScore !== null && ev.intAwayScore !== undefined ? String(ev.intAwayScore) : existingMatch.awayScore,
            livePeriod: ev.strStatus || existingMatch.livePeriod,
            liveMinute: ev.strProgress || existingMatch.liveMinute,
            homeTeamLogo: ev.strHomeTeamBadge || existingMatch.homeTeamLogo,
            awayTeamLogo: ev.strAwayTeamBadge || existingMatch.awayTeamLogo,
            status: status,
            venue: ev.strVenue || existingMatch.venue,
            playerImage: ev.strThumb || existingMatch.playerImage,
          })
          .where(eq(matches.id, existingMatch.id));

        updatedCount++;
      } else {
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
          playerImage: ev.strThumb || null,
          bgImage: ev.strBanner || null,
          referralLink: null,
          displayOrder: maxOrder,
          isCustomized: false,
        });

        addedCount++;
      }
    }

    // Auto-activate all subcategories that have matches!
    if (activeSubcategoryIds.size > 0) {
      for (const subId of Array.from(activeSubcategoryIds)) {
        await db
          .update(sportsSubcategories)
          .set({ status: true })
          .where(eq(sportsSubcategories.id, subId));
      }
    }

    return res.status(200).json({
      success: true,
      message: `Matches sync completed! Added: ${addedCount}, Updated: ${updatedCount}, Preserved: ${preservedCount}. Subcategories with active matches were automatically turned ON!`,
      data: {
        added: addedCount,
        updated: updatedCount,
        preserved: preservedCount,
        activatedSubcategories: activeSubcategoryIds.size,
        totalFetched: rawEvents.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMatches,
  getMatchById,
  getLiveScores,
  createMatch,
  updateMatch,
  deleteMatch,
  reorderMatches,
  syncMatches,
};
