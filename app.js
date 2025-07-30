// app.js

console.log("🏈 Fantasy Draft AI is live!");

// Example: Basic player suggestion function (placeholder logic)
function suggestBestPick(currentTeam, availablePlayers) {
  // Placeholder: Just return the first available player
  return availablePlayers.length > 0 ? availablePlayers[0] : "No players available";
}

// Example usage:
const myTeam = ["Justin Jefferson", "Josh Allen"];
const availablePlayers = ["Christian McCaffrey", "Tyreek Hill", "Ja'Marr Chase"];

const suggestion = suggestBestPick(myTeam, availablePlayers);
console.log("📢 Suggested Pick:", suggestion);

// Hook to UI (if used later)
window.suggestBestPick = suggestBestPick;
