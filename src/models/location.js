const db = require('../utils/db');
const logger = require('../utils/logger');

class Location {
  static async create(code, name, description = null, mapUrl = null) {
    try {
      const result = await db.query(
        'INSERT INTO locations (code, name, description, map_url) VALUES ($1, $2, $3, $4) RETURNING *',
        [code, name, description, mapUrl]
      );
      logger.info('新場所已創建', { code, name });
      return result.rows[0];
    } catch (error) {
      logger.error('創建場所失敗', { error: error.message, code });
      throw error;
    }
  }

  static async getById(locationId) {
    try {
      const result = await db.query(
        'SELECT * FROM locations WHERE id = $1',
        [locationId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢場所失敗', { error: error.message, locationId });
      throw error;
    }
  }

  static async getByCode(code) {
    try {
      const result = await db.query(
        'SELECT * FROM locations WHERE code = $1',
        [code]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('查詢場所失敗', { error: error.message, code });
      throw error;
    }
  }

  static async getAll() {
    try {
      const result = await db.query(
        'SELECT * FROM locations ORDER BY code'
      );
      return result.rows;
    } catch (error) {
      logger.error('查詢所有場所失敗', { error: error.message });
      throw error;
    }
  }

  static async update(locationId, updates) {
    try {
      const fields = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(locationId);

      const result = await db.query(
        `UPDATE locations SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
        values
      );

      logger.info('場所已更新', { locationId });
      return result.rows[0];
    } catch (error) {
      logger.error('更新場所失敗', { error: error.message, locationId });
      throw error;
    }
  }

  static async delete(locationId) {
    try {
      await db.query('DELETE FROM locations WHERE id = $1', [locationId]);
      logger.info('場所已刪除', { locationId });
    } catch (error) {
      logger.error('刪除場所失敗', { error: error.message, locationId });
      throw error;
    }
  }
}

module.exports = Location;
