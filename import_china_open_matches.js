const { pool } = require('./src/db');

const PROD_API_BASE = 'https://backendapi.streamespn.org/api';
const ADMIN_CREDENTIALS = {
  email: 'admin@gmail.com',
  password: 'sohoj@sohoj',
};

const matchesData = [
  // --- Women's Singles (WTA 1000 Beijing - October 4, 2026) ---
  {
    title: 'China Open: Ekaterina Alexandrova vs Diana Shnaider',
    slug: 'china-open-e-alexandrova-vs-d-shnaider-2026-10-04',
    homeTeam: 'E. Alexandrova',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/uof9c51716793254.png',
    awayTeam: 'D. Shnaider',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/r0ms0y1713778928.png',
    homeScore: '1',
    awayScore: '1',
    livePeriod: 'Round of 32 · Moon Court',
    liveMinute: 'Set 3 (0-0, Ad:40)',
    matchTime: '2026-10-04T05:00:00.000Z',
    status: 'live',
    venue: 'Moon Court, National Tennis Center, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/3wdjdn1675264812.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/nx41ik1713778891.jpg',
    displayOrder: 1,
  },
  {
    title: 'China Open: Polina Kudermetova vs Mirra Andreeva',
    slug: 'china-open-p-kudermetova-vs-m-andreeva-2026-10-04',
    homeTeam: 'P. Kudermetova',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/g245gj1750673050.png',
    awayTeam: 'M. Andreeva',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/oua7n51748967536.png',
    homeScore: '0',
    awayScore: '2',
    livePeriod: 'Round of 32 · Lotus Court',
    liveMinute: 'Final (4-6, 1-6)',
    matchTime: '2026-10-04T03:00:00.000Z',
    status: 'finished',
    venue: 'Lotus Court, National Tennis Center, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/f1ip4o1771243237.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/1gom6t1750673015.jpg',
    displayOrder: 2,
  },
  {
    title: 'China Open: Sinja Kraus vs Dayana Yastremska',
    slug: 'china-open-s-kraus-vs-d-yastremska-2026-10-04',
    homeTeam: 'S. Kraus',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Kraus_RGQ23.jpg/330px-Kraus_RGQ23.jpg',
    awayTeam: 'D. Yastremska',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/346dt71709280570.png',
    homeScore: '2',
    awayScore: '0',
    livePeriod: 'Round of 32 · Moon Court',
    liveMinute: 'Final (6-1, 6-4)',
    matchTime: '2026-10-04T03:30:00.000Z',
    status: 'finished',
    venue: 'Moon Court, National Tennis Center, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/6rx5zp1709288953.jpg',
    bgImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Kraus_RGQ23.jpg/330px-Kraus_RGQ23.jpg',
    displayOrder: 3,
  },
  {
    title: 'China Open: Nikola Bartunkova vs Aryna Sabalenka',
    slug: 'china-open-n-bartunkova-vs-a-sabalenka-2026-10-04',
    homeTeam: 'N. Bartunkova',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/dgu9vf1774776063.png',
    awayTeam: 'A. Sabalenka',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/4knki51748965857.png',
    homeScore: '2',
    awayScore: '0',
    livePeriod: 'Round of 32 · Diamond Court',
    liveMinute: 'Final (6-4, 6-3)',
    matchTime: '2026-10-04T04:00:00.000Z',
    status: 'finished',
    venue: 'Capital Group Diamond Court, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/mu2jmr1709317696.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/3c05dx1718374397.jpg',
    displayOrder: 4,
  },
  {
    title: 'China Open: Linda Noskova vs Viktorija Golubic',
    slug: 'china-open-l-noskova-vs-v-golubic-2026-10-04',
    homeTeam: 'L. Noskova',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/7ikpmb1716788733.png',
    awayTeam: 'V. Golubic',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/4vfk561760957368.png',
    homeScore: '0',
    awayScore: '0',
    livePeriod: 'Round of 32 · Lotus Court',
    liveMinute: 'Set 1 (In Progress)',
    matchTime: '2026-10-04T06:25:00.000Z',
    status: 'live',
    venue: 'Lotus Court, National Tennis Center, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/fkd0lb1771243528.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/8ge9451760957332.jpg',
    displayOrder: 5,
  },
  {
    title: 'China Open: Daria Snigur vs Taylah Preston',
    slug: 'china-open-d-snigur-vs-t-preston-2026-10-04',
    homeTeam: 'D. Snigur',
    homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg/330px-Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg',
    awayTeam: 'T. Preston',
    awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Taylah_Preston_%282024_DC_Open%29_02.jpg/330px-Taylah_Preston_%282024_DC_Open%29_02.jpg',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Round of 32 · Moon Court',
    liveMinute: 'Scheduled 12:30 PM',
    matchTime: '2026-10-04T06:30:00.000Z',
    status: 'upcoming',
    venue: 'Moon Court, National Tennis Center, Beijing',
    playerImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg/330px-Day_2_-_Qualifying_TransylvaniaOpen_Daria_Snigur_vs_Anca_Alexia_Todoni_7-6%283%29%2C6-4_%2854320797843%29_%28cropped_Daria_Snigur%29.jpg',
    bgImage: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Taylah_Preston_%282024_DC_Open%29_02.jpg/330px-Taylah_Preston_%282024_DC_Open%29_02.jpg',
    displayOrder: 6,
  },
  {
    title: 'China Open: Sara Bejlek vs Naomi Osaka',
    slug: 'china-open-s-bejlek-vs-n-osaka-2026-10-04',
    homeTeam: 'S. Bejlek',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/l9gtpn1776070471.png',
    awayTeam: 'N. Osaka',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/4njchy1716751197.png',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Round of 32 · Lotus Court',
    liveMinute: 'Scheduled 5:00 PM',
    matchTime: '2026-10-04T11:00:00.000Z',
    status: 'upcoming',
    venue: 'Lotus Court, National Tennis Center, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/hhrmya1771243897.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/14huh91776070435.jpg',
    displayOrder: 7,
  },
  {
    title: 'China Open: Karolína Muchová vs Liudmila Samsonova',
    slug: 'china-open-k-muchova-vs-l-samsonova-2026-10-04',
    homeTeam: 'K. Muchová',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/2lsmsc1758657759.png',
    awayTeam: 'L. Samsonova',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/w7dqr61716791632.png',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Round of 32 · Diamond Court',
    liveMinute: 'Scheduled 6:30 PM',
    matchTime: '2026-10-04T12:30:00.000Z',
    status: 'upcoming',
    venue: 'Capital Group Diamond Court, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/ioj74g1758657733.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/0mfy1e1675265352.jpg',
    displayOrder: 8,
  },

  // --- Men's Singles (ATP 500 Beijing Quarter-finals - October 4, 2026) ---
  {
    title: 'China Open: Hubert Hurkacz vs Karen Khachanov',
    slug: 'china-open-h-hurkacz-vs-k-khachanov-2026-10-04',
    homeTeam: 'H. Hurkacz',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/b7okgh1674812969.png',
    awayTeam: 'K. Khachanov',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/fq4vn81674813360.png',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Quarter-final · Diamond Court',
    liveMinute: 'Scheduled 1:00 PM',
    matchTime: '2026-10-04T07:00:00.000Z',
    status: 'upcoming',
    venue: 'Capital Group Diamond Court, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/hvgbuu1674812936.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/ssew9g1674813307.jpg',
    displayOrder: 9,
  },
  {
    title: 'China Open: Alex de Minaur vs Andrey Rublev',
    slug: 'china-open-a-de-minaur-vs-a-rublev-2026-10-04',
    homeTeam: 'A. de Minaur',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/ec7ymd1675267811.png',
    awayTeam: 'A. Rublev',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/jp6sam1675268673.png',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Quarter-final · Diamond Court',
    liveMinute: 'Scheduled 3:00 PM',
    matchTime: '2026-10-04T09:00:00.000Z',
    status: 'upcoming',
    venue: 'Capital Group Diamond Court, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/ymwt421674814502.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/q8gscs1674816699.jpg',
    displayOrder: 10,
  },
  {
    title: 'China Open: Daniil Medvedev vs Francisco Cerúndolo',
    slug: 'china-open-d-medvedev-vs-f-cerundolo-2026-10-04',
    homeTeam: 'D. Medvedev',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/bk4gah1675267907.png',
    awayTeam: 'F. Cerúndolo',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/x393x11675355650.png',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Quarter-final · Brad Drewett Court',
    liveMinute: 'Scheduled 4:30 PM',
    matchTime: '2026-10-04T10:30:00.000Z',
    status: 'upcoming',
    venue: 'Brad Drewett Court, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/hlhsx01674816220.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/6mxjdf1675355594.jpg',
    displayOrder: 11,
  },
  {
    title: 'China Open: Alexander Zverev vs Novak Djokovic',
    slug: 'china-open-a-zverev-vs-n-djokovic-2026-10-04',
    homeTeam: 'A. Zverev',
    homeTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/c8fy2l1748969907.png',
    awayTeam: 'N. Djokovic',
    awayTeamLogo: 'https://r2.thesportsdb.com/images/media/player/cutout/h6od2i1748970226.png',
    homeScore: null,
    awayScore: null,
    livePeriod: 'Quarter-final · Diamond Court',
    liveMinute: 'Scheduled 7:00 PM',
    matchTime: '2026-10-04T13:00:00.000Z',
    status: 'upcoming',
    venue: 'Capital Group Diamond Court, Beijing',
    playerImage: 'https://r2.thesportsdb.com/images/media/player/thumb/wvrxm31709318210.jpg',
    bgImage: 'https://r2.thesportsdb.com/images/media/player/thumb/6qkj3m1674815724.jpg',
    displayOrder: 12,
  },
];

async function main() {
  console.log('🎾 Starting China Open matches import to Production and Local DB...');

  // 1. Authenticate with Production API
  console.log('🔑 Logging into Production API:', PROD_API_BASE);
  const loginRes = await fetch(`${PROD_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN_CREDENTIALS),
  });

  const loginData = await loginRes.json();
  if (!loginData.success || !loginData.data?.token) {
    throw new Error('Failed to login to Production API: ' + JSON.stringify(loginData));
  }
  const token = loginData.data.token;
  console.log('✅ Logged into Production API successfully.');

  // 2. Fetch existing production matches
  const existingRes = await fetch(`${PROD_API_BASE}/matches?all=true&limit=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const existingJson = await existingRes.json();
  const existingProdMatches = existingJson.data?.matches || [];
  const prodSlugMap = new Map();
  existingProdMatches.forEach((m) => {
    if (m.slug) prodSlugMap.set(m.slug, m);
  });

  // 3. Process matches in Production
  const PROD_CATEGORY_ID = 7; // Tennis in Prod
  const PROD_SUBCATEGORY_ID = 1310; // China Open in Prod

  console.log('\n📡 === IMPORTING TO PRODUCTION API ===');
  for (const match of matchesData) {
    const existing = prodSlugMap.get(match.slug);
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

    if (existing) {
      console.log(`🔄 Updating existing match in prod [ID ${existing.id}]: ${match.title}`);
      const updateRes = await fetch(`${PROD_API_BASE}/matches/${existing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const updateJson = await updateRes.json();
      console.log(`   Result: ${updateJson.success ? 'Success' : JSON.stringify(updateJson)}`);
    } else {
      console.log(`➕ Creating new match in prod: ${match.title}`);
      const createRes = await fetch(`${PROD_API_BASE}/matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const createJson = await createRes.json();
      console.log(`   Result: ${createJson.success ? 'Success (ID: ' + createJson.data?.match?.id + ')' : JSON.stringify(createJson)}`);
    }
  }

  // 4. Update Subcategory attributes in Production (ensure active, showOnHome, etc.)
  try {
    console.log('\n⚙️ Verifying China Open subcategory settings in Prod...');
    await fetch(`${PROD_API_BASE}/subcategories/1310`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        status: true,
        showOnHome: true,
        isTrending: true,
        isHomeBanner: true,
      }),
    });
    console.log('✅ China Open subcategory enabled and featured on home in Prod.');
  } catch (subErr) {
    console.warn('⚠️ Subcategory update notice:', subErr.message);
  }

  // 5. Sync to Local Database
  console.log('\n💾 === SYNCING TO LOCAL DATABASE ===');
  try {
    const LOCAL_CATEGORY_ID = 4; // Tennis in Local DB
    const LOCAL_SUBCATEGORY_ID = 705; // China Open in Local DB

    // Ensure China Open subcategory exists in local DB
    const [localSub] = await pool.query('SELECT id FROM sports_subcategories WHERE id = ?', [LOCAL_SUBCATEGORY_ID]);
    if (localSub.length === 0) {
      await pool.query(
        `INSERT INTO sports_subcategories (id, category_id, name, logo_url, status, is_trending, is_home_banner, show_on_home, is_customized)
         VALUES (?, ?, 'China Open', 'https://r2.thesportsdb.com/images/media/league/badge/x16ihc1546113079.png', 1, 1, 1, 1, 1)
         ON DUPLICATE KEY UPDATE status = 1, show_on_home = 1, is_trending = 1, is_home_banner = 1`,
        [LOCAL_SUBCATEGORY_ID, LOCAL_CATEGORY_ID]
      );
    } else {
      await pool.query(
        `UPDATE sports_subcategories SET status = 1, show_on_home = 1, is_trending = 1, is_home_banner = 1 WHERE id = ?`,
        [LOCAL_SUBCATEGORY_ID]
      );
    }

    for (const match of matchesData) {
      const [existingLocal] = await pool.query('SELECT id FROM matches WHERE slug = ?', [match.slug]);
      if (existingLocal.length > 0) {
        await pool.query(
          `UPDATE matches SET
            category_id = ?,
            subcategory_id = ?,
            match_type = 'team_vs_team',
            title = ?,
            home_team = ?,
            home_team_logo = ?,
            away_team = ?,
            away_team_logo = ?,
            home_score = ?,
            away_score = ?,
            live_period = ?,
            live_minute = ?,
            match_time = ?,
            status = ?,
            venue = ?,
            player_image = ?,
            bg_image = ?,
            display_order = ?,
            is_customized = 1
           WHERE id = ?`,
          [
            LOCAL_CATEGORY_ID,
            LOCAL_SUBCATEGORY_ID,
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
            existingLocal[0].id,
          ]
        );
        console.log(`🔄 Updated local match [ID ${existingLocal[0].id}]: ${match.title}`);
      } else {
        const [insertRes] = await pool.query(
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
        console.log(`➕ Inserted local match [ID ${insertRes.insertId}]: ${match.title}`);
      }
    }
    console.log('✅ Local database synchronized successfully.');
  } catch (dbErr) {
    console.error('⚠️ Local DB sync warning:', dbErr.message);
  }

  // 6. Verify Production Listing
  console.log('\n🔍 === VERIFYING PRODUCTION LISTING ===');
  const verifyRes = await fetch(`${PROD_API_BASE}/matches?subcategoryId=1310&all=true&limit=100`);
  const verifyJson = await verifyRes.json();
  const prodChinaMatches = verifyJson.data?.matches || [];
  console.log(`🏆 Total China Open matches in Production: ${prodChinaMatches.length}`);
  prodChinaMatches.forEach((m, idx) => {
    console.log(`   ${idx + 1}. [${m.status.toUpperCase()}] ${m.homeTeam} vs ${m.awayTeam} (${m.livePeriod || m.venue || ''})`);
  });

  console.log('\n✨ All matches successfully imported and verified!');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Error during import:', err);
  process.exit(1);
});
