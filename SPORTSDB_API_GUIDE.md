# 🏆 TheSportsDB API Documentation & Integration Guide

Complete analysis of **TheSportsDB API (v1 & v2)** including endpoints, authentication methods, data structure, media asset handling, and Express.js backend implementation details.

---

## 🔑 1. API Credentials & Base URLs

### Provided Credentials:
- **API Key**: `3379953594`
- **Default Test URL**: `https://www.thesportsdb.com/api/v2/json/all/sports`

### Base URLs & Authentication Modes:

| Version | Base URL | Authentication Method | Example |
| :--- | :--- | :--- | :--- |
| **v2 API** (Recommended) | `https://www.thesportsdb.com/api/v2/json` | Header: `X-API-KEY: 3379953594` | `GET /api/v2/json/all/sports` |
| **v1 API** (Legacy) | `https://www.thesportsdb.com/api/v1/json/3379953594` | Query/Path Parameter | `GET /api/v1/json/3379953594/all_sports.php` |

---

## 📊 2. API Endpoints Analysis & Map

Below is the structured catalog of available endpoints in TheSportsDB API v2 (and v1 equivalents).

### 2.1 Meta Data & Global Lists (`all`)
Used for populating initial dropdowns, categories, sports list, countries, and leagues.

| Feature | Endpoint (v2) | Description / Usage |
| :--- | :--- | :--- |
| **All Sports** | `GET /api/v2/json/all/sports` | Returns list of all sports (Soccer, Basketball, Cricket, etc.) with badges, descriptions, format. |
| **All Countries** | `GET /api/v2/json/all/countries` | Returns list of all supported geographical countries. |
| **All Leagues** | `GET /api/v2/json/all/leagues` | Returns list of all sports leagues worldwide with IDs. |

### 2.2 Search Endpoints (`search`)
Search entities by text string/keywords.

| Feature | Endpoint (v2) | Parameters | Example |
| :--- | :--- | :--- | :--- |
| **Search League** | `GET /api/v2/json/search/league/{name}` | `{name}` string | `/api/v2/json/search/league/english_premier_league` |
| **Search Team** | `GET /api/v2/json/search/team/{name}` | `{name}` string | `/api/v2/json/search/team/manchester_united` |
| **Search Player** | `GET /api/v2/json/search/player/{name}` | `{name}` string | `/api/v2/json/search/player/messi` |
| **Search Event** | `GET /api/v2/json/search/event/{title}` | `{title}` string | `/api/v2/json/search/event/arsenal_vs_chelsea` |
| **Search Venue** | `GET /api/v2/json/search/venue/{name}` | `{name}` string | `/api/v2/json/search/venue/wembley` |

### 2.3 Lookup Endpoints (`lookup`)
Fetch full entity details using unique integer IDs (fastest lookup).

| Feature | Endpoint (v2) | ID Parameter | Usage |
| :--- | :--- | :--- | :--- |
| **Lookup League** | `GET /api/v2/json/lookup/league/{id}` | `{idLeague}` (e.g. `4328`) | Fetch league badges, trophy artwork, rules, country. |
| **Lookup Team** | `GET /api/v2/json/lookup/team/{id}` | `{idTeam}` (e.g. `133597`) | Fetch team details, stadium, jerseys, social links. |
| **Lookup Event** | `GET /api/v2/json/lookup/event/{id}` | `{idEvent}` | Fetch match details, scores, venue, referee, teams. |
| **Lookup Player** | `GET /api/v2/json/lookup/player/{id}` | `{idPlayer}` | Fetch player bio, height, nationality, position, photo. |
| **Lookup Event Lineup** | `GET /api/v2/json/lookup/event_lineup/{id}` | `{idEvent}` | Fetch starting 11, substitutes, formation. |
| **Lookup Event Stats** | `GET /api/v2/json/lookup/event_stats/{id}` | `{idEvent}` | Match statistics (possession, shots, fouls, cards). |
| **Lookup Event Highlights** | `GET /api/v2/json/lookup/event_highlights/{id}` | `{idEvent}` | Fetch official YouTube match highlights video link. |
| **Lookup TV Broadcasts** | `GET /api/v2/json/lookup/event_tv/{id}` | `{idEvent}` | Fetch TV channels broadcasting the live event. |

### 2.4 Schedule & Fixtures Endpoints (`schedule`)
Fetch upcoming and past matches.

| Feature | Endpoint (v2) | Description |
| :--- | :--- | :--- |
| **Next 10 Events in League** | `GET /api/v2/json/schedule/next/league/{idLeague}` | Upcoming 10 fixtures for a league (e.g. Premier League `4328`). |
| **Past 10 Events in League** | `GET /api/v2/json/schedule/previous/league/{idLeague}` | Last 10 match results for a league. |
| **Next 10 Events for Team** | `GET /api/v2/json/schedule/next/team/{idTeam}` | Upcoming fixtures for a specific team. |
| **Past 10 Events for Team** | `GET /api/v2/json/schedule/previous/team/{idTeam}` | Recent match results for a team. |
| **Full Season League Schedule** | `GET /api/v2/json/schedule/league/{idLeague}/{season}` | Entire season calendar (e.g. `/schedule/league/4328/2023-2024`). |

### 2.5 Real-Time Livescores (`livescore`)
Real-time score updates for live matches.

| Feature | Endpoint (v2 / v1) | Description |
| :--- | :--- | :--- |
| **All Livescores** | `GET /api/v2/json/livescore/all`<br>`GET /api/v1/json/3/livescore.php` | Real-time live scores for all ongoing matches worldwide. |
| **Livescore Soccer** | `GET /api/v2/json/livescore/soccer`<br>`GET /api/v1/json/3/livescore.php?s=Soccer` | Filter real-time live scores for soccer matches. |
| **Livescore by League** | `GET /api/v2/json/livescore/{idLeague}`<br>`GET /api/v1/json/3/livescore.php?l={idLeague}` | Filter live scores by league ID. |

#### ⚽ 2.5.1 SportsDB LiveScore Soccer Field Schema (`livescore.php?s=Soccer`)

The table below documents all JSON fields returned by TheSportsDB LiveScore API:

| Field Name | Data Type | Description & Example Values |
| :--- | :--- | :--- |
| `idLiveScore` | `string` | Unique LiveScore Record ID (e.g., `"16291784"`) |
| `idEvent` | `string` | SportsDB Event ID matching schedule API (e.g., `"2585513"`) |
| `strSport` | `string` | Sport category (e.g., `"Soccer"`, `"Basketball"`) |
| `idLeague` | `string` | SportsDB League/Subcategory ID (e.g., `"5526"`) |
| `strLeague` | `string` | League / Subcategory Name (e.g., `"Copa AUF Uruguay"`) |
| `intDivision` | `string` | Division number (e.g., `"1"`, `"3"`, `"99"`) |
| `idHomeTeam` | `string` | Home Team ID (e.g., `"135369"`) |
| `idAwayTeam` | `string` | Away Team ID (e.g., `"138818"`) |
| `strHomeTeam` | `string` | Home Team Name (e.g., `"Peñarol"`) |
| `strAwayTeam` | `string` | Away Team Name (e.g., `"Montevideo City Torque"`) |
| `strHomeTeamBadge` | `string` | Home Team Logo Badge Image URL |
| `strAwayTeamBadge` | `string` | Away Team Logo Badge Image URL |
| `intHomeScore` | `string` | Current Home Team Score (e.g., `"1"`, `"3"`) |
| `intAwayScore` | `string` | Current Away Team Score (e.g., `"0"`, `"2"`) |
| `strStatus` | `string` | Match Status Period (`"1H"` = 1st Half, `"HT"` = Half Time, `"2H"` = 2nd Half, `"FT"` = Full Time) |
| `strProgress` | `string` | Match Elapsed Minute / Progress (e.g., `"45'"`, `"74'"`, `"77'"`, `"90+3"`, `"90+4"`) |
| `strTimestamp` | `string` | UTC Match Start Timestamp (e.g., `"2026-08-26T23:15:00"`) |
| `strEventTime` | `string` | UTC Event Time (e.g., `"23:15"`) |
| `dateEvent` | `string` | UTC Event Date (e.g., `"2026-08-26"`) |
| `updated` | `string` | Score Last Updated Timestamp (e.g., `"2026-08-27 01:52:32"`) |

#### 📄 Sample Raw Response JSON:

```json
{
  "livescore": [
    {
      "idLiveScore": "16291784",
      "idEvent": "2585513",
      "strSport": "Soccer",
      "idLeague": "5526",
      "strLeague": "Copa AUF Uruguay",
      "intDivision": "99",
      "idHomeTeam": "135369",
      "idAwayTeam": "138818",
      "strHomeTeam": "Peñarol",
      "strAwayTeam": "Montevideo City Torque",
      "strHomeTeamBadge": "https://r2.thesportsdb.com/images/media/team/badge/uuwpux1473541171.png",
      "strAwayTeamBadge": "https://r2.thesportsdb.com/images/media/team/badge/v7urjn1580234584.png",
      "intHomeScore": "1",
      "intAwayScore": "0",
      "strStatus": "2H",
      "strProgress": "77",
      "strTimestamp": "2026-08-26T23:15:00",
      "strEventTime": "23:15",
      "dateEvent": "2026-08-26",
      "updated": "2026-08-27 01:52:32"
    },
    {
      "idLiveScore": "16291179",
      "idEvent": "2497989",
      "strSport": "Soccer",
      "idLeague": "5660",
      "strLeague": "Copa Venezuela",
      "intDivision": "99",
      "idHomeTeam": "151955",
      "idAwayTeam": "150578",
      "strHomeTeam": "Deportivo Miranda",
      "strAwayTeam": "Anzoátegui",
      "strHomeTeamBadge": "https://r2.thesportsdb.com/images/media/team/badge/v994g21746251541.png",
      "strAwayTeamBadge": "https://r2.thesportsdb.com/images/media/team/badge/n36vyr1737129376.png",
      "intHomeScore": "1",
      "intAwayScore": "2",
      "strStatus": "2H",
      "strProgress": "90+3",
      "strTimestamp": "2026-08-26T23:00:00",
      "strEventTime": "23:00",
      "dateEvent": "2026-08-26",
      "updated": "2026-08-27 01:52:32"
    }
  ]
}
```
| Feature | Endpoint (v2) | Parameters |
| :--- | :--- | :--- |
| **TV Events by Date** | `GET /api/v2/json/filter/tv/day/{YYYY-MM-DD}` | E.g. `/filter/tv/day/2024-06-22` |
| **TV Events by Sport** | `GET /api/v2/json/filter/tv/sport/{sport}` | E.g. `/filter/tv/sport/motorsport` |
| **TV Events by Channel** | `GET /api/v2/json/filter/tv/channel/{channel_name}` | E.g. `/filter/tv/channel/sky_sports` |

---

## 🖼️ 3. Media & Image Asset Sizing

TheSportsDB returns full image URLs (e.g., `https://r2.thesportsdb.com/images/media/league/fanart/xpwsrw1421853005.jpg`).

You can request resized thumbnails by appending a size modifier to the end of any image URL:

| Modifier | Example URL | Resized Width |
| :--- | :--- | :--- |
| **Original** | `https://r2.thesportsdb.com/.../xpwsrw1421853005.jpg` | Full size (720px+) |
| **Medium** | `https://r2.thesportsdb.com/.../xpwsrw1421853005.jpg/medium` | 500px |
| **Small** | `https://r2.thesportsdb.com/.../xpwsrw1421853005.jpg/small` | 250px |
| **Tiny** | `https://r2.thesportsdb.com/.../xpwsrw1421853005.jpg/tiny` | 50px |

---

## ⚡ 4. Express.js Integration Code Example

Below is a complete Node.js / Express module demonstrating how to integrate TheSportsDB API with your `3379953594` API key into `streamespn-backend`.

### 4.1 Axios Service Module (`src/services/sportsDbService.js`)

```javascript
const axios = require('axios');

const SPORTSDB_API_KEY = process.env.SPORTSDB_API_KEY || '3379953594';
const SPORTSDB_V2_BASE_URL = 'https://www.thesportsdb.com/api/v2/json';
const SPORTSDB_V1_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_API_KEY}`;

// Create Axios client for v2 API
const sportsDbV2 = axios.create({
  baseURL: SPORTSDB_V2_BASE_URL,
  headers: {
    'X-API-KEY': SPORTSDB_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

/**
 * Fetch all sports categories
 */
const getAllSports = async () => {
  try {
    const response = await sportsDbV2.get('/all/sports');
    return response.data;
  } catch (error) {
    // Fallback to v1 if v2 returns header issue
    const v1Res = await axios.get(`${SPORTSDB_V1_BASE_URL}/all_sports.php`);
    return v1Res.data;
  }
};

/**
 * Fetch upcoming next 10 events for a league
 */
const getNextEventsByLeague = async (leagueId = 4328) => {
  try {
    const response = await sportsDbV2.get(`/schedule/next/league/${leagueId}`);
    return response.data;
  } catch (error) {
    const v1Res = await axios.get(`${SPORTSDB_V1_BASE_URL}/eventsnextleague.php?id=${leagueId}`);
    return v1Res.data;
  }
};

/**
 * Fetch current real-time livescores
 */
const getLiveScores = async (sport = 'all') => {
  try {
    const endpoint = sport === 'all' ? '/livescore/all' : `/livescore/${sport}`;
    const response = await sportsDbV2.get(endpoint);
    return response.data;
  } catch (error) {
    console.error('Error fetching live scores:', error.message);
    throw error;
  }
};

/**
 * Search team by name
 */
const searchTeamByName = async (teamName) => {
  try {
    const response = await sportsDbV2.get(`/search/team/${encodeURIComponent(teamName)}`);
    return response.data;
  } catch (error) {
    const v1Res = await axios.get(`${SPORTSDB_V1_BASE_URL}/searchteams.php?t=${encodeURIComponent(teamName)}`);
    return v1Res.data;
  }
};

module.exports = {
  getAllSports,
  getNextEventsByLeague,
  getLiveScores,
  searchTeamByName,
};
```

---

## 🎯 Summary

- **API Key**: `3379953594` is active and can be used both in **v2 HTTP Header** (`X-API-KEY: 3379953594`) and **v1 Path URL** (`/api/v1/json/3379953594/...`).
- **Best Practices**: Use **v2 Lookup API** (`/lookup/league/{id}`) by integer ID for fast performance, and append `/small` or `/medium` to image URLs for optimized loading.
