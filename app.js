// app.js

'use strict';

// Load environment variables
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const qs = require('querystring');
const fs = require('fs');

// Destructure environment variables
const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  PORT = 3000
} = process.env;

// Fail fast if required env variables are missing
if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
  console.error('ERROR: Missing CLIENT_ID, CLIENT_SECRET, or REDIRECT_URI in .env');
  process.exit(1);
}

const app = express();

// In-memory cache for league settings
const leagueCache = {};

/**
 * Fetches league settings from Yahoo, caching them in memory.
 * @param {string} leagueKey e.g. 'nfl.l.670188'
 * @returns {Promise<Object>} The parsed settings JSON
 */
async function getLeagueSettings(leagueKey) {
  if (leagueCache[leagueKey]) {
    return leagueCache[leagueKey];
  }

  // Read stored tokens
  let tokens;
  try {
    tokens = JSON.parse(fs.readFileSync('tokens.json', 'utf-8'));
  } catch (e) {
    throw new Error(`Could not read tokens.json: ${e.message}`);
  }

  const url = `https://fantasysports.yahooapis.com/fantasy/v2/league/${encodeURIComponent(leagueKey)}/settings?format=json`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  const data = resp.data;
  leagueCache[leagueKey] = data;
  return data;
}

/**
 * Suggests the best available player not already on the team.
 * @param {string[]} currentTeam - Array of player names already drafted.
 * @param {string[]} availablePlayers - Array of remaining player names.
 * @returns {string} The suggested player or a fallback message.
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
    scope: 'fspt-r',       // Fantasy Sports read-only
    state: 'secureRandom'  // CSRF mitigation
  });
  res.redirect(`https://api.login.yahoo.com/oauth2/request_auth?${params}`);
});

// 2️⃣ OAuth callback: exchange code for tokens
app.get('/callback', async (req, res) => {
  console.log('💬 /callback invoked with query:', req.query);
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
        code
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    const tokens = tokenRes.data;
    console.log('Tokens received:', tokens);

    // Persist tokens to file
    fs.writeFileSync('tokens.json', JSON.stringify(tokens, null, 2));
    console.log('✅ Tokens saved to tokens.json');

    return res.send('✅ OAuth successful! Tokens saved to tokens.json');
  } catch (err) {
    console.error('Token exchange error:', err.response?.data || err.message);
    return res.status(500).send('Token exchange failed. See server logs.');
  }
});

// 3️⃣ Fetch league settings via helper
app.get('/league/:leagueKey/settings', async (req, res) => {
  const { leagueKey } = req.params;
  try {
    const data = await getLeagueSettings(leagueKey);
    return res.json(data);
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

// Optional: Pre-fetch a league at startup for faster first lookup
const DRAFT_LEAGUE_KEY = 'nfl.l.670188';
getLeagueSettings(DRAFT_LEAGUE_KEY)
  .then(() => console.log(`✅ Pre-fetched settings for ${DRAFT_LEAGUE_KEY}`))
  .catch(err => console.error('Failed to prefetch league settings:', err));

// Start the server on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log('▶️ Visit /auth to begin the Yahoo OAuth flow');
});

module.exports = { suggestBestPick, app, getLeagueSettings };
