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
      \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Ensure row ID 1 exists
  const [rows] = await connection.query(`SELECT * FROM \`ads_settings\` WHERE \`id\` = 1;`);
  if (rows.length === 0) {
    await connection.query(`INSERT INTO \`ads_settings\` (\`id\`) VALUES (1);`);
  }

  connection.release();
};

let cachedAdsSettings = null;
let isTableInitialized = false;

// DEDICATED ULTRA-FAST ADS ENDPOINT (0ms RAM response)
const getAdsFast = (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      settings: cachedAdsSettings || {
        id: 1,
        headAds: '',
        navAds: '',
        modalSignupAds: '',
        footerAds: '',
        floatMobileAds: '',
        floatDesktopAds: '',
        histatsScript: '',
        membershipReferralLink: '',
        globalSignInReferralLink: '',
      },
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
          settings: cachedAdsSettings,
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

    const settings = result[0] || {
      id: 1,
      headAds: '',
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

    const {
      headAds,
      navAds,
      modalSignupAds,
      footerAds,
      floatMobileAds,
      floatDesktopAds,
      histatsScript,
      membershipReferralLink,
      globalSignInReferralLink,
    } = req.body;

    await db
      .update(adsSettings)
      .set({
        headAds: headAds !== undefined ? headAds : '',
        navAds: navAds !== undefined ? navAds : '',
        modalSignupAds: modalSignupAds !== undefined ? modalSignupAds : '',
        footerAds: footerAds !== undefined ? footerAds : '',
        floatMobileAds: floatMobileAds !== undefined ? floatMobileAds : '',
        floatDesktopAds: floatDesktopAds !== undefined ? floatDesktopAds : '',
        histatsScript: histatsScript !== undefined ? histatsScript : '',
        membershipReferralLink: membershipReferralLink !== undefined ? membershipReferralLink : '',
        globalSignInReferralLink: globalSignInReferralLink !== undefined ? globalSignInReferralLink : '',
      })
      .where(eq(adsSettings.id, 1));

    const updated = await db
      .select()
      .from(adsSettings)
      .where(eq(adsSettings.id, 1))
      .limit(1);

    cachedAdsSettings = updated[0];

    return res.status(200).json({
      success: true,
      message: 'Ads & Referral Settings updated successfully.',
      data: {
        settings: updated[0],
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
