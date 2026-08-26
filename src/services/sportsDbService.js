const axios = require('axios');

const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY || '3379953594';
const SPORTSDB_V2_BASE_URL = 'https://www.thesportsdb.com/api/v2/json';
const SPORTSDB_V1_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}`;

// Target categories specified by user requirement
const TARGET_SPORTS = [
  'soccer',
  'tennis',
  'fighting',
  'motorsport',
  'rugby',
  'basketball',
  'volleyball',
  'american football',
  'nfl',
  'cycling',
  'boxing',
];

const fetchAllSportsFromApi = async () => {
  try {
    const response = await axios.get(`${SPORTSDB_V2_BASE_URL}/all/sports`, {
      headers: {
        'X-API-KEY': SPORTSDB_API_KEY,
      },
      timeout: 10000,
    });

    if (response.data && (response.data.sports || response.data.all)) {
      return response.data.sports || response.data.all || [];
    }
  } catch (err) {
    console.log('⚠️ Falling back to v1 API for sports list:', err.message);
  }

  // Fallback to v1 API
  try {
    const v1Res = await axios.get(`${SPORTSDB_V1_BASE_URL}/all_sports.php`, { timeout: 10000 });
    return v1Res.data?.sports || [];
  } catch (v1Err) {
    console.error('❌ Failed to fetch sports from TheSportsDB v1 API:', v1Err.message);
    return [];
  }
};

const getTargetSportsFiltered = async () => {
  const allSports = await fetchAllSportsFromApi();
  if (!allSports || allSports.length === 0) return [];

  return allSports.filter((item) => {
    const name = (item.strSport || item.name || '').toLowerCase();
    return TARGET_SPORTS.some((target) => name.includes(target) || target.includes(name));
  });
};

module.exports = {
  SPORTSDB_API_KEY,
  fetchAllSportsFromApi,
  getTargetSportsFiltered,
  TARGET_SPORTS,
};
