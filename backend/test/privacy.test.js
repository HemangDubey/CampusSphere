// Provider privacy: nothing the browser can download may name the AI provider, its models or a key.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '../../frontend');
const FORBIDDEN = /groq|llama|gsk_|mixtral|openai/i;
const hits = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'vendor') continue; // third-party library files (Bootstrap)
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(html|js|css|json|svg|md)$/i.test(entry.name) && FORBIDDEN.test(fs.readFileSync(full, 'utf8'))) hits.push(path.relative(root, full));
  }
})(root);
assert.deepEqual(hits, [], `provider details found in frontend files: ${hits.join(', ')}`);

// No real-looking key in tracked source or example env files.
const SECRET = /gsk_[A-Za-z0-9]{20,}/;
const repo = path.resolve(__dirname, '../..');
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repo }).toString().split('\n').filter(Boolean);
const leaked = files.filter((f) => /\.(js|json|md|html|env|example|txt)$/i.test(f) && fs.existsSync(path.join(repo, f)) && SECRET.test(fs.readFileSync(path.join(repo, f), 'utf8')));
assert.deepEqual(leaked, [], `possible API key in: ${leaked.join(', ')}`);
console.log('Privacy tests passed');
