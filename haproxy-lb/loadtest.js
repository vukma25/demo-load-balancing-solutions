/**
 * loadtest.js — Công cụ tự giả lập tải để kiểm tra Load Balancer
 * Không cần cài thêm thư viện gì (chỉ dùng fetch có sẵn từ Node.js 18+)
 *
 * Cách chạy:
 *   node loadtest.js [URL] [SO_LUONG_REQUEST] [SO_LUONG_DONG_THOI]
 *
 * Ví dụ:
 *   node loadtest.js http://localhost:8080 1000 20
 *   -> gửi 1000 request, tối đa 20 request chạy song song cùng lúc
 */

const url = process.argv[2] || "http://localhost:8080";
const totalRequests = parseInt(process.argv[3] || "500", 10);
const concurrency = parseInt(process.argv[4] || "20", 10);

async function sendOneRequest() {
  const start = Date.now();
  try {
    const res = await fetch(url);
    const text = await res.text();
    const elapsed = Date.now() - start;
    // Trích ra "Server ID: X" từ response text
    const match = text.match(/Server ID:\s*(\S+)/);
    const serverId = match ? match[1] : "unknown";
    return { ok: res.ok, elapsed, serverId };
  } catch (err) {
    const elapsed = Date.now() - start;
    return { ok: false, elapsed, serverId: "ERROR", error: err.message };
  }
}

async function runBatch(batchSize) {
  const promises = [];
  for (let i = 0; i < batchSize; i++) promises.push(sendOneRequest());
  return Promise.all(promises);
}

async function main() {
  console.log(`\n== BẮT ĐẦU GIẢ LẬP TẢI ==`);
  console.log(`URL:            ${url}`);
  console.log(`Tổng request:   ${totalRequests}`);
  console.log(`Đồng thời tối đa: ${concurrency}\n`);

  const results = [];
  const startTime = Date.now();

  let sent = 0;
  while (sent < totalRequests) {
    const batchSize = Math.min(concurrency, totalRequests - sent);
    const batchResults = await runBatch(batchSize);
    results.push(...batchResults);
    sent += batchSize;
    process.stdout.write(`\rĐã gửi: ${sent}/${totalRequests}`);
  }

  const totalTime = (Date.now() - startTime) / 1000; // giây

  // ---- Thống kê ----
  const okResults = results.filter((r) => r.ok);
  const errorResults = results.filter((r) => !r.ok);
  const avgLatency =
    okResults.reduce((sum, r) => sum + r.elapsed, 0) / (okResults.length || 1);
  const maxLatency = Math.max(...okResults.map((r) => r.elapsed), 0);
  const minLatency = Math.min(...okResults.map((r) => r.elapsed), 0);
  const rps = (results.length / totalTime).toFixed(2);

  // Đếm số request mỗi Server ID đã xử lý
  const distribution = {};
  for (const r of okResults) {
    distribution[r.serverId] = (distribution[r.serverId] || 0) + 1;
  }

  console.log(`\n\n== KẾT QUẢ ==`);
  console.log(`Tổng thời gian:        ${totalTime.toFixed(2)} giây`);
  console.log(`Request thành công:    ${okResults.length}`);
  console.log(`Request lỗi:           ${errorResults.length}`);
  console.log(`Requests/giây (RPS):   ${rps}`);
  console.log(`Độ trễ trung bình:     ${avgLatency.toFixed(2)} ms`);
  console.log(`Độ trễ thấp nhất:      ${minLatency} ms`);
  console.log(`Độ trễ cao nhất:       ${maxLatency} ms`);

  console.log(`\n== PHÂN PHỐI TRAFFIC THEO SERVER ID ==`);
  const sortedIds = Object.keys(distribution).sort();
  for (const id of sortedIds) {
    const count = distribution[id];
    const percent = ((count / okResults.length) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(percent / 2));
    console.log(`Server ${id}: ${String(count).padStart(5)} request (${percent}%)  ${bar}`);
  }

  if (errorResults.length > 0) {
    console.log(`\nMột số lỗi gặp phải (tối đa 3 dòng đầu):`);
    errorResults.slice(0, 3).forEach((r) => console.log(`  - ${r.error}`));
  }
  console.log("");
}

main();
