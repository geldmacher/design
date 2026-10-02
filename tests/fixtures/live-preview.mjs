import http from 'node:http';
import fs from 'node:fs';

const file = process.argv[2];
const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(fs.readFileSync(file));
});
server.listen(0, '127.0.0.1', () => process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/` }) + '\n'));
