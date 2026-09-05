/**
 * loadtest-hourly.js — Mô phỏng traffic game online theo 24 giờ,
 * gửi request qua Global Router (Nginx + GeoIP2) với IP giả lập
 * đại diện cho người dùng ở châu Á / châu Âu.
 *
 * Cách chạy:
 *   node loadtest-hourly.js [URL_GLOBAL_ROUTER] [SO_GIO_MO_PHONG] [GIAY_THAT_MOI_GIO] [REQUEST_CO_BAN_MOI_GIO]
 *
 * Ví dụ (mặc định - mô phỏng nhanh để demo, 1 giờ mô phỏng = 20 giây thật):
 *   node loadtest-hourly.js http://localhost:9000 24 20 100
 */

const ROUTER_URL = process.argv[2] || "http://localhost:9000";
const SIM_HOURS = parseInt(process.argv[3] || "24", 10);
const REAL_SECONDS_PER_HOUR = parseInt(process.argv[4] || "20", 10);
const BASE_REQUESTS_PER_HOUR = parseInt(process.argv[5] || "100", 10);

// ============================================================
// IP mẫu theo khu vực, dùng để gán vào header X-Forwarded-For
// nhằm giả lập vị trí địa lý của client (vì demo chạy trên 1 máy local,
// không có client thật ở nhiều quốc gia).
//
// - 81.2.69.142 (GB) và 202.54.1.5 (IN): IP mẫu CHÍNH THỨC, xuất hiện
//   trong tài liệu kỹ thuật của MaxMind/geoip2 - độ tin cậy cao.
// - Các IP còn lại lấy từ nguồn công khai (không phải MaxMind), độ tin
//   cậy thấp hơn. KHUYẾN NGHỊ: sau khi có file GeoLite2-Country.mmdb,
//   tự kiểm tra lại bằng lệnh:
//     docker run --rm -v "$(pwd)/global-router/geo:/geo" minikube... (xem README)
//   hoặc dùng công cụ mmdblookup, trước khi đưa số liệu vào báo cáo chính thức.
// ============================================================
const ASIA_IPS = [
  "202.54.1.5", // Ấn Độ (IN) - đã xác nhận qua tài liệu MaxMind
];
const EUROPE_IPS = [
  "81.2.69.142", // Anh (GB) - IP mẫu chính thức MaxMind, độ tin cậy cao
  "62.129.191.252", // Pháp (FR) - nguồn tham khảo, nên tự kiểm tra lại
  "2.16.6.5", // Đức (DE) - nguồn tham khảo, nên tự kiểm tra lại
  "62.13.255.230", // Tây Ban Nha (ES) - nguồn tham khảo, nên tự kiểm tra lại
];

// Đường cong traffic theo giờ ĐỊA PHƯƠNG (0-23h) mô phỏng hành vi chơi game:
// thấp về đêm khuya, tăng dần ban ngày, đỉnh vào buổi tối.
const HOURLY_CURVE = [
  0.1, 0.05, 0.05, 0.05, 0.05, 0.1, // 0h-5h: đêm khuya
  0.2, 0.3, 0.4, 0.4, 0.4, 0.5, // 6h-11h: sáng
  0.5, 0.5, 0.5, 0.6, 0.6, 0.7, // 12h-17h: chiều
  0.9, 1.0, 1.0, 0.9, 0.6, 0.3, // 18h-23h: tối (đỉnh)
];

function randomFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

async function sendOneRequest(ip) {
  try {
    const res = await fetch(ROUTER_URL, {
      headers: { "X-Forwarded-For": ip },
    });
    await res.text();
    return {
      ok: res.ok,
      region: res.headers.get("x-routed-region") || "?",
      country: res.headers.get("x-detected-country") || "?",
    };
  } catch (err) {
    return { ok: false, region: "ERROR", country: "?" };
  }
}

async function simulateHour(utcHour) {
  // Giả định múi giờ đại diện: châu Á = UTC+7 (VN), châu Âu = UTC+1 (Trung Âu)
  // -> traffic đỉnh của 2 khu vực lệch nhau theo giờ thực tế, thể hiện đúng
  //    lý do vì sao cần Global Load Balancing đa vùng.
  const asiaLocalHour = (utcHour + 7) % 24;
  const europeLocalHour = (utcHour + 1) % 24;

  const asiaRequests = Math.round(BASE_REQUESTS_PER_HOUR * HOURLY_CURVE[asiaLocalHour]);
  const europeRequests = Math.round(BASE_REQUESTS_PER_HOUR * HOURLY_CURVE[europeLocalHour]);

  console.log(`\n== Giờ mô phỏng ${utcHour}:00 (UTC) ==`);
  console.log(`  Châu Á  (giờ địa phương ${asiaLocalHour}h)  -> gửi ${asiaRequests} request`);
  console.log(`  Châu Âu (giờ địa phương ${europeLocalHour}h) -> gửi ${europeRequests} request`);

  const jobs = [];
  for (let i = 0; i < asiaRequests; i++) jobs.push(sendOneRequest(randomFrom(ASIA_IPS)));
  for (let i = 0; i < europeRequests; i++) jobs.push(sendOneRequest(randomFrom(EUROPE_IPS)));

  const results = await Promise.all(jobs);
  const okResults = results.filter((r) => r.ok);
  const routedAsia = okResults.filter((r) => r.region === "asia").length;
  const routedEurope = okResults.filter((r) => r.region === "europe").length;
  const errors = results.length - okResults.length;

  console.log(
    `  Kết quả định tuyến thực tế: asia=${routedAsia}, europe=${routedEurope}, lỗi=${errors}`
  );
}

async function main() {
  console.log(`== BẮT ĐẦU MÔ PHỎNG TRAFFIC ${SIM_HOURS} GIỜ ==`);
  console.log(`Global Router: ${ROUTER_URL}`);
  console.log(`1 giờ mô phỏng = ${REAL_SECONDS_PER_HOUR} giây thời gian thực`);
  console.log(`Request cơ bản mỗi giờ (khi traffic = 100%): ${BASE_REQUESTS_PER_HOUR}`);
  console.log(`\nMẹo: mở thêm 1 terminal khác chạy lệnh sau để xem HPA scale theo thời gian thực:`);
  console.log(`  kubectl get hpa -A -w`);
  console.log(`hoặc: kubectl get pods -A -w\n`);

  for (let h = 0; h < SIM_HOURS; h++) {
    const start = Date.now();
    await simulateHour(h % 24);
    const elapsed = Date.now() - start;
    const remaining = REAL_SECONDS_PER_HOUR * 1000 - elapsed;
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  }

  console.log("\n== HOÀN TẤT MÔ PHỎNG ==");
}

main();
