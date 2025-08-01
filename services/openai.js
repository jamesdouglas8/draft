// services/openai.js

/**
 * OpenAI integration for fantasy draft insights.
 */

const OpenAI = require('openai');

// Initialize OpenAI client with API key from .env
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generates a concise fantasy football insight for a given player.
 * @param {string} playerName
 * @returns {Promise<string>} AI-generated analysis
 */
async function getPlayerInsight(playerName) {
  const messages = [
    {
      role: 'system',
      content: 'You are a seasoned fantasy football analyst. Provide clear, concise, and actionable insights.',
    },
    {
      role: 'user',
      content: `Offer a fantasy football analysis for player ${playerName}, focusing on recent performance, strengths, weaknesses, and draft value.`,
    },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 200,
  });

  return response.choices[0].message.content.trim();
}

module.exports = { getPlayerInsight };
