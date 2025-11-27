const http = require('http');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/mcp',
    method: 'POST',
    headers: {
        'X-Client-ID': 'test-client',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
};

console.log('Sending request...');
const req = http.request(options, (res) => {
    console.log('STATUS:', res.statusCode);
    console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log('BODY CHUNK:', chunk);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "listTools",
    id: 1
}));
req.end();
