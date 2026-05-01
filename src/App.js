import { useState, useEffect, useCallback } from "react";

// --- Central Bank Rates (update manually or via API) ---
const CB_RATES = {
  USD: { rate: 4.33, bank: "Federal Reserve", next: "May 7" },
  EUR: { rate: 2.40, bank: "ECB", next: "Jun 5" },
  GBP: { rate: 4.50, bank: "Bank of England", next: "May 8" },
  JPY: { rate: 0.50, bank: "Bank of Japan", next: "May 1" },
  AUD: { rate: 4.10, bank: "RBA", next: "May 20" },
  NZD: { rate: 3.50, bank: "RBNZ", next: "May 28" },
  CAD: { rate: 2.75, bank: "Bank of Canada", next: "Jun 4" },
  CHF: { rate: 0.25, bank: "SNB", next: "Jun 19" },
};

const PAIRS = [
  { pair: "EUR/USD", base: "EUR", quote: "USD", symbol: "EURUSD" },
  { pair: "GBP/USD", base: "GBP", quote: "USD", symbol: "GBPUSD" },
  { pair: "AUD/USD", base: "AUD", quote: "USD", symbol: "AUDUSD" },
  { pair: "USD/JPY", base: "USD", quote: "JPY", symbol: "USDJPY" },
  { pair: "NZD/USD", base: "NZD", quote: "USD", symbol: "NZDUSD" },
  { pair: "USD/CAD", base: "USD", quote: "CAD", symbol: "USDCAD" },
  { pair: "USD/CHF", base: "USD", quote: "CHF", symbol: "USDCHF" },
  { pair: "GBP/JPY", base: "GBP", quote: "JPY", symbol: "GBPJPY" },
];

// Simulated price data (in real app, replace with broker WebSocket or FX API)
const MOCK_PRICES = {
  EURUSD: { price: 1.1342, change: 0.0021, high52: 1.1500, low52: 1.0450 },
  GBPUSD: { price: 1.3428, change: -0.0015, high52: 1.3450, low52: 1.2300 },
  AUDUSD: { price: 0.6412, change: 0.0008, high52: 0.6800, low52: 0.5980 },
  USDJPY: { price: 142.85, change: -0.55, high52: 161.80, low52: 139.40 },
  NZDUSD: { price: 0.5918, change: 0.0003, high52: 0.6380, low52: 0.5510 },
  USDCAD: { price: 1.3842, change: 0.0012, high52: 1.4800, low52: 1.3300 },
  USDCHF: { price: 0.8192, change: -0.0008, high52: 0.9250, low52: 0.8150 },
  GBPJPY: { price: 191.82, change: -0.92, high52: 208.10, low52: 178.30 },
};

// Simulated BB data (20-day, 2 SD) — %B and bandwidth
const MOCK_BB = {
  EURUSD: { pctB: 0.82, bandwidth: 0.031, signal: "approaching upper" },
  GBPUSD: { pctB: 0.21, bandwidth: 0.028, signal: "approaching lower" },
  AUDUSD: { pctB: 0.55, bandwidth: 0.019, signal: "mid-band" },
  USDJPY: { pctB: 0.18, bandwidth: 0.042, signal: "approaching lower" },
  NZDUSD: { pctB: 0.61, bandwidth: 0.022, signal: "mid-band" },
  USDCAD: { pctB: 0.78, bandwidth: 0.027, signal: "approaching upper" },
  USDCHF: { pctB: 0.12, bandwidth: 0.038, signal: "at lower band" },
  GBPJPY: { pctB: 0.09, bandwidth: 0.055, signal: "at lower band" },
};

// COT positioning extremes (scale -100 to +100, + = net long speculators)
const MOCK_COT = {
  EURUSD: { netPos: 62, extreme: true, direction: "long", note: "Near multi-yr high" },
  GBPUSD: { netPos: 38, extreme: false, direction: "long", note: "Moderate long" },
  AUDUSD: { netPos: -55, extreme: true, direction: "short", note: "Crowded short" },
  USDJPY: { netPos: -71, extreme: true, direction: "short", note: "Heavy JPY long" },
  NZDUSD: { netPos: -28, extreme: false, direction: "short", note: "Mild short" },
  USDCAD: { netPos: 44, extreme: false, direction: "long", note: "Moderate long" },
  USDCHF: { netPos: -18, extreme: false, direction: "short", note: "Mild short" },
  GBPJPY: { netPos: -35, extreme: false, direction: "short", note: "Moderate short" },
};

function getRateDir(base, quote) {
  const diff = CB_RATES[base].rate - CB_RATES[quote].rate;
  return { diff: diff.toFixed(2), bullish: diff > 0 ? base : quote, bearish: diff > 0 ? quote : base };
}

function getIRPSignal(pair, priceData) {
  const { base, quote, symbol } = pair;
  const { diff, bullish } = getRateDir(base, quote);
  const diffAbs = Math.abs(parseFloat(diff));
  const price = priceData[symbol];
  const pctFromHigh = ((price.high52 - price.price) / (price.high52 - price.low52)) * 100;

  let bias, strength;
  if (diffAbs < 0.5) { bias = "neutral"; strength = "weak"; }
  else if (diffAbs < 1.5) { bias = bullish === base ? "base+" : "quote+"; strength = "moderate"; }
  else { bias = bullish === base ? "base++" : "quote++"; strength = "strong"; }

  return { bias, strength, diff, bullish, pctFromHigh };
}

function getBBColor(pctB) {
  if (pctB >= 0.9) return "#ff4466";
  if (pctB >= 0.75) return "#ff8844";
  if (pctB <= 0.1) return "#44aaff";
  if (pctB <= 0.25) return "#44ddbb";
  return "#888";
}

function getBBLabel(pctB, bandwidth) {
  const wide = bandwidth > 0.035;
  if (pctB >= 0.9) return { label: wide ? "🔴 WIDE + UPPER EXTREME" : "Upper extreme", priority: wide ? 3 : 1 };
  if (pctB <= 0.1) return { label: wide ? "🔵 WIDE + LOWER EXTREME" : "Lower extreme", priority: wide ? 3 : 1 };
  if (pctB >= 0.75) return { label: "Approaching upper", priority: 0 };
  if (pctB <= 0.25) return { label: "Approaching lower", priority: 0 };
  return { label: "Mid-band", priority: -1 };
}

function getSetupScore(symbol, irp) {
  const bb = MOCK_BB[symbol];
  const cot = MOCK_COT[symbol];
  let score = 0;
  if (bb.pctB >= 0.85 || bb.pctB <= 0.15) score += 2;
  else if (bb.pctB >= 0.75 || bb.pctB <= 0.25) score += 1;
  if (bb.bandwidth > 0.035) score += 2;
  if (cot.extreme) score += 2;
  if (Math.abs(parseFloat(irp.diff)) >= 1.5) score += 1;
  return Math.min(score, 7);
}

function ScoreBar({ score }) {
  const max = 7;
  const color = score >= 5 ? "#ff4466" : score >= 3 ? "#ffaa00" : "#444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 2 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 2,
            background: i < score ? color : "#222",
            transition: "background 0.3s"
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color, fontWeight: 700 }}>{score}/{max}</span>
    </div>
  );
}

function SessionClock() {
  const [times, setTimes] = useState({});
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const utcH = now.getUTCHours();
      const utcM = now.getUTCMinutes();
      const utcTotal = utcH * 60 + utcM;

      const sessions = [
        { name: "Sydney", open: 22 * 60, close: 7 * 60, tz: "Australia/Sydney" },
        { name: "Tokyo", open: 23 * 60, close: 8 * 60, tz: "Asia/Tokyo" },
        { name: "London", open: 7 * 60, close: 16 * 60, tz: "Europe/London" },
        { name: "New York", open: 12 * 60, close: 21 * 60, tz: "America/New_York" },
      ];

      const result = {};
      sessions.forEach(s => {
        let active;
        if (s.open > s.close) {
          active = utcTotal >= s.open || utcTotal < s.close;
        } else {
          active = utcTotal >= s.open && utcTotal < s.close;
        }

        // mins to open or close
        let minsToEvent, eventLabel;
        if (active) {
          const minsToClose = s.open > s.close
            ? (utcTotal >= s.open ? (s.close + 1440 - utcTotal) : s.close - utcTotal)
            : s.close - utcTotal;
          minsToEvent = minsToClose;
          eventLabel = "closes";
        } else {
          const minsToOpen = s.open > s.close
            ? (utcTotal < s.open ? s.open - utcTotal : s.open + 1440 - utcTotal)
            : (utcTotal < s.open ? s.open - utcTotal : s.open + 1440 - utcTotal);
          minsToEvent = minsToOpen;
          eventLabel = "opens";
        }

        const h = Math.floor(minsToEvent / 60);
        const m = minsToEvent % 60;
        result[s.name] = { active, countdown: `${h}h ${m}m`, eventLabel };
      });
      setTimes(result);
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const sessions = ["Sydney", "Tokyo", "London", "New York"];
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {sessions.map(name => {
        const s = times[name] || {};
        return (
          <div key={name} style={{
            background: s.active ? "rgba(68,200,120,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${s.active ? "#44c878" : "#2a2a2a"}`,
            borderRadius: 8, padding: "8px 14px",
            display: "flex", flexDirection: "column", alignItems: "center", minWidth: 110
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: s.active ? "#44c878" : "#444",
                boxShadow: s.active ? "0 0 6px #44c878" : "none"
              }} />
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: s.active ? "#eee" : "#666", fontWeight: 600 }}>{name}</span>
            </div>
            <span style={{ fontSize: 10, color: s.active ? "#44c878" : "#555", marginTop: 3 }}>
              {s.countdown} {s.eventLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PairCard({ pair, expanded, onToggle }) {
  const { symbol, base, quote } = pair;
  const price = MOCK_PRICES[symbol];
  const bb = MOCK_BB[symbol];
  const cot = MOCK_COT[symbol];
  const irp = getIRPSignal(pair, MOCK_PRICES);
  const score = getSetupScore(symbol, irp);
  const bbInfo = getBBLabel(bb.pctB, bb.bandwidth);
  const bbColor = getBBColor(bb.pctB);
  const isHigh = score >= 5;

  return (
    <div onClick={onToggle} style={{
      background: isHigh ? "rgba(255,68,102,0.06)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${isHigh ? "rgba(255,68,102,0.3)" : "#1e1e1e"}`,
      borderRadius: 12, padding: "16px 20px", cursor: "pointer",
      transition: "all 0.2s", marginBottom: 8
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        {/* Left: pair name + price */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: 1 }}>
              {pair.pair}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#ccc" }}>
                {price.price.toFixed(symbol === "USDJPY" || symbol === "GBPJPY" ? 2 : 4)}
              </span>
              <span style={{ fontSize: 12, color: price.change >= 0 ? "#44c878" : "#ff6666" }}>
                {price.change >= 0 ? "▲" : "▼"} {Math.abs(price.change).toFixed(symbol === "USDJPY" || symbol === "GBPJPY" ? 2 : 4)}
              </span>
            </div>
          </div>
        </div>

        {/* Middle: indicators */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          {/* Rate diff */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>Rate Diff</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: parseFloat(irp.diff) > 0 ? "#44c878" : parseFloat(irp.diff) < 0 ? "#ff6666" : "#888" }}>
              {parseFloat(irp.diff) > 0 ? "+" : ""}{irp.diff}%
            </div>
            <div style={{ fontSize: 10, color: "#555" }}>{irp.bullish} favoured</div>
          </div>

          {/* BB %B */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>BB %B</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: bbColor }}>
              {(bb.pctB * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, color: bbColor }}>{bbInfo.label.replace(/🔴|🔵/g, "").trim()}</div>
          </div>

          {/* BB Width */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>BB Width</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: bb.bandwidth > 0.035 ? "#ffaa00" : "#888" }}>
              {(bb.bandwidth * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: bb.bandwidth > 0.035 ? "#ffaa00" : "#555" }}>
              {bb.bandwidth > 0.035 ? "WIDE" : "normal"}
            </div>
          </div>

          {/* COT */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1 }}>COT</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: cot.extreme ? "#ffaa00" : "#888" }}>
              {cot.netPos > 0 ? "+" : ""}{cot.netPos}
            </div>
            <div style={{ fontSize: 10, color: cot.extreme ? "#ffaa00" : "#555" }}>
              {cot.extreme ? "EXTREME" : "normal"}
            </div>
          </div>
        </div>

        {/* Right: setup score */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Setup Score</div>
          <ScoreBar score={score} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #1e1e1e" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>

            {/* IRP Analysis */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#ff8844", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Interest Rate Parity
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>{base} rate</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#ccc" }}>{CB_RATES[base].rate}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888" }}>{quote} rate</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#ccc" }}>{CB_RATES[quote].rate}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, paddingTop: 6, borderTop: "1px solid #2a2a2a" }}>
                <span style={{ fontSize: 12, color: "#888" }}>Differential</span>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: parseFloat(irp.diff) > 0 ? "#44c878" : "#ff6666" }}>
                  {parseFloat(irp.diff) > 0 ? "+" : ""}{irp.diff}%
                </span>
              </div>
              <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
                <strong style={{ color: "#fff" }}>{irp.bullish}</strong> carries the rate advantage.
                Mean reversion shorts from upper band or longs from lower band should favour
                {" "}<strong style={{ color: "#44c878" }}>{irp.bullish}</strong> direction.
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>
                Next CB decision: {CB_RATES[base].bank} {CB_RATES[base].next} · {CB_RATES[quote].bank} {CB_RATES[quote].next}
              </div>
            </div>

            {/* Bollinger Band Detail */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#4488ff", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                Bollinger Bands (20,2)
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>%B Position</div>
                <div style={{ background: "#111", borderRadius: 4, height: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: `${bb.pctB * 100}%`, transform: "translateX(-50%)", width: 3, height: "100%", background: bbColor, borderRadius: 2 }} />
                  <div style={{ position: "absolute", left: "25%", width: 1, height: "100%", background: "#2a2a2a" }} />
                  <div style={{ position: "absolute", left: "75%", width: 1, height: "100%", background: "#2a2a2a" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: "#44aaff" }}>Lower</span>
                  <span style={{ fontSize: 10, color: bbColor, fontWeight: 700 }}>{(bb.pctB * 100).toFixed(0)}%</span>
                  <span style={{ fontSize: 10, color: "#ff4466" }}>Upper</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
                Band width at <strong style={{ color: bb.bandwidth > 0.035 ? "#ffaa00" : "#ccc" }}>{(bb.bandwidth * 100).toFixed(1)}%</strong>
                {bb.bandwidth > 0.035 ? " — significantly expanded. Volatility spike in progress. Watch for exhaustion candle." : " — within normal range."}
              </div>
              <div style={{ marginTop: 8, padding: "6px 10px", background: bbColor + "22", borderRadius: 6, fontSize: 12, color: bbColor, fontWeight: 600 }}>
                {bbInfo.label}
              </div>
            </div>

            {/* COT & Setup */}
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#44ddbb", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                COT Positioning
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Net Speculator Position</div>
                <div style={{ background: "#111", borderRadius: 4, height: 8, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "absolute", left: "50%", width: 1, height: "100%", background: "#2a2a2a" }} />
                  <div style={{
                    position: "absolute",
                    left: cot.netPos >= 0 ? "50%" : `${50 + cot.netPos / 2}%`,
                    width: `${Math.abs(cot.netPos) / 2}%`,
                    height: "100%",
                    background: cot.direction === "long" ? "#44c878" : "#ff4466",
                    borderRadius: 2
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: "#ff4466" }}>Short</span>
                  <span style={{ fontSize: 10, color: cot.extreme ? "#ffaa00" : "#888", fontWeight: cot.extreme ? 700 : 400 }}>
                    {cot.netPos > 0 ? "+" : ""}{cot.netPos}
                  </span>
                  <span style={{ fontSize: 10, color: "#44c878" }}>Long</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#aaa", lineHeight: 1.6 }}>
                {cot.note}. {cot.extreme ? "Positioning at extremes historically precedes reversals — a crowded trade is vulnerable." : "No extreme positioning signal currently."}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: "#555" }}>
                COT published weekly (CFTC, 3-day lag). Use for weekly bias only.
              </div>
            </div>
          </div>

          {/* Strategy guidance */}
          {score >= 4 && (
            <div style={{ background: "rgba(255,68,102,0.08)", border: "1px solid rgba(255,68,102,0.2)", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: "#ff4466", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                ⚡ Setup Alert — Strategy Guidance
              </div>
              <div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7 }}>
                {bb.pctB <= 0.15
                  ? `Price is at/below the lower Bollinger Band on ${pair.pair}. ${irp.bullish === base ? `Rate differential supports ${base} — look for pin bar reversal long on London open for a mean reversion play back toward the 20-period mean.` : `Rate differential favours ${quote} — lower band touch may be continuation, not reversal. Require very strong pin bar and COT confirmation before fading.`}`
                  : bb.pctB >= 0.85
                  ? `Price is at/above the upper Bollinger Band on ${pair.pair}. ${irp.bullish === quote ? `Rate differential supports ${quote} — look for pin bar reversal short on London open for a mean reversion play back toward the 20-period mean.` : `Rate differential favours ${base} — upper band touch may be continuation, not reversal. Require very strong pin bar and COT confirmation before fading.`}`
                  : `Approaching a band extreme on ${pair.pair}. Monitor for pin bar formation as price approaches the outer band.`
                }
                {cot.extreme ? ` COT positioning is at extremes — adds conviction.` : ""}
                {bb.bandwidth > 0.035 ? ` Wide bands confirm volatility expansion — reversal quality is higher.` : ""}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RatesPanel() {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "16px 20px", marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "#ff8844", fontWeight: 700, textTransform: "uppercase", letterSpacing: 2, marginBottom: 12 }}>
        Central Bank Rates
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {Object.entries(CB_RATES).map(([ccy, data]) => (
          <div key={ccy} style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid #1e1e1e",
            borderRadius: 8, padding: "8px 14px", minWidth: 90
          }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff" }}>{ccy}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 14, color: data.rate >= 3 ? "#ff8844" : data.rate >= 1 ? "#ffcc44" : "#44c878" }}>
              {data.rate}%
            </div>
            <div style={{ fontSize: 9, color: "#444", marginTop: 2 }}>Next: {data.next}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FXDashboard() {
  const [expanded, setExpanded] = useState(null);
  const [sortBy, setSortBy] = useState("score");

  const sortedPairs = [...PAIRS].sort((a, b) => {
    if (sortBy === "score") {
      const irpA = getIRPSignal(a, MOCK_PRICES);
      const irpB = getIRPSignal(b, MOCK_PRICES);
      return getSetupScore(b.symbol, irpB) - getSetupScore(a.symbol, irpA);
    }
    if (sortBy === "bb") return MOCK_BB[a.symbol].pctB <= 0.5
      ? MOCK_BB[a.symbol].pctB - MOCK_BB[b.symbol].pctB
      : MOCK_BB[b.symbol].pctB - MOCK_BB[a.symbol].pctB;
    return 0;
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#fff",
      fontFamily: "'Space Grotesk', 'DM Mono', sans-serif",
      padding: "28px 24px",
      maxWidth: 980,
      margin: "0 auto"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: "#ff4466", fontWeight: 700, textTransform: "uppercase", letterSpacing: 3, marginBottom: 6 }}>
          FX Strategy Dashboard
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: "#fff" }}>
          Currency Pair Monitor
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#555" }}>
          Interest rate parity · Bollinger Band extremes · COT positioning · Session timing
        </p>
      </div>

      {/* Session clocks */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 2, marginBottom: 10 }}>
          Trading Sessions (UTC)
        </div>
        <SessionClock />
      </div>

      {/* CB Rates */}
      <RatesPanel />

      {/* Sort controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1 }}>Sort:</span>
        {[["score", "Setup Score"], ["bb", "BB Extreme"]].map(([key, label]) => (
          <button key={key} onClick={e => { e.stopPropagation(); setSortBy(key); }} style={{
            background: sortBy === key ? "#ff4466" : "transparent",
            border: `1px solid ${sortBy === key ? "#ff4466" : "#2a2a2a"}`,
            color: sortBy === key ? "#fff" : "#555",
            borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit"
          }}>{label}</button>
        ))}
      </div>

      {/* Pair cards */}
      <div>
        {sortedPairs.map(pair => (
          <PairCard
            key={pair.symbol}
            pair={pair}
            expanded={expanded === pair.symbol}
            onToggle={() => setExpanded(expanded === pair.symbol ? null : pair.symbol)}
          />
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 28, padding: "16px 0", borderTop: "1px solid #111", fontSize: 11, color: "#333", lineHeight: 1.8 }}>
        <strong style={{ color: "#444" }}>Data note:</strong> Price data shown is illustrative — replace MOCK_PRICES and MOCK_BB with live WebSocket feed from your broker (OANDA, Interactive Brokers, or similar).
        COT data published weekly by CFTC at cftc.gov — update MOCK_COT weekly. Central bank rates updated manually or via a rates API.
        This dashboard is a strategy framework tool, not financial advice.
      </div>
    </div>
  );
}
