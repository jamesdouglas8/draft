// app.js

'use strict';

// Load environment variables
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');

// OpenAI integration
const { getPlayerInsight } = require('./services/openai');
const { fetchPPRRankings } = require('./services/fantasypros');


// Destructure environment variables
const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  PORT = 3000
} = process.env;

// Fail fast if required env variables are missing
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !process.env.OPENAI_API_KEY) {
  console.error('ERROR: Missing CLIENT_ID, CLIENT_SECRET, REDIRECT_URI or OPENAI_API_KEY in .env');
  process.exit(1);
}

const app = express();
// In-memory cache for league settings
const leagueCache = {};

/**
 * Refreshes expired OAuth tokens and persists them.
 */
async function refreshTokens() {
  try {
    const oldTokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));
    const body = qs.stringify({
      grant_type: 'refresh_token',
      redirect_uri: REDIRECT_URI,
      refresh_token: oldTokens.refresh_token,
    });
    const tokenRes = await axios.post(
      'https://api.login.yahoo.com/oauth2/get_token',
      body,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        },
      }
    );
    const newTokens = tokenRes.data;
    fs.writeFileSync('tokens.json', JSON.stringify(newTokens, null, 2));
    console.log('✅ Tokens refreshed and saved to tokens.json');
    return newTokens;
  } catch (err) {
    console.error('🔄 Token refresh error:', err.response?.data || err.message);
    throw err;
  }
}

/**
 * Fetches league settings from Yahoo, caching and persisting them to settings.json.
 * @param {string} leagueKey e.g. 'nfl.l.670188'
 */
async function getLeagueSettings(leagueKey) {
  if (leagueCache[leagueKey]) {
    return leagueCache[leagueKey];
  }

  // Load current tokens
  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));
  } catch (e) {
    throw new Error(`Could not read tokens.json: ${e.message}`);
  }

  const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${encodeURIComponent(leagueKey)}/settings?format=json`;
  let resp;

  try {
    resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
  } catch (err) {
    // If access token expired, refresh and retry once
    if (err.response?.status === 401) {
      console.log('🔄 Access token expired, refreshing...');
      tokens = await refreshTokens();
      resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
    } else {
      throw err;
    }
  }

  // Parse and persist settings safely
  const data = resp.data;

  // Grab the element that has the settings property
  const leagueArr = data.fantasy_content.league;
  const settingsNode = leagueArr.find(el => el.settings);
  if (!settingsNode || !settingsNode.settings) {
    console.error('❌ Couldn’t locate settings in the response:', JSON.stringify(data, null, 2));
    throw new Error('No settings in response from Yahoo API');
  }

  // settingsNode.settings is an array with one object inside it
  const settings = Array.isArray(settingsNode.settings)
    ? settingsNode.settings[0]
    : settingsNode.settings;

  fs.writeFileSync('settings.json', JSON.stringify(settings, null, 2));
  leagueCache[leagueKey] = settings;
  console.log(`✅ League settings for ${leagueKey} saved to settings.json`);
  return settings;
}

/**
 * Suggests the best available player not already on the team.
 */
function suggestBestPick(currentTeam = [], availablePlayers = []) {
  if (!Array.isArray(availablePlayers)) {
    throw new TypeError('availablePlayers must be an array');
  }
  const suggestion = availablePlayers.find(p => !currentTeam.includes(p));
  return suggestion || 'No player available';
}

// Redirect root to start OAuth
app.get('/', (_req, res) => {
  res.redirect('/auth');
});

// 1️⃣ OAuth start: redirect to Yahoo authorization
app.get('/auth', (_req, res) => {
  const params = qs.stringify({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'fspt-r',
    state: 'secureRandom',
  });
  res.redirect(`https://api.login.yahoo.com/oauth2/request_auth?${params}`);
});

// 2️⃣ OAuth callback: exchange code for tokens
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) {
    console.error('⚠️ No authorization code provided');
    return res.status(400).send('Missing code');
  }

  try {
    const tokenRes = await axios.post(
      'https://api.login.yahoo.com/oauth2/get_token',
      qs.stringify({
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        },
      }
    );
    const tokens = tokenRes.data;
    fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens saved to tokens.json');
    return res.send('✅ OAuth successful! Tokens saved to tokens.json');
  } catch (err) {
    console.error('🔄 Token exchange error:', err.response?.data || err.message);
    return res.status(500).send('Token exchange failed; check server logs');
  }
});

// 3️⃣ Endpoint: fetch league settings
app.get('/league/:leagueKey/settings', async (req, res) => {
  try {
    const settings = await getLeagueSettings(req.params.leagueKey);
    return res.json(settings);
  } catch (err) {
    console.error('Error fetching league settings:', err.message || err);
    return res.status(500).send('Failed to fetch league settings');
  }
});

// 4️⃣ Draft suggestion endpoint
app.get('/suggest', (req, res) => {
  const currentTeam = req.query.team
    ? req.query.team.split(',').map(s => s.trim())
    : [];
  const availablePlayers = req.query.pool
    ? req.query.pool.split(',').map(s => s.trim())
    : [];
  const pick = suggestBestPick(currentTeam, availablePlayers);
  res.json({ pick });
});

// 5️⃣ Player insight endpoint
app.get('/insights/:player', async (req, res) => {
  try {
    const insight = await getPlayerInsight(req.params.player);
    return res.json({ player: req.params.player, insight });
  } catch (err) {
    console.error('Error generating insight:', err);
    return res.status(500).send('Failed to generate player insight');
  }
});

// 6️⃣ FantasyPros PPR rankings endpoint
app.get('/rankings/fantasypros/ppr', async (req, res) => {
  try {
    const rankings = await fetchPPRRankings();
    return res.json(rankings);
  } catch (err) {
    console.error('Error fetching PPR rankings:', err);
    return res.status(500).send('Failed to fetch PPR rankings');
  }
});

// Optional: Pre-fetch settings on startup
const DRAFT_LEAGUE_KEY = 'nfl.l.670188';
getLeagueSettings(DRAFT_LEAGUE_KEY)
  .then(() => console.log(`✅ Prefetched settings for ${DRAFT_LEAGUE_KEY}`))
  .catch(err => console.error('Failed to prefetch league settings:', err));

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log('▶️ Visit /auth to begin the Yahoo OAuth flow');
});

module.exports = { suggestBestPick, app, getLeagueSettings };
