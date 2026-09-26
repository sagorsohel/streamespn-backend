const { eq } = require('drizzle-orm');
const { db, pool, ensureDatabaseExists } = require('../db');
const { adsSettings } = require('../db/schema');

// Helper to ensure ads_settings table exists
const ensureTableExists = async () => {
  await ensureDatabaseExists();
  const connection = await pool.getConnection();
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`ads_settings\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`head_ads\` TEXT,
      \`nav_ads\` TEXT,
      \`modal_signup_ads\` TEXT,
      \`footer_ads\` TEXT,
      \`float_mobile_ads\` TEXT,
      \`float_desktop_ads\` TEXT,
      \`histats_script\` TEXT,
      \`membership_referral_link\` TEXT,
      \`global_sign_in_referral_link\` TEXT,
      \`is_head_ads_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Ensure column is_head_ads_enabled exists
  try {
    const [cols] = await connection.query(`SHOW COLUMNS FROM \`ads_settings\` LIKE 'is_head_ads_enabled';`);
    if (cols.length === 0) {
      await connection.query(`ALTER TABLE \`ads_settings\` ADD COLUMN \`is_head_ads_enabled\` TINYINT(1) NOT NULL DEFAULT 1;`);
    }
  } catch (e) {
    // column might already exist
  }

  // Ensure column header_scripts exists
  try {
    const [cols] = await connection.query(`SHOW COLUMNS FROM \`ads_settings\` LIKE 'header_scripts';`);
    if (cols.length === 0) {
      await connection.query(`ALTER TABLE \`ads_settings\` ADD COLUMN \`header_scripts\` MEDIUMTEXT;`);
    }
  } catch (e) {
    // column might already exist
  }

  // Ensure row ID 1 exists
  const [rows] = await connection.query(`SELECT * FROM \`ads_settings\` WHERE \`id\` = 1;`);
  if (rows.length === 0) {
    await connection.query(`INSERT INTO \`ads_settings\` (\`id\`) VALUES (1);`);
  }

  connection.release();
};

let cachedAdsSettings = null;
let isTableInitialized = false;

// Helper to format ads settings with headerScripts array support
const formatAdsSettings = (settings) => {
  if (!settings) return null;

  let headerScripts = [];
  if (settings.headerScripts) {
    if (Array.isArray(settings.headerScripts)) {
      headerScripts = settings.headerScripts;
    } else if (typeof settings.headerScripts === 'string' && settings.headerScripts.trim()) {
      try {
        headerScripts = JSON.parse(settings.headerScripts);
      } catch (e) {
        headerScripts = [];
      }
    }
  }

  // Fallback to legacy single headAds if headerScripts is empty
  if (!Array.isArray(headerScripts) || headerScripts.length === 0) {
    headerScripts = [
      {
        id: 'default_1',
        name: 'Header Script / Ads (Head Tag)',
        code: settings.headAds || '',
        isEnabled: settings.isHeadAdsEnabled !== undefined ? Boolean(settings.isHeadAdsEnabled) : true,
      },
    ];
  }

  // Ensure each item has id, name, code, isEnabled
  headerScripts = headerScripts.map((item, idx) => ({
    id: String(item.id || `script_${idx + 1}`),
    name: String(item.name || `Header Script #${idx + 1}`),
    code: String(item.code || ''),
    isEnabled: item.isEnabled !== undefined ? Boolean(item.isEnabled) : true,
  }));

  // Calculate active scripts and combined headAds
  const activeScripts = headerScripts.filter((s) => s.isEnabled && s.code && s.code.trim());
  const combinedHeadAds = activeScripts.map((s) => s.code.trim()).join('\n\n');

  return {
    ...settings,
    headAds: combinedHeadAds || settings.headAds || '',
    isHeadAdsEnabled: activeScripts.length > 0,
    headerScripts,
  };
};

// Warm up RAM cache on server startup — so /ads/fast always has data
const warmUpAdsCache = async () => {
  try {
    await ensureTableExists();
    isTableInitialized = true;
    const result = await db.select().from(adsSettings).where(eq(adsSettings.id, 1)).limit(1);
    if (result[0]) {
      cachedAdsSettings = formatAdsSettings(result[0]);
      console.log('[AdsController] RAM cache warmed up successfully.');
    }
  } catch (e) {
    console.warn('[AdsController] Warm-up failed (non-critical):', e.message);
  }
};

// Auto warm-up on module load (non-blocking)
warmUpAdsCache();

// DEDICATED ULTRA-FAST ADS ENDPOINT (0ms RAM response + Browser HTTP Cache)
const getAdsFast = (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const defaultSettings = {
    id: 1,
    headAds: '',
    isHeadAdsEnabled: true,
    headerScripts: [
      {
        id: 'default_1',
        name: 'Header Script / Ads (Head Tag)',
        code: '',
        isEnabled: true,
      },
    ],
    navAds: '',
    modalSignupAds: '',
    footerAds: '',
    floatMobileAds: '',
    floatDesktopAds: '',
    histatsScript: '',
    membershipReferralLink: '',
    globalSignInReferralLink: '',
  };

  return res.status(200).json({
    success: true,
    data: {
      settings: cachedAdsSettings ? formatAdsSettings(cachedAdsSettings) : defaultSettings,
    },
  });
};

// GET Ads & Referral Settings
const getAdsSettings = async (req, res, next) => {
  try {
    if (cachedAdsSettings) {
      return res.status(200).json({
        success: true,
        data: {
          settings: formatAdsSettings(cachedAdsSettings),
        },
      });
    }

    if (!isTableInitialized) {
      await ensureTableExists();
      isTableInitialized = true;
    }

    const result = await db
      .select()
      .from(adsSettings)
      .where(eq(adsSettings.id, 1))
      .limit(1);

    const settings = result[0]
      ? formatAdsSettings(result[0])
      : {
          id: 1,
          headAds: '',
          isHeadAdsEnabled: true,
          headerScripts: [
            {
              id: 'default_1',
              name: 'Header Script / Ads (Head Tag)',
              code: '',
              isEnabled: true,
            },
          ],
          navAds: '',
          modalSignupAds: '',
          footerAds: '',
          floatMobileAds: '',
          floatDesktopAds: '',
          histatsScript: '',
          membershipReferralLink: '',
          globalSignInReferralLink: '',
        };

    cachedAdsSettings = settings;

    return res.status(200).json({
      success: true,
      data: {
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
};

// UPDATE Ads & Referral Settings
const updateAdsSettings = async (req, res, next) => {
  try {
    if (!isTableInitialized) {
      await ensureTableExists();
      isTableInitialized = true;
    }

    let {
      headAds,
      isHeadAdsEnabled,
      headerScripts,
      navAds,
      modalSignupAds,
      footerAds,
      floatMobileAds,
      floatDesktopAds,
      histatsScript,
      membershipReferralLink,
      globalSignInReferralLink,
    } = req.body;

    let headerScriptsJson = undefined;

    if (Array.isArray(headerScripts)) {
      const activeScripts = headerScripts.filter((s) => s && s.isEnabled && s.code && s.code.trim());
      headAds = activeScripts.map((s) => s.code.trim()).join('\n\n');
      isHeadAdsEnabled = activeScripts.length > 0;
      headerScriptsJson = JSON.stringify(headerScripts);
    } else if (typeof headerScripts === 'string' && headerScripts.trim()) {
      try {
        const parsed = JSON.parse(headerScripts);
        if (Array.isArray(parsed)) {
          const activeScripts = parsed.filter((s) => s && s.isEnabled && s.code && s.code.trim());
          headAds = activeScripts.map((s) => s.code.trim()).join('\n\n');
          isHeadAdsEnabled = activeScripts.length > 0;
        }
      } catch (e) {}
      headerScriptsJson = headerScripts;
    }

    const updatePayload = {
      navAds: navAds !== undefined ? navAds : '',
      modalSignupAds: modalSignupAds !== undefined ? modalSignupAds : '',
      footerAds: footerAds !== undefined ? footerAds : '',
      floatMobileAds: floatMobileAds !== undefined ? floatMobileAds : '',
      floatDesktopAds: floatDesktopAds !== undefined ? floatDesktopAds : '',
      histatsScript: histatsScript !== undefined ? histatsScript : '',
      membershipReferralLink: membershipReferralLink !== undefined ? membershipReferralLink : '',
      globalSignInReferralLink: globalSignInReferralLink !== undefined ? globalSignInReferralLink : '',
    };

    if (headAds !== undefined) {
      updatePayload.headAds = headAds;
    }
    if (isHeadAdsEnabled !== undefined) {
      updatePayload.isHeadAdsEnabled = Boolean(isHeadAdsEnabled);
    }
    if (headerScriptsJson !== undefined) {
      updatePayload.headerScripts = headerScriptsJson;
    }

    await db
      .update(adsSettings)
      .set(updatePayload)
      .where(eq(adsSettings.id, 1));

    const updated = await db
      .select()
      .from(adsSettings)
      .where(eq(adsSettings.id, 1))
      .limit(1);

    const formatted = formatAdsSettings(updated[0]);
    cachedAdsSettings = formatted;

    return res.status(200).json({
      success: true,
      message: 'Ads & Referral Settings updated successfully.',
      data: {
        settings: formatted,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdsFast,
  getAdsSettings,
  updateAdsSettings,
};
