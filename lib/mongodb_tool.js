const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const allowedCommands = new Set(['mongodump', 'mongorestore']);

function removeConfigDirectory(directory) {
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    // The database tool has already exited, so a later OS temp cleanup is safe.
  }
}

function createPasswordConfig(password) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eiquidus-mongodb-tool-'));
  const configPath = path.join(directory, 'config.yml');

  try {
    fs.chmodSync(directory, 0o700);
    fs.writeFileSync(configPath, 'password: ' + JSON.stringify(String(password)) + '\n', {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    fs.chmodSync(configPath, 0o600);
  } catch (err) {
    removeConfigDirectory(directory);
    throw err;
  }

  return { directory, configPath };
}

function spawnMongoTool(command, args, password, spawnImpl) {
  if (!allowedCommands.has(command))
    throw new Error('Unsupported MongoDB tool: ' + command);

  if (!Array.isArray(args))
    throw new TypeError('MongoDB tool arguments must be an array');

  const config = createPasswordConfig(password);
  let child;

  try {
    const launcher = spawnImpl || childProcess.spawn;
    child = launcher(command, ['--config=' + config.configPath].concat(args), {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (err) {
    removeConfigDirectory(config.directory);
    throw err;
  }

  let cleaned = false;
  const cleanup = function() {
    if (!cleaned) {
      cleaned = true;
      removeConfigDirectory(config.directory);
    }
  };

  child.once('error', cleanup);
  child.once('exit', cleanup);
  return child;
}

module.exports = {
  spawnMongoTool
};
