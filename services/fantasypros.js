// services/fantasypros.js

/**
 * FantasyPros PPR rankings via CSV export (consensus cheat sheet).
 */

const axios = require('axios');

/**
 * Fetches PPR Overall consensus cheat sheet rankings from FantasyPros CSV export
 * and returns an array of { rank, player }.
 */
async function fetchPPRRankings() {
  const url = 'https://www.fantasypros.com/nfl/rankings/consensus-cheatsheets.php?export=xls';
  const response = await axios.get(url, { responseType: 'text' });
  const csv = response.data;
  const lines = csv.split('\n');
  const rankings = [];

  // CSV header is on the first line; subsequent lines contain data
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    const rank = parseInt(cols[0], 10);
    const player = cols[1] && cols[1].trim();
    if (!isNaN(rank) && player) {
      rankings.push({ rank, player });
    }
  }

  return rankings;
}

module.exports = { fetchPPRRankings };
