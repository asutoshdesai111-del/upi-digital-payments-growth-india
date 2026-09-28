(function () {
  'use strict';

  var RAW = window.UPI_DATA;
  if (!RAW || !window.Chart) {
    document.body.insertAdjacentHTML('afterbegin',
      '<p style="padding:24px;font-weight:600">Could not load the data or the chart library. Run build_dataset.py and check that dashboard/vendor/chart.umd.min.js exists.</p>');
    return;
  }

  /* ------------------------------------------------------------------ data */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var rows = RAW.monthly.map(function (r, i) {
    var p = r.month.split('-').map(Number);
    return {
      i: i, y: p[0], m: p[1], label: MON[p[1] - 1] + ' ' + p[0], fy: r.fiscal_year,
      vol: r.volume_mn, val: r.value_cr, tkt: r.avg_ticket_inr, banks: r.banks_live,
      yoyVol: r.volume_yoy_pct, yoyVal: r.value_yoy_pct, momVol: r.volume_mom_pct, momVal: r.value_mom_pct,
      ev: r.milestone || ''
    };
  });
  var LAST = rows.length - 1;
  var MIN_SPAN = 2;

  /* ------------------------------------------------------------- utilities */
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  var clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  var css = getComputedStyle(document.documentElement);
  var cv = function (n) { return css.getPropertyValue(n).trim(); };
  var C = {
    indigo: cv('--c-indigo'), pink: cv('--c-pink'), orange: cv('--c-orange'), teal: cv('--c-teal'), gray: cv('--c-gray'),
    ink: cv('--ink'), ink2: cv('--ink-2'), muted: cv('--muted'), grid: cv('--grid'), axis: cv('--axis'), surface: cv('--surface')
  };
  var toRGB = function (hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  var rgba = function (hex, a) { return 'rgba(' + toRGB(hex).join(',') + ',' + a + ')'; };
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function contrast(a, b) {
    var l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function inkOn(c) { return contrast(c, [255, 255, 255]) >= contrast(c, toRGB(C.ink)) ? '#ffffff' : C.ink; }

  var nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  var nf1 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var trim = function (x) { return String(Number(x.toFixed(2))); };
  var RS = '₹';
  var fmtVol = function (mn, d) {
    d = d === undefined ? 2 : d;
    return mn >= 1000 ? (mn / 1000).toFixed(d) + ' bn' : (mn >= 100 ? Math.round(mn) + ' mn' : mn.toFixed(1) + ' mn');
  };
  var fmtVolAxis = function (mn) { return mn === 0 ? '0' : mn >= 1000 ? trim(mn / 1000) + ' bn' : trim(mn) + ' mn'; };
  var fmtVal = function (cr, d) {
    d = d === undefined ? 2 : d;
    return cr >= 1e5 ? RS + (cr / 1e5).toFixed(d) + ' lakh cr' : RS + nf0.format(cr) + ' cr';
  };
  var fmtValAxis = function (cr) { return cr === 0 ? '0' : cr >= 1e5 ? RS + trim(cr / 1e5) + 'L cr' : RS + nf0.format(cr) + ' cr'; };
  var rupee = function (x) { return RS + nf0.format(x); };
  var signed = function (x, d) {
    var a = Math.abs(x);
    return (x >= 0 ? '+' : '−') + (a >= 100 ? nf0.format(a) : a.toFixed(d === undefined ? 1 : d)) + '%';
  };
  var pctChange = function (cur, prev) { return prev ? (cur / prev - 1) * 100 : null; };
  var fmtX = function (x) { return (x >= 10 ? nf0.format(Math.round(x)) : x.toFixed(2)) + '×'; };
  function wrap(text, n) {
    var words = text.split(' '), lines = [], line = '';
    words.forEach(function (w) {
      if ((line + ' ' + w).trim().length > n) { lines.push(line); line = w; } else { line = (line + ' ' + w).trim(); }
    });
    if (line) lines.push(line);
    return lines;
  }

  /* --------------------------------------------------------------- metrics */
  var METRICS = {
    vol: {
      id: 'vol', name: 'Transactions', noun: 'transactions', color: C.indigo, field: 'vol', yoy: 'yoyVol', mom: 'momVol',
      fmt: fmtVol, axis: fmtVolAxis, fy: function (x) { return fmtVol(x, 1); }
    },
    val: {
      id: 'val', name: 'Value', noun: 'value transacted', color: C.teal, field: 'val', yoy: 'yoyVal', mom: 'momVal',
      fmt: fmtVal, axis: fmtValAxis, fy: function (x) { return fmtVal(x, 1); }
    }
  };
  var state = { from: 0, to: LAST, preset: 'all', metric: 'vol', scale: 'linear', sortKey: 'label', sortDir: 1, query: '' };
  var M = function () { return METRICS[state.metric]; };
  var view = function () { return rows.slice(state.from, state.to + 1); };
  var idxOf = function (label) { for (var k = 0; k < rows.length; k++) { if (rows[k].label === label) return k; } return 0; };

  /* ---------------------------------------------------------- chart basics */
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.font.weight = 500;
  Chart.defaults.color = C.muted;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { Chart.defaults.animation = false; }
  else { Chart.defaults.animation.duration = 450; }

  var crosshair = {
    id: 'crosshair',
    beforeDatasetsDraw: function (chart) {
      var act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
      if (!act.length) return;
      var a = chart.chartArea, ctx = chart.ctx, x = act[0].element.x;
      ctx.save();
      ctx.strokeStyle = C.axis; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
      ctx.restore();
    }
  };

  function xTick(value, index) {
    var rs = this.chart.$rows, r = rs && rs[index];
    if (!r) return '';
    if (rs.length > 36) return r.m === 1 && (this.chart.width >= 520 || r.y % 2 === 0) ? String(r.y) : '';
    return r.m % 3 === 1 ? MON[r.m - 1] + ' ' + String(r.y).slice(2) : '';
  }

  function areaFill(colorFn) {
    return function (c) {
      var a = c.chart.chartArea;
      if (!a) return 'transparent';
      var g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
      g.addColorStop(0, rgba(colorFn(), 0.26));
      g.addColorStop(1, rgba(colorFn(), 0.02));
      return g;
    };
  }

  function tooltipBase(colorFn, callbacks) {
    var cbs = { labelColor: function () { var c = colorFn(); return { borderColor: c, backgroundColor: c, borderWidth: 0, borderRadius: 2 }; } };
    Object.keys(callbacks).forEach(function (k) { cbs[k] = callbacks[k]; });
    return {
      enabled: true, mode: 'index', intersect: false, backgroundColor: C.surface, titleColor: C.ink, bodyColor: C.ink,
      footerColor: C.ink2, borderColor: C.axis, borderWidth: 1, cornerRadius: 12, padding: 12, displayColors: true,
      boxWidth: 14, boxHeight: 3, boxPadding: 6, titleFont: { weight: '800', size: 13 }, bodyFont: { weight: '700', size: 13 },
      footerFont: { weight: '500', size: 12 }, footerMarginTop: 8, callbacks: cbs
    };
  }

  function makeLine(id, colorFn, yExtra, callbacks) {
    var y = { grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { padding: 10, maxTicksLimit: 6 } };
    Object.keys(yExtra || {}).forEach(function (k) { y[k] = yExtra[k]; });
    return new Chart($(id).getContext('2d'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [], borderWidth: 2, fill: 'start', tension: 0.3, pointRadius: 0, pointHoverRadius: 6, pointHitRadius: 24,
          pointBorderWidth: 2, pointHoverBorderWidth: 2, pointHoverBorderColor: C.surface
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false, axis: 'x' },
        layout: { padding: { top: 6, right: 10 } },
        scales: {
          x: { grid: { display: false }, border: { color: C.axis }, ticks: { autoSkip: false, maxRotation: 0, padding: 8, callback: xTick } },
          y: y
        },
        plugins: { legend: { display: false }, tooltip: tooltipBase(colorFn, callbacks) }
      },
      plugins: [crosshair]
    });
  }

  function styleLine(chart, color) {
    var ds = chart.data.datasets[0];
    ds.borderColor = color;
    ds.backgroundColor = areaFill(function () { return color; });
    ds.pointBackgroundColor = color;
    ds.pointBorderColor = C.surface;
    ds.pointHoverBackgroundColor = color;
    return ds;
  }

  /* ----------------------------------------------------------- main chart */
  function decadeTicks(scale) {
    scale.ticks = scale.ticks.filter(function (t) { var l = Math.log10(t.value); return Math.abs(l - Math.round(l)) < 1e-9; });
  }
  var rowOf = function (items) { return items[0].chart.$rows[items[0].dataIndex]; };

  var mainChart = makeLine('mainChart', function () { return M().color; }, {}, {
    title: function (items) { var r = rowOf(items); return r.label + ' · ' + r.fy; },
    label: function (item) {
      var r = item.chart.$rows[item.dataIndex];
      return state.metric === 'vol' ? fmtVol(r.vol) + ' transactions' : fmtVal(r.val) + ' transacted';
    },
    afterLabel: function (item) {
      var r = item.chart.$rows[item.dataIndex], m = M(), out = [];
      if (r[m.yoy] !== null) out.push(signed(r[m.yoy]) + ' vs same month last year');
      if (r[m.mom] !== null) out.push(signed(r[m.mom]) + ' vs previous month');
      return out;
    },
    footer: function (items) { var r = rowOf(items); return r.ev ? wrap(r.ev, 40) : ''; }
  });

  function updateMain(v) {
    var m = M(), ds = styleLine(mainChart, m.color);
    mainChart.$rows = v;
    mainChart.data.labels = v.map(function (r) { return r.label; });
    ds.data = v.map(function (r) { return r[m.field]; });
    ds.pointRadius = v.map(function (r) { return r.ev ? 5.5 : 0; });
    var mn = Math.min.apply(null, ds.data), mx = Math.max.apply(null, ds.data);
    var logOK = mx / mn >= 30;
    var useLog = state.scale === 'log' && logOK;
    var y = mainChart.options.scales.y;
    y.type = useLog ? 'logarithmic' : 'linear';
    y.min = useLog ? mn * 0.6 : 0;
    y.max = useLog ? mx * 1.6 : undefined;
    y.afterBuildTicks = useLog ? decadeTicks : undefined;
    y.ticks.callback = function (val) { return m.axis(val); };
    mainChart.update();
    $('mainTitle').textContent = state.metric === 'vol' ? 'Monthly UPI transactions' : 'Monthly value transacted via UPI';
    $('mainSub').textContent = v[0].label + ' – ' + v[v.length - 1].label + ' · ' + (useLog ? 'log' : 'linear') + ' scale';
    $('scaleHint').textContent = state.scale === 'log' && !logOK
      ? 'Log scale needs a period that spans at least a 30× rise, so this view stays linear.' : '';
  }

  /* -------------------------------------------------------------- YoY chart */
  var yoyChart = makeLine('yoyChart', function () { return M().color; }, { suggestedMin: 0 }, {
    title: function (items) { var r = rowOf(items); return r.label + ' · ' + r.fy; },
    label: function (item) {
      var r = item.chart.$rows[item.dataIndex], m = M();
      return signed(r[m.yoy]) + ' year-on-year';
    },
    afterLabel: function (item) {
      var r = item.chart.$rows[item.dataIndex], m = M(), p = rows[r.i - 12];
      return m.fmt(r[m.field]) + ' vs ' + m.fmt(p[m.field]) + ' in ' + p.label;
    }
  });

  function updateYoy(v) {
    var m = M();
    var ok = v.filter(function (r) { return r.i >= 12 && rows[r.i - 12].vol >= 100 && r[m.yoy] !== null; });
    var ds = styleLine(yoyChart, m.color);
    yoyChart.$rows = ok;
    yoyChart.data.labels = ok.map(function (r) { return r.label; });
    ds.data = ok.map(function (r) { return r[m.yoy]; });
    yoyChart.options.scales.y.ticks.callback = function (val) { return (val < 0 ? '−' : '') + nf0.format(Math.abs(val)) + '%'; };
    $('yoyEmpty').hidden = ok.length >= 2;
    $('yoyTitle').textContent = 'Year-on-year growth in ' + (state.metric === 'vol' ? 'transactions' : 'value');
    yoyChart.update();
  }

  /* ------------------------------------------------------- ticket, banks */
  var ticketChart = makeLine('ticketChart', function () { return C.orange; }, { grace: '10%', beginAtZero: false }, {
    title: function (items) { var r = rowOf(items); return r.label + ' · ' + r.fy; },
    label: function (item) { return rupee(item.chart.$rows[item.dataIndex].tkt) + ' per transaction'; },
    afterLabel: function (item) {
      var r = item.chart.$rows[item.dataIndex], p = rows[r.i - 12];
      return p ? signed(pctChange(r.tkt, p.tkt)) + ' vs same month last year' : '';
    }
  });
  ticketChart.options.scales.y.ticks.callback = function (val) { return rupee(val); };

  var banksChart = makeLine('banksChart', function () { return C.pink; }, { min: 0 }, {
    title: function (items) { var r = rowOf(items); return r.label + ' · ' + r.fy; },
    label: function (item) { return nf0.format(item.chart.$rows[item.dataIndex].banks) + ' banks live (approx.)'; }
  });
  banksChart.options.scales.y.ticks.callback = function (val) { return nf0.format(val); };

  function updateTicketAndBanks(v) {
    var labels = v.map(function (r) { return r.label; });
    ticketChart.$rows = v; ticketChart.data.labels = labels;
    styleLine(ticketChart, C.orange).data = v.map(function (r) { return r.tkt; });
    ticketChart.update();
    banksChart.$rows = v; banksChart.data.labels = labels;
    styleLine(banksChart, C.pink).data = v.map(function (r) { return r.banks; });
    banksChart.update();
  }

  /* ------------------------------------------------------- fiscal-year bars */
  var fyLabels = {
    id: 'fyLabels',
    afterDatasetsDraw: function (chart) {
      var meta = chart.getDatasetMeta(0), ctx = chart.ctx, texts = chart.$labels || [];
      ctx.save();
      ctx.font = '700 12px ' + Chart.defaults.font.family;
      ctx.fillStyle = C.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      meta.data.forEach(function (bar, k) { if (texts[k]) ctx.fillText(texts[k], bar.x, bar.y - 8); });
      ctx.restore();
    }
  };
  var fyChart = new Chart($('fyChart').getContext('2d'), {
    type: 'bar',
    data: { labels: [], datasets: [{ data: [], borderRadius: { topLeft: 9, topRight: 9 }, borderWidth: 0, maxBarThickness: 54, hoverBorderWidth: 2, hoverBorderColor: C.ink2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      layout: { padding: { top: 18, right: 6 } },
      scales: {
        x: { grid: { display: false }, border: { color: C.axis }, ticks: { padding: 8, font: { weight: '700' } } },
        y: { beginAtZero: true, grace: '10%', grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { padding: 10, maxTicksLimit: 6 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: tooltipBase(function () { return M().color; }, {
          title: function (items) { return items[0].label; },
          label: function (item) {
            var a = item.chart.$agg[item.dataIndex], m = M();
            return m.id === 'vol' ? fmtVol(a.vol) + ' transactions' : fmtVal(a.val) + ' transacted';
          },
          afterLabel: function (item) {
            var a = item.chart.$agg[item.dataIndex];
            return a.n + ' of 12 months' + (a.partial ? ' (partial year)' : '');
          }
        })
      }
    },
    plugins: [fyLabels]
  });

  function updateFY(v) {
    var m = M(), map = {}, order = [];
    v.forEach(function (r) {
      if (!map[r.fy]) { map[r.fy] = { fy: r.fy, vol: 0, val: 0, n: 0 }; order.push(r.fy); }
      map[r.fy].vol += r.vol; map[r.fy].val += r.val; map[r.fy].n++;
    });
    var agg = order.map(function (k) { var a = map[k]; a.partial = a.n < 12; return a; });
    fyChart.$agg = agg;
    fyChart.$labels = agg.map(function (a) { return m.fy(a[m.field]); });
    fyChart.data.labels = agg.map(function (a) { return a.fy; });
    var ds = fyChart.data.datasets[0];
    ds.data = agg.map(function (a) { return a[m.field]; });
    ds.backgroundColor = agg.map(function (a) { return a.partial ? rgba(m.color, 0.42) : m.color; });
    ds.hoverBackgroundColor = agg.map(function (a) { return a.partial ? rgba(m.color, 0.55) : rgba(m.color, 0.88); });
    fyChart.options.scales.y.ticks.callback = function (val) { return m.axis(val); };
    fyChart.update();
    $('fyTitle').textContent = state.metric === 'vol' ? 'Transactions by fiscal year' : 'Value transacted by fiscal year';
  }

  /* --------------------------------------------------------- app share chart */
  var APPS = ['PhonePe', 'Google Pay', 'Paytm', 'Others'];
  var APP_COLOR = { 'PhonePe': C.indigo, 'Google Pay': C.pink, 'Paytm': C.orange, 'Others': C.gray };
  var snaps = RAW.appShare.reduce(function (acc, r) { if (acc.indexOf(r.snapshot) < 0) acc.push(r.snapshot); return acc; }, []);
  var segLabels = {
    id: 'segLabels',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '800 13px ' + Chart.defaults.font.family;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function (ds, di) {
        chart.getDatasetMeta(di).data.forEach(function (bar, k) {
          if (Math.abs(bar.x - bar.base) < 46) return;
          ctx.fillStyle = inkOn(toRGB(ds.backgroundColor));
          ctx.fillText(ds.data[k] + '%', (bar.x + bar.base) / 2, bar.y);
        });
      });
      ctx.restore();
    }
  };
  var appChart = new Chart($('appChart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: snaps,
      datasets: APPS.map(function (app) {
        return {
          label: app, backgroundColor: APP_COLOR[app], borderColor: C.surface, borderWidth: 2, borderRadius: 9, borderSkipped: false,
          barThickness: 40,
          data: snaps.map(function (s) {
            return RAW.appShare.filter(function (r) { return r.snapshot === s && r.app === app; })[0].volume_share_pct;
          })
        };
      })
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      scales: {
        x: { stacked: true, min: 0, max: 100, grid: { color: C.grid, drawTicks: false }, border: { display: false }, ticks: { padding: 8, callback: function (v) { return v + '%'; } } },
        y: { stacked: true, grid: { display: false }, border: { color: C.axis }, ticks: { padding: 10, color: C.ink2, font: { weight: '700' } } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface, titleColor: C.ink, bodyColor: C.ink, borderColor: C.axis, borderWidth: 1, cornerRadius: 12, padding: 12,
          titleFont: { weight: '800', size: 13 }, bodyFont: { weight: '700', size: 13 }, boxWidth: 14, boxHeight: 3, boxPadding: 6,
          callbacks: {
            title: function (items) { return items[0].label; },
            label: function (item) { return item.dataset.label + ': ' + item.raw + '% of UPI transactions'; },
            labelColor: function (item) { var c = item.dataset.backgroundColor; return { borderColor: c, backgroundColor: c, borderWidth: 0, borderRadius: 2 }; }
          }
        }
      }
    },
    plugins: [segLabels]
  });
  (function buildAppLegend() {
    var host = $('appLegend');
    APPS.forEach(function (app) {
      var s = el('span', '', app), i = el('i');
      i.style.background = APP_COLOR[app];
      s.insertBefore(i, s.firstChild);
      host.appendChild(s);
    });
  })();

  /* ------------------------------------------------------------------ KPIs */
  var IC = {
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    rupee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12M6 9h12M9 4a5 5 0 0 1 0 10H6l9 7"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.2"/></svg>',
    bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-6 10 6z"/></svg>',
    sum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 7V4H6l6 8-6 8h12v-3"/></svg>'
  };
  var ARROW = {
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'
  };

  function pill(cls, dir, text) {
    var p = el('span', 'pill ' + cls);
    if (dir) p.insertAdjacentHTML('afterbegin', ARROW[dir]);
    p.appendChild(document.createTextNode(text));
    return p;
  }
  function pctPill(pct, label, neutral) {
    if (pct === null) return pill('flat', null, 'YoY n/a (small base)');
    return pill(neutral ? 'flat' : (pct >= 0 ? 'up' : 'down'), pct >= 0 ? 'up' : 'down', signed(pct) + ' ' + label);
  }
  function spark(values, color, gid) {
    var W = 112, H = 40, p = 4;
    if (values.length < 2) return '';
    var mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
    var sx = (W - 2 * p) / (values.length - 1), sy = mx === mn ? 0 : (H - 2 * p) / (mx - mn);
    var pts = values.map(function (v, k) { return [p + k * sx, H - p - (v - mn) * sy]; });
    var d = pts.map(function (q, k) { return (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('');
    var end = pts[pts.length - 1];
    var area = d + 'L' + end[0].toFixed(1) + ' ' + H + 'L' + pts[0][0].toFixed(1) + ' ' + H + 'Z';
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity="0.28"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + area + '" fill="url(#' + gid + ')"/>' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + end[0].toFixed(1) + '" cy="' + end[1].toFixed(1) + '" r="3.6" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
  }

  var firstPaint = true;
  function renderKPIs(v) {
    var l = v[v.length - 1], py = l.i >= 12 ? rows[l.i - 12] : null, n = v.length;
    var baseOK = !!py && py.vol >= 100;
    var sumVal = v.reduce(function (s, r) { return s + r.val; }, 0);
    var sumVol = v.reduce(function (s, r) { return s + r.vol; }, 0);
    var run = 0, cum = v.map(function (r) { run += r.val; return run; });
    var defs = [
      { ico: IC.activity, color: C.indigo, label: 'Transactions in ' + l.label, value: fmtVol(l.vol), sub: 'processed in the month',
        series: v.map(function (r) { return r.vol; }), foot: pctPill(baseOK ? l.yoyVol : null, 'YoY') },
      { ico: IC.rupee, color: C.teal, label: 'Value in ' + l.label, value: fmtVal(l.val), sub: 'moved through UPI',
        series: v.map(function (r) { return r.val; }), foot: pctPill(baseOK ? l.yoyVal : null, 'YoY') },
      { ico: IC.tag, color: C.orange, label: 'Average ticket size', value: rupee(l.tkt), sub: 'per transaction, ' + l.label,
        series: v.map(function (r) { return r.tkt; }), foot: py ? pctPill(pctChange(l.tkt, py.tkt), 'YoY', true) : pctPill(null, '') },
      { ico: IC.bank, color: C.pink, label: 'Banks live (approx.)', value: nf0.format(l.banks), sub: 'on the UPI network',
        series: v.map(function (r) { return r.banks; }),
        foot: py ? pill('up', 'up', '+' + nf0.format(l.banks - py.banks) + ' in 12 mo') : pctPill(null, '') },
      { ico: IC.sum, color: C.indigo, brand: true, label: 'Total in selected period', value: fmtVal(sumVal, 1), sub: fmtVol(sumVol, 1) + ' transactions',
        series: cum, foot: pill('flat', null, n + ' months') }
    ];
    var host = $('kpis');
    host.replaceChildren();
    defs.forEach(function (d, k) {
      var card = el('article', 'kpi');
      if (!firstPaint) card.style.animation = 'none'; else card.style.animationDelay = (k * 60) + 'ms';
      var top = el('div', 'kpi-top'), ico = el('div', 'kpi-ico');
      ico.innerHTML = d.ico;
      ico.style.background = d.brand ? 'linear-gradient(135deg,#4f46e5,#db2777)' : 'linear-gradient(135deg,' + d.color + ',' + rgba(d.color, 0.7) + ')';
      top.appendChild(ico); top.appendChild(el('div', 'kpi-label', d.label));
      var foot = el('div', 'kpi-foot');
      foot.appendChild(d.foot);
      var sp = el('div'); sp.innerHTML = spark(d.series, d.color, 'sg' + k); foot.appendChild(sp);
      card.appendChild(top);
      card.appendChild(el('div', 'kpi-value', d.value));
      card.appendChild(el('div', 'kpi-sub', d.sub));
      card.appendChild(foot);
      host.appendChild(card);
    });
    firstPaint = false;
  }

  /* -------------------------------------------------------------- insights */
  function renderInsights(v) {
    var m = M(), f = v[0], l = v[v.length - 1], months = v.length - 1;
    var items = [];

    var mult = l[m.field] / f[m.field];
    var t1 = mult >= 1 ? fmtX(mult) + ' growth in monthly ' + m.noun
      : nf0.format(Math.round((1 - mult) * 100)) + '% lower monthly ' + m.noun;
    var d1 = m.fmt(f[m.field], 1) + ' in ' + f.label + ' to ' + m.fmt(l[m.field], 2) + ' in ' + l.label;
    if (months >= 12 && mult > 0) d1 += ' — about ' + nf0.format(Math.round((Math.pow(mult, 12 / months) - 1) * 100)) + '% a year, annualised.';
    items.push({ badge: '×', color: C.indigo, title: t1, detail: d1 });

    var pool = v.filter(function (r) { return r.i >= 1 && r[m.mom] !== null && rows[r.i - 1].vol >= 100; });
    if (pool.length) {
      var best = pool.reduce(function (a, b) { return b[m.mom] > a[m.mom] ? b : a; });
      items.push({ badge: '↑', color: C.pink, title: best.label + ': ' + signed(best[m.mom]) + ' in a single month',
        detail: 'The steepest one-month jump in this period, counting only months that started above 100 mn transactions.' });
    } else {
      items.push({ badge: '↑', color: C.pink, title: 'Not enough history', detail: 'Pick a later period to see month-over-month jumps.' });
    }

    var tchg = pctChange(l.tkt, f.tkt);
    var t3 = Math.abs(tchg) < 1 ? 'Average payment held steady near ' + rupee(l.tkt)
      : 'Average payment ' + (tchg >= 0 ? 'rose ' : 'fell ') + nf0.format(Math.round(Math.abs(tchg))) + '%';
    items.push({ badge: RS, color: C.orange, title: t3, detail: rupee(f.tkt) + ' in ' + f.label + ' to ' + rupee(l.tkt) + ' in ' + l.label + '.' });

    var scored = v.filter(function (r) { return r.i >= 1 && r[m.mom] !== null; });
    var dips = scored.filter(function (r) { return r[m.mom] < 0; });
    if (dips.length) {
      var byMonth = {};
      dips.forEach(function (r) { byMonth[MON[r.m - 1]] = (byMonth[MON[r.m - 1]] || 0) + 1; });
      var top = Object.keys(byMonth).sort(function (a, b) { return byMonth[b] - byMonth[a]; })[0];
      items.push({ badge: '↓', color: C.teal, title: dips.length + ' of ' + scored.length + ' months dipped',
        detail: 'Month-on-month declines were most common in ' + top + ' (' + byMonth[top] + ' time' + (byMonth[top] > 1 ? 's' : '') + '); growth otherwise held on.' });
    } else {
      items.push({ badge: '↓', color: C.teal, title: 'No monthly dips', detail: 'Every month in this period beat the one before it.' });
    }

    var host = $('insights');
    host.replaceChildren();
    items.forEach(function (it) {
      var row = el('div', 'insight'), b = el('div', 'insight-badge', it.badge), txt = el('div');
      b.style.background = 'linear-gradient(135deg,' + it.color + ',' + rgba(it.color, 0.72) + ')';
      txt.appendChild(el('b', '', it.title)); txt.appendChild(el('span', '', it.detail));
      row.appendChild(b); row.appendChild(txt); host.appendChild(row);
    });
  }

  /* --------------------------------------------------------------- heatmap */
  var tip = $('tip');
  function showTip(ev, title, lines) {
    tip.replaceChildren();
    tip.appendChild(el('b', '', title));
    lines.forEach(function (t) { tip.appendChild(el('span', '', t)); });
    tip.classList.add('on');
    moveTip(ev);
  }
  function moveTip(ev) {
    var pad = 14, w = tip.offsetWidth, h = tip.offsetHeight, x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.classList.remove('on'); }

  var NEUTRAL = [238, 240, 251], POS = toRGB(C.indigo), NEG = toRGB(C.orange);
  function divColor(g) {
    var k = Math.pow(Math.min(Math.abs(g) / 20, 1), 0.85), T = g >= 0 ? POS : NEG;
    return NEUTRAL.map(function (n, i) { return Math.round(n + (T[i] - n) * k); });
  }
  $('heatBar').style.background = 'linear-gradient(90deg,' + C.orange + ',rgb(' + NEUTRAL.join(',') + '),' + C.indigo + ')';
  var ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

  function renderHeatmap(v) {
    var m = M(), host = $('heatmap');
    host.replaceChildren();
    host.setAttribute('role', 'group');
    var fys = [];
    v.forEach(function (r) { if (fys.indexOf(r.fy) < 0) fys.push(r.fy); });
    var head = el('div', 'heat-row');
    head.appendChild(el('div', 'heat-fy'));
    ORDER.forEach(function (mm) { head.appendChild(el('div', 'heat-col', MON[mm - 1])); });
    host.appendChild(head);
    fys.forEach(function (fy) {
      var row = el('div', 'heat-row');
      row.appendChild(el('div', 'heat-fy', fy));
      ORDER.forEach(function (mm) {
        var r = v.filter(function (x) { return x.fy === fy && x.m === mm; })[0];
        var c = el('div', 'heat-cell');
        var g = r ? r[m.mom] : null;
        if (g === null) {
          c.classList.add('empty');
          if (r) c.textContent = '–';
        } else {
          var rgb = divColor(g);
          c.style.background = 'rgb(' + rgb.join(',') + ')';
          c.style.color = inkOn(rgb);
          c.textContent = signed(g);
          c.setAttribute('role', 'img');
          c.setAttribute('aria-label', r.label + ': ' + signed(g) + ' versus previous month');
          c.addEventListener('pointerenter', function (ev) { showTip(ev, r.label, [signed(g) + ' vs previous month', m.fmt(r[m.field]) + (m.id === 'vol' ? ' transactions' : ' transacted')]); });
          c.addEventListener('pointermove', moveTip);
          c.addEventListener('pointerleave', hideTip);
        }
        row.appendChild(c);
      });
      host.appendChild(row);
    });
    $('heatTitle').textContent = 'Month-over-month momentum in ' + (state.metric === 'vol' ? 'transactions' : 'value');
  }

  /* ------------------------------------------------------------ milestones */
  function renderMilestones(v) {
    var host = $('milestones'), list = v.filter(function (r) { return r.ev; });
    host.replaceChildren();
    if (!list.length) { host.appendChild(el('li', 'none', 'No milestones fall in this period.')); return; }
    list.forEach(function (r) {
      var li = el('li');
      li.appendChild(el('b', '', r.label)); li.appendChild(el('span', '', r.ev));
      host.appendChild(li);
    });
  }

  /* ----------------------------------------------------------------- table */
  var COLS = [
    { k: 'label', t: 'Month', sort: function (r) { return r.i; } },
    { k: 'fy', t: 'FY', sort: function (r) { return r.i; } },
    { k: 'vol', t: 'Transactions (mn)', num: true, f: function (r) { return nf1.format(r.vol); } },
    { k: 'val', t: 'Value (' + RS + ' cr)', num: true, f: function (r) { return nf0.format(r.val); } },
    { k: 'tkt', t: 'Avg ticket (' + RS + ')', num: true, f: function (r) { return nf0.format(r.tkt); } },
    { k: 'banks', t: 'Banks live', num: true, f: function (r) { return nf0.format(r.banks); } },
    { k: 'yoyVol', t: 'YoY volume', num: true, pct: true },
    { k: 'momVol', t: 'MoM volume', num: true, pct: true },
    { k: 'ev', t: 'Milestone', ev: true }
  ];
  function tableRows(v) {
    var q = state.query.trim().toLowerCase();
    var list = v.filter(function (r) { return !q || (r.label + ' ' + r.fy + ' ' + r.ev).toLowerCase().indexOf(q) >= 0; });
    var col = COLS.filter(function (c) { return c.k === state.sortKey; })[0], dir = state.sortDir;
    var key = function (r) { return col.sort ? col.sort(r) : r[col.k]; };
    return list.slice().sort(function (a, b) {
      var x = key(a), y = key(b);
      if (x === null || x === '') return 1;
      if (y === null || y === '') return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }
  function buildHead() {
    var tr = $('thead');
    tr.replaceChildren();
    COLS.forEach(function (c) {
      var th = el('th', c.num ? 'num' : '', c.t), ar = el('span', 'arrow', '');
      th.appendChild(ar);
      th.setAttribute('aria-sort', c.k === state.sortKey ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none');
      if (c.k === state.sortKey) ar.textContent = state.sortDir === 1 ? '▲' : '▼';
      th.addEventListener('click', function () {
        if (state.sortKey === c.k) state.sortDir *= -1;
        else { state.sortKey = c.k; state.sortDir = (c.num) ? -1 : 1; }
        buildHead(); renderTable(view());
      });
      tr.appendChild(th);
    });
  }
  function renderTable(v) {
    var list = tableRows(v), tb = $('tbody'), frag = document.createDocumentFragment();
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      COLS.forEach(function (c) {
        var td = el('td', c.num ? 'num' : c.ev ? 'ev' : '');
        if (c.pct) {
          var x = r[c.k];
          td.textContent = x === null ? '–' : signed(x);
          if (x !== null) td.classList.add(x >= 0 ? 'pos' : 'neg');
        } else if (c.f) td.textContent = c.f(r);
        else td.textContent = r[c.k] || '';
        tr.appendChild(td);
      });
      frag.appendChild(tr);
    });
    tb.replaceChildren(frag);
    $('tableCount').textContent = 'Showing ' + list.length + ' of ' + v.length + ' months in this period';
  }
  function exportCSV() {
    var list = tableRows(view());
    var head = ['month', 'fiscal_year', 'volume_mn', 'value_cr', 'avg_ticket_inr', 'banks_live', 'volume_yoy_pct', 'value_yoy_pct', 'volume_mom_pct', 'value_mom_pct', 'milestone'];
    var q = function (s) { return '"' + String(s).replace(/"/g, '""') + '"'; };
    var lines = [head.join(',')];
    list.forEach(function (r) {
      var mm = ('0' + r.m).slice(-2);
      lines.push([r.y + '-' + mm + '-01', r.fy, r.vol, r.val, r.tkt, r.banks,
        r.yoyVol === null ? '' : r.yoyVol, r.yoyVal === null ? '' : r.yoyVal,
        r.momVol === null ? '' : r.momVol, r.momVal === null ? '' : r.momVal, q(r.ev)].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'upi_monthly_selection.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* -------------------------------------------------------- filters & hero */
  var PRESETS = [
    { id: 'all', label: 'All time', range: function () { return [0, LAST]; } },
    { id: '5y', label: 'Last 5 years', range: function () { return [LAST - 59, LAST]; } },
    { id: '3y', label: 'Last 3 years', range: function () { return [LAST - 35, LAST]; } },
    { id: '1y', label: 'Last 12 months', range: function () { return [LAST - 11, LAST]; } },
    { id: 'covid', label: 'COVID era', range: function () { return [idxOf('Mar 2020'), idxOf('Mar 2021')]; } }
  ];

  function setRange(from, to, preset, anchor) {
    from = clamp(from, 0, LAST); to = clamp(to, 0, LAST);
    if (to - from < MIN_SPAN) {
      if (anchor === 'to') from = Math.max(0, to - MIN_SPAN); else to = Math.min(LAST, from + MIN_SPAN);
      if (to - from < MIN_SPAN) from = Math.max(0, to - MIN_SPAN);
      if (to - from < MIN_SPAN) to = Math.min(LAST, from + MIN_SPAN);
    }
    state.from = from; state.to = to; state.preset = preset || null;
    syncControls(); render();
  }
  function syncControls() {
    $('selFrom').value = String(state.from);
    $('selTo').value = String(state.to);
    Array.prototype.forEach.call($('presetChips').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === state.preset)); });
    Array.prototype.forEach.call($('metricSeg').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric)); });
    Array.prototype.forEach.call($('scaleSeg').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.scale === state.scale)); });
  }
  function buildControls() {
    PRESETS.forEach(function (p) {
      var b = el('button', 'chip', p.label);
      b.type = 'button'; b.dataset.id = p.id;
      b.addEventListener('click', function () { var r = p.range(); setRange(r[0], r[1], p.id); });
      $('presetChips').appendChild(b);
    });
    rows.forEach(function (r) {
      ['selFrom', 'selTo'].forEach(function (id) {
        var o = document.createElement('option'); o.value = String(r.i); o.textContent = r.label; $(id).appendChild(o);
      });
    });
    $('selFrom').addEventListener('change', function (e) { setRange(+e.target.value, state.to, null, 'from'); });
    $('selTo').addEventListener('change', function (e) { setRange(state.from, +e.target.value, null, 'to'); });
    Array.prototype.forEach.call($('metricSeg').children, function (b) {
      b.addEventListener('click', function () { state.metric = b.dataset.metric; syncControls(); render(); });
    });
    Array.prototype.forEach.call($('scaleSeg').children, function (b) {
      b.addEventListener('click', function () { state.scale = b.dataset.scale; syncControls(); render(); });
    });
    $('tableSearch').addEventListener('input', function (e) { state.query = e.target.value; renderTable(view()); });
    $('exportBtn').addEventListener('click', exportCSV);
  }

  function buildHero() {
    var f = rows[0], l = rows[LAST], mult = l.vol / f.vol;
    $('heroSpan').textContent = f.label + ' – ' + l.label;
    $('heroLead').textContent = 'Monthly UPI transactions grew from ' + fmtVol(f.vol, 1) + ' in ' + f.label + ' to ' + fmtVol(l.vol, 1) +
      ' in ' + l.label + ', roughly ' + nf0.format(Math.round(mult / 10) * 10) + '×, while the network grew from about ' + f.banks +
      ' to about ' + l.banks + ' banks. Explore when it took off, what slowed it, and who powers it.';
    var stats = [
      { ico: IC.activity, v: fmtVol(l.vol), t: 'Transactions in ' + l.label },
      { ico: IC.rupee, v: fmtVal(l.val), t: 'Value moved in ' + l.label },
      { ico: IC.bank, v: nf0.format(l.banks), t: 'Banks live (approx.)' }
    ];
    var host = $('heroStats');
    stats.forEach(function (s) {
      var card = el('div', 'hero-stat'), ico = el('div', 'ico'), box = el('div');
      ico.innerHTML = s.ico;
      box.appendChild(el('b', '', s.v)); box.appendChild(el('span', '', s.t));
      card.appendChild(ico); card.appendChild(box); host.appendChild(card);
    });
  }

  function buildNavSpy() {
    var links = Array.prototype.slice.call(document.querySelectorAll('[data-nav]'));
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) links.forEach(function (a) { a.classList.toggle('active', a.dataset.nav === e.target.id); });
      });
    }, { rootMargin: '-35% 0px -55% 0px' });
    links.forEach(function (a) { var s = $(a.dataset.nav); if (s) io.observe(s); });
  }

  /* ---------------------------------------------------------------- render */
  function render() {
    var v = view(), f = v[0], l = v[v.length - 1];
    var sum = $('rangeSummary');
    sum.replaceChildren();
    var b = el('b', '', String(v.length)); sum.appendChild(b);
    sum.appendChild(document.createTextNode(' months · ' + f.label + ' – ' + l.label));
    renderKPIs(v);
    updateMain(v);
    updateYoy(v);
    updateTicketAndBanks(v);
    updateFY(v);
    renderHeatmap(v);
    renderInsights(v);
    renderMilestones(v);
    renderTable(v);
  }

  buildControls();
  buildHero();
  buildHead();
  buildNavSpy();
  syncControls();
  render();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      [mainChart, yoyChart, ticketChart, banksChart, fyChart, appChart].forEach(function (c) { c.update('none'); });
    });
  }
})();
