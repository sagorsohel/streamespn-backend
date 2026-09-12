const axios = require('axios');
const { db } = require('./src/db');
const { sportsCategories, sportsSubcategories } = require('./src/db/schema');
const { eq } = require('drizzle-orm');
const { SPORTSDB_API_KEY } = require('./src/services/sportsDbService');

const normalizeText = (text) => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const fixSubcategoryLogos = async () => {
  console.log('🚀 [LOGO REPAIR] Starting subcategory logo repair from TheSportsDB...');

  try {
    const categories = await db.select().from(sportsCategories);
    const subcats = await db.select().from(sportsSubcategories);

    console.log(`📋 Found ${categories.length} categories and ${subcats.length} subcategories in database.`);

    // Build lookup maps for subcategories
    const subcatMapExact = new Map();
    const subcatMapNorm = new Map();

    subcats.forEach((s) => {
      subcatMapExact.set(s.name.toLowerCase().trim(), s);
      subcatMapNorm.set(normalizeText(s.name), s);
    });

    // Special custom aliases for leagues with slightly different naming on TheSportsDB
    const specialAliases = {
      'colombia categoria primera a': 'Colombian Liga DIMAYOR',
      'colombian categoria primera b': 'Colombian Torneo DIMAYOR',
      'mexican primera league': 'Mexican Liga BBVA MX',
      'russian football national league': 'Russian Football National League',
      'lithuanian a lyga': 'Lithuanian A Lyga',
      'welsh premier league': 'Welsh Premier League',
      'nascar xfinity series': 'NASCAR Xfinity Series',
      'france premiere ligue': 'French Première Ligue',
    };

    let updatedCount = 0;
    const leagueBadgeMap = new Map();

    for (const cat of categories) {
      try {
        const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}/search_all_leagues.php?s=${encodeURIComponent(cat.sportName)}`;
        const res = await axios.get(url, { timeout: 10000 });
        const list = res.data?.countries || res.data?.countrys || res.data?.leagues || [];

        for (const item of list) {
          const leagueName = item.strLeague?.trim();
          if (!leagueName) continue;

          // Official badge is priority, then strLogo
          const badgeUrl = item.strBadge || item.strLogo || null;
          if (badgeUrl) {
            leagueBadgeMap.set(leagueName.toLowerCase(), badgeUrl);
            leagueBadgeMap.set(normalizeText(leagueName), badgeUrl);
          }
        }
      } catch (err) {
        console.error(`⚠️ Error fetching leagues for "${cat.sportName}":`, err.message);
      }
    }

    console.log(`📦 Loaded ${leagueBadgeMap.size} league badges from TheSportsDB.`);

    for (const s of subcats) {
      const lowerName = s.name.toLowerCase().trim();
      const normName = normalizeText(s.name);

      let realBadge = leagueBadgeMap.get(lowerName) || leagueBadgeMap.get(normName);

      if (!realBadge && specialAliases[lowerName]) {
        const alias = specialAliases[lowerName];
        realBadge = leagueBadgeMap.get(alias.toLowerCase()) || leagueBadgeMap.get(normalizeText(alias));
      }

      // If real badge is found and differs from current logoUrl (or current is poster/null)
      if (realBadge && s.logoUrl !== realBadge) {
        await db
          .update(sportsSubcategories)
          .set({ logoUrl: realBadge })
          .where(eq(sportsSubcategories.id, s.id));

        updatedCount++;
        if (s.name === 'NFL' || s.name.includes('Major League Soccer') || updatedCount <= 10) {
          console.log(`✅ [UPDATED] "${s.name}" (ID: ${s.id}) -> ${realBadge}`);
        }
      } else if (!realBadge && s.logoUrl && s.logoUrl.includes('/event/poster/')) {
        // If it still has an event poster and no real badge was found, clear the event poster so it doesn't display match posters as logos
        await db
          .update(sportsSubcategories)
          .set({ logoUrl: null })
          .where(eq(sportsSubcategories.id, s.id));
        console.log(`🧹 [CLEARED POSTER] "${s.name}" (ID: ${s.id}) event poster removed.`);
      }
    }

    console.log(`\n🎉 [LOGO REPAIR FINISHED] Successfully updated ${updatedCount} subcategory logos!`);

    // Verify NFL and MLS specifically
    const nfl = await db.select().from(sportsSubcategories).where(eq(sportsSubcategories.id, 2));
    console.log('NFL subcategory state:', nfl[0]);
    const mls = await db.select().from(sportsSubcategories).where(eq(sportsSubcategories.id, 44));
    console.log('MLS subcategory state:', mls[0]);

    process.exit(0);
  } catch (err) {
    console.error('❌ [LOGO REPAIR ERROR]:', err);
    process.exit(1);
  }
};

fixSubcategoryLogos();
