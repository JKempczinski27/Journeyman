const fs = require('fs').promises;
const path = require('path');

class DataService {
  constructor() {
    this.dataDir = path.join(__dirname, '../data');
    this.ensureDataDir();
  }

  async ensureDataDir() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create data directory:', error);
    }
  }

  async savePlayerData(playerData) {
    try {
      const filename = `player_${Date.now()}.json`;
      const filepath = path.join(this.dataDir, filename);
      const timestamp = new Date().toISOString();
      const recordId = this.generateId();

      const dataToSave = {
        ...playerData,
        timestamp,
        id: recordId
      };

      await fs.writeFile(filepath, JSON.stringify(dataToSave, null, 2));
      console.log(`Player data saved: ${filename}`);

      return {
        playerId: recordId,
        savedAt: timestamp,
        storageKey: filename
      };
    } catch (error) {
      console.error('Failed to save player data:', error);
      throw error;
    }
  }

  async getPlayerData(playerId) {
    try {
      const files = await fs.readdir(this.dataDir);
      const playerFiles = files.filter(file => file.startsWith('player_'));

      for (const file of playerFiles) {
        const filepath = path.join(this.dataDir, file);
        const data = await fs.readFile(filepath, 'utf8');
        const playerData = JSON.parse(data);

        if (playerData.id === playerId) {
          return playerData;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to get player data:', error);
      throw error;
    }
  }

  async getAllPlayers() {
    try {
      const files = await fs.readdir(this.dataDir);
      const playerFiles = files.filter(file => file.startsWith('player_'));
      const players = [];

      for (const file of playerFiles) {
        const filepath = path.join(this.dataDir, file);
        const data = await fs.readFile(filepath, 'utf8');
        players.push(JSON.parse(data));
      }

      return players.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('Failed to get all players:', error);
      return [];
    }
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }
}

module.exports = DataService;
