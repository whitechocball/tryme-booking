const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const getTimestamp = () => new Date().toISOString();

const log = (level, message, data = {}) => {
  const logEntry = {
    timestamp: getTimestamp(),
    level,
    message,
    ...data,
  };
  
  console.log(`[${level}] ${message}`, data);
  
  const logFile = path.join(logsDir, `${level.toLowerCase()}.log`);
  fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
};

module.exports = {
  info: (message, data) => log('INFO', message, data),
  error: (message, data) => log('ERROR', message, data),
  warn: (message, data) => log('WARN', message, data),
  debug: (message, data) => log('DEBUG', message, data),
};
