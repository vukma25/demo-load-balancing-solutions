const http = require("http");
const os = require("os");

const REGION = process.env.REGION || "unknown";
const POD_NAME = process.env.POD_NAME || os.hostname();
const PORT = 3000;

// Tốn CPU thật trong một khoảng thời gian ngắn để mô phỏng tải xử lý của
// một "trận đấu"/request game - nhờ đó HPA (dựa trên % CPU) mới có dữ liệu
// thực tế để quyết định scale up/down.
function busyWorkCPU(durationMs) {
  const end = Date.now() + durationMs;
  let x = 0;
  while (Date.now() < end) {
    x += Math.sqrt(x + 1);
  }
  return x;
}

http
  .createServer((req, res) => {
    const start = Date.now();
    busyWorkCPU(80); // ~80ms CPU-bound mỗi request
    const elapsed = Date.now() - start;

    console.log(
      `[${new Date().toISOString()}] [${REGION}] pod=${POD_NAME} xử lý trong ${elapsed}ms`
    );

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Region: ${REGION} | Pod: ${POD_NAME}\n`);
  })
  .listen(PORT, () => {
    console.log(`Backend [${REGION}] (${POD_NAME}) đang lắng nghe cổng ${PORT}`);
  });
