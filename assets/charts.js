/* 台股分析站 — 前端：ECharts 圖表 + 主題切換 + 可排序表格
 * 圖表資料由各頁 <script id="page-data" type="application/json"> 提供，
 * 顏色一律讀 CSS 變數，切換主題時整批重繪（亮/暗一致）。
 */
(function () {
  "use strict";

  // ── 主題 ──────────────────────────────
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("theme", t); } catch (e) {}
    var btn = document.getElementById("theme-btn");
    if (btn) btn.textContent = t === "dark" ? "☀ 亮色" : "☾ 暗色";
    renderAll();
  }
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) {}
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    var btn = document.getElementById("theme-btn");
    if (btn) {
      btn.textContent = currentTheme() === "dark" ? "☀ 亮色" : "☾ 暗色";
      btn.addEventListener("click", function () {
        applyTheme(currentTheme() === "dark" ? "light" : "dark");
      });
    }
  }

  function C() {
    var s = getComputedStyle(document.body);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    return {
      close: g("--series-close"), ma5: g("--series-ma5"), ma20: g("--series-ma20"),
      ma60: g("--series-ma60"), band: g("--band"),
      gain: g("--gain"), loss: g("--loss"),
      cat: [g("--cat-1"), g("--cat-2"), g("--cat-3"), g("--cat-4")],
      grid: g("--grid"), axis: g("--axis"), muted: g("--text-muted"),
      text: g("--text-2"), surface: g("--surface-1")
    };
  }

  // 建議 → 顏色（台股：買紅、賣綠、其餘藍）
  function recColor(rec, c) {
    rec = rec || "";
    if (/買|加碼|建倉|進場|布局/.test(rec)) return c.gain;
    if (/賣|減碼|停利|出場|了結/.test(rec)) return c.loss;
    return c.cat[0];
  }

  // ── ECharts 共用設定 ──────────────────────────────
  function baseGrid() { return { left: 8, right: 14, top: 30, bottom: 6, containLabel: true }; }
  function axisText(c) { return { color: c.muted, fontSize: 11 }; }
  function catAxis(c, data, rotate) {
    return {
      type: "category", data: data, boundaryGap: true,
      axisLine: { lineStyle: { color: c.axis } },
      axisTick: { show: false },
      axisLabel: Object.assign(axisText(c), { rotate: rotate || 0, hideOverlap: true })
    };
  }
  function valAxis(c, name) {
    return {
      type: "value", scale: true, name: name || "", nameTextStyle: { color: c.muted, fontSize: 11 },
      splitLine: { lineStyle: { color: c.grid } },
      axisLabel: axisText(c)
    };
  }
  function tooltip(c, trigger) {
    return {
      trigger: trigger || "axis",
      axisPointer: { type: "cross", lineStyle: { color: c.axis }, label: { show: false } },
      backgroundColor: c.surface, borderColor: c.grid,
      textStyle: { color: c.text, fontSize: 12 }, confine: true
    };
  }

  // ── 各圖種 option 建構 ──────────────────────────────
  var BUILD = {
    // 價格 + 均線 + 布林帶
    price: function (spec, c) {
      var s = spec.series, dates = spec.dates;
      var lower = s.bb_lower, upper = s.bb_upper, series = [];
      if (lower && upper) {
        var diff = upper.map(function (u, i) { return u == null || lower[i] == null ? null : +(u - lower[i]).toFixed(2); });
        series.push(
          { name: "_bblo", type: "line", data: lower, stack: "bb", lineStyle: { opacity: 0 }, symbol: "none", silent: true, showInLegend: false },
          { name: "布林帶", type: "line", data: diff, stack: "bb", lineStyle: { opacity: 0 }, itemStyle: { color: c.band }, symbol: "none", silent: true, areaStyle: { color: c.band, opacity: 0.18 } }
        );
      }
      [["ma60", "MA60季", c.ma60], ["ma20", "MA20月", c.ma20], ["ma5", "MA5週", c.ma5]].forEach(function (m) {
        if (s[m[0]]) series.push({ name: m[1], type: "line", data: s[m[0]], symbol: "none", smooth: true, lineStyle: { width: 1.5, color: m[2] }, itemStyle: { color: m[2] } });
      });
      var closeSer = { name: "收盤", type: "line", data: s.close, symbol: "none", lineStyle: { width: 2.5, color: c.close }, itemStyle: { color: c.close }, z: 5 };
      // 歷次建議標記（pin，落在收盤線上，顏色依買/賣/持有）
      if (spec.markers && spec.markers.length) {
        closeSer.markPoint = {
          symbol: "pin", symbolSize: 34, z: 10,
          label: { color: "#fff", fontSize: 10, fontWeight: "bold" },
          data: spec.markers.map(function (m) {
            return { coord: [m.x, m.y], value: m.rec, name: m.x,
                     itemStyle: { color: recColor(m.rec, c) } };
          })
        };
      }
      series.push(closeSer);
      return {
        grid: baseGrid(), tooltip: tooltip(c),
        legend: { data: ["收盤", "MA5週", "MA20月", "MA60季", "布林帶"], textStyle: { color: c.text, fontSize: 11 }, top: 0, right: 0 },
        xAxis: catAxis(c, dates), yAxis: valAxis(c),
        series: series
      };
    },
    // 單色量值長條（EPS 等），端點直接標值
    bar: function (spec, c) {
      var col = spec.color === "cat2" ? c.cat[1] : c.cat[0];
      return {
        grid: baseGrid(), tooltip: tooltip(c),
        xAxis: catAxis(c, spec.labels, spec.rotate), yAxis: valAxis(c, spec.unit),
        series: [{
          type: "bar", data: spec.values, itemStyle: { color: col, borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 34, label: spec.label !== false ? { show: true, position: "top", color: c.text, fontSize: 10, formatter: function (p) { return p.value == null ? "" : p.value; } } : undefined
        }]
      };
    },
    // 正負分色長條（台股：正=紅 gain / 負=綠 loss），零基準
    dbar: function (spec, c) {
      var data = spec.values.map(function (v) {
        return { value: v, itemStyle: { color: v == null ? c.muted : (v >= 0 ? c.gain : c.loss), borderRadius: v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } };
      });
      return {
        grid: baseGrid(), tooltip: tooltip(c),
        xAxis: catAxis(c, spec.labels, spec.rotate), yAxis: valAxis(c, spec.unit),
        series: [{
          type: "bar", data: data, barMaxWidth: 40,
          label: { show: spec.label !== false, position: "top", color: c.text, fontSize: 10, formatter: function (p) { return p.value == null ? "" : p.value; } }
        }]
      };
    },
    // 多序列折線（毛利率/營益率/淨利率；ETF α 走勢）
    lines: function (spec, c) {
      var series = spec.series.map(function (ser, i) {
        return { name: ser.name, type: "line", data: ser.values, symbol: "circle", symbolSize: 5, smooth: true, connectNulls: true, lineStyle: { width: 2, color: c.cat[i % 4] }, itemStyle: { color: c.cat[i % 4] } };
      });
      if (spec.zeroLine && series.length) {   // α 圖：畫 0 基準線（＝與基準同步）
        series[0].markLine = { silent: true, symbol: "none",
          lineStyle: { color: c.muted, type: "dashed", width: 1 },
          label: { show: false }, data: [{ yAxis: 0 }] };
      }
      return {
        grid: baseGrid(), tooltip: tooltip(c),
        legend: { data: spec.series.map(function (s) { return s.name; }), textStyle: { color: c.text, fontSize: 11 }, top: 0, right: 0 },
        xAxis: catAxis(c, spec.labels, spec.rotate), yAxis: valAxis(c, spec.unit), series: series
      };
    },
    // 分組長條（法人買賣超：外資/投信/自營），正紅負綠靠語意，序列靠圖例
    group: function (spec, c) {
      var palette = [c.cat[0], c.cat[1], c.cat[2]];
      var series = spec.series.map(function (ser, i) {
        return { name: ser.name, type: "bar", data: ser.values, barMaxWidth: 14, itemStyle: { color: palette[i % 3], borderRadius: [2, 2, 0, 0] } };
      });
      return {
        grid: baseGrid(), tooltip: tooltip(c),
        legend: { data: spec.series.map(function (s) { return s.name; }), textStyle: { color: c.text, fontSize: 11 }, top: 0, right: 0 },
        xAxis: catAxis(c, spec.labels), yAxis: valAxis(c, spec.unit),
        series: series
      };
    }
  };

  // ── 渲染 ──────────────────────────────
  var registry = [];
  function renderAll() {
    var el = document.getElementById("page-data");
    if (!el || !window.echarts) return;
    var data;
    try { data = JSON.parse(el.textContent); } catch (e) { return; }
    var c = C();
    registry.forEach(function (ch) { ch.dispose(); });
    registry = [];
    (data.charts || []).forEach(function (spec) {
      var dom = document.getElementById(spec.id);
      if (!dom || !BUILD_ok(spec)) return;
      var chart = echarts.init(dom, null, { renderer: "canvas" });
      chart.setOption(BUILD[spec.kind](spec, c));
      registry.push(chart);
    });
  }
  function BUILD_ok(spec) { return spec.kind && BUILD[spec.kind]; }

  window.addEventListener("resize", function () { registry.forEach(function (ch) { ch.resize(); }); });

  // ── 可排序表格 ──────────────────────────────
  function initSort() {
    document.querySelectorAll("table[data-sortable] thead th").forEach(function (th, idx) {
      th.addEventListener("click", function () {
        var table = th.closest("table");
        var tb = table.tBodies[0];
        var rows = Array.prototype.slice.call(tb.rows);
        var asc = !(th.classList.contains("sorted") && !th.classList.contains("asc"));
        table.querySelectorAll("th").forEach(function (h) { h.classList.remove("sorted", "asc"); });
        th.classList.add("sorted"); if (asc) th.classList.add("asc");
        rows.sort(function (a, b) {
          var x = cellVal(a.cells[idx]), y = cellVal(b.cells[idx]);
          if (x === y) return 0;
          return (x < y ? -1 : 1) * (asc ? 1 : -1);
        });
        rows.forEach(function (r) { tb.appendChild(r); });
      });
    });
  }
  function cellVal(td) {
    if (!td) return -Infinity;
    var raw = td.getAttribute("data-sort");
    if (raw == null) raw = td.textContent;
    var num = parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
    return isNaN(num) ? String(raw) : num;
  }

  document.addEventListener("DOMContentLoaded", function () {
    initTheme();
    initSort();
    renderAll();
  });
})();
