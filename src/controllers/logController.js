const fs = require('fs');
const path = require('path');

const getLogs = (req, res) => {
  const logDirectory = path.join(__dirname, '../../logs');
  const logFileName = `application-${new Date().toISOString().split('T')[0]}.log`; // Dynamic file name based on current date
  const logFilePath = path.join(logDirectory, logFileName);

  // Debug: Log the resolved directory and file path
  console.log('Log directory:', logDirectory);
  console.log('Resolved log file path:', logFilePath);

  // Create the logs directory if it doesn't exist
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  // Check if the log file exists
  if (!fs.existsSync(logFilePath)) {
    return res.status(404).json({ error: "Log file not found" });
  }

  // Read the log file
  fs.readFile(logFilePath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Error reading log file" });
    }

    // Split the log file into lines and parse each line as JSON
    const logs = data.split('\n').filter(line => line).map(line => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { error: "Invalid log format", line };
      }
    });

    // Filter out GET requests and login logs, and sort by timestamp in descending order
    const filteredLogs = logs
      .filter(log => 
        !log.message.includes('GET request') && 
        !log.message.includes('login')
      )
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(filteredLogs);
  });
};

module.exports = { getLogs }; 