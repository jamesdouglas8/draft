// app.js

'use strict';

// Load environment variables
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const qs = require('querystring');  // Use Node's built-in querystring module

// Destructure environment variables
const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  PORT = 3000
} = process.env;

const app = express();

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

// Redirect root to /auth for convenience
app.get('/', (_req, res) => {
  res.redirect('/auth');
});

// 1️⃣ Start OAuth flow by redirecting to Yahoo
app.get('/auth', (_req, res) => {
  const params = qs.stringify({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    language: 'en-us'
  });
  res.redirect(`https://api.login.yahoo.com/oauth2/request_auth?${params}`);
});

// 2️⃣ Callback route to exchange code for tokens
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
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
    console.log('Tokens:', tokenRes.data);
    return res.send('✅ OAuth successful! Check the server console for tokens.');
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).send('Token exchange failed. See server logs.');
  }
});

// Optional: Draft Suggestion Endpoint
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

// Start the server bound to all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log('▶️ Visit /auth to begin the Yahoo OAuth flow');
});

// Export for testing or further integration
module.exports = { suggestBestPick, app };
