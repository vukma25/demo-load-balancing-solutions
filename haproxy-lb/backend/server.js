const http = require("http");

const SERVER_ID = process.env.SERVER_ID || "unknown";
const PORT = 3000;

// Cho phép mô phỏng "server yếu/mạnh" để test Weighted Round Robin, Least Connections:
// SLOW_MS = độ trễ giả lập (ms) trước khi trả response
const SLOW_MS = parseInt(process.env.SLOW_MS || "0", 10);

http
  .createServer((req, res) => {
    const now = new Date().toISOString();
    console.log(`[${now}] [Server ${SERVER_ID}] ${req.method} ${req.url}`);

    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Server ID: ${SERVER_ID}\n`);
    }, SLOW_MS);
  })
  .listen(PORT, () => {
    console.log(`Server ${SERVER_ID} đang lắng nghe tại cổng ${PORT} (delay=${SLOW_MS}ms)`);
  });
