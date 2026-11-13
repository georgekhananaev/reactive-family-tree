/*
 * Reactive Family Tree: design prototype engine.
 * Throwaway code for comparing visual directions. Not the production layout engine.
 * Author: George Khananaev
 *
 * One fictional family, one layout, one growth loop. The page supplies the
 * leaf drawing and decorations through RFT.mount(config), and the look in CSS.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  function rnd(id, salt) {
    return hash(id + '|' + salt);
  }

  function norm(v) {
    var l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- The fictional Marlow family ---------- */

  var FAMILY = {
    name: 'Marlow',
    root: {
      id: 'elias', given: 'Elias', family: 'Marlow', born: 1898, died: 1971,
      partner: { id: 'ada', given: 'Ada', birthName: 'Finch', born: 1902, died: 1989, since: 1922, from: 'Finch' },
      children: [
        {
          id: 'rosalind', given: 'Rosalind', family: 'Okafor', birthName: 'Marlow', born: 1924, died: 2011,
          partner: { id: 'henry', given: 'Henry', born: 1921, died: 1998, since: 1946, from: 'Okafor' },
          children: [
            {
              id: 'thomas', given: 'Thomas', born: 1948, died: 2020,
              partner: { id: 'lucia', given: 'Lucia', birthName: 'Ferri', born: 1950, since: 1973, from: 'Ferri' },
              children: [
                {
                  id: 'nora', given: 'Nora', family: 'Bell', birthName: 'Okafor', born: 1975,
                  partner: { id: 'sam', given: 'Sam', born: 1973, since: 2002, from: 'Bell' },
                  children: [
                    { id: 'iris', given: 'Iris', born: 2004 },
                    { id: 'leo', given: 'Leo', born: 2008 }
                  ]
                },
                { id: 'daniel', given: 'Daniel', born: 1978 }
              ]
            },
            {
              id: 'margaret', given: 'Margaret', family: 'Hale', birthName: 'Okafor', born: 1951,
              partner: { id: 'paul', given: 'Paul', born: 1949, died: 2015, since: 1977, from: 'Hale' },
              children: [
                {
                  id: 'clara', given: 'Clara', family: 'Brandt', birthName: 'Hale', born: 1980,
                  partner: { id: 'jonas', given: 'Jonas', born: 1979, since: 2009, from: 'Brandt' },
                  children: [
                    { id: 'adaj', given: 'Ada', born: 2012 },
                    { id: 'felix', given: 'Felix', born: 2015 },
                    { id: 'wren', given: 'Wren', born: 2024 }
                  ]
                }
              ]
            },
            { id: 'unknown1', given: 'Unknown', born: 1955, ghost: true }
          ]
        },
        { id: 'walter', given: 'Walter', born: 1927, died: 1944 },
        {
          id: 'edith', given: 'Edith', family: 'Lindqvist', birthName: 'Marlow', born: 1930, died: 2019,
          partner: { id: 'arthur', given: 'Arthur', born: 1928, died: 2003, since: 1953, from: 'Lindqvist' },
          children: [
            {
              id: 'peter', given: 'Peter', born: 1955,
              partner: { id: 'hana', given: 'Hana', birthName: 'Sato', born: 1958, since: 1982, from: 'Sato' },
              children: [
                {
                  id: 'mika', given: 'Mika', born: 1984,
                  partner: { id: 'jo', given: 'Jo', birthName: 'Reyes', born: 1985, since: 2013, from: 'Reyes' },
                  children: [{ id: 'sora', given: 'Sora', born: 2016 }]
                },
                { id: 'elin', given: 'Elin', born: 1987 }
              ]
            },
            {
              id: 'ruth', given: 'Ruth', born: 1958, died: 2001,
              children: [
                {
                  id: 'simon', given: 'Simon', born: 1982,
                  partner: { id: 'amira', given: 'Amira', birthName: 'Haddad', born: 1984, since: 2009, from: 'Haddad' },
                  children: [
                    { id: 'noor', given: 'Noor', born: 2011 },
                    { id: 'eli', given: 'Eli', born: 2014 }
                  ]
                }
              ]
            },
            {
              id: 'karl', given: 'Karl', born: 1962,
              partner: { id: 'ines', given: 'Ines', birthName: 'Moreno', born: 1965, since: 1990, from: 'Moreno' },
              children: [
                { id: 'vera', given: 'Vera', born: 1992 },
                { id: 'oskar', given: 'Oskar', born: 1995 },
                { id: 'lena', given: 'Lena', born: 1998, pending: true, suggestedBy: 'Karl' }
              ]
            }
          ]
        },
        {
          id: 'george', given: 'George', born: 1934, died: 2022,
          partner: { id: 'marta', given: 'Marta', birthName: 'Novak', born: 1938, since: 1959, from: 'Novak' },
          children: [
            {
              id: 'frank', given: 'Frank', born: 1964, collapsed: true,
              partner: { id: 'joan', given: 'Joan', birthName: 'Ward', born: 1966, since: 1992, from: 'Ward' },
              children: [
                { id: 'alice', given: 'Alice', born: 1994 },
                { id: 'max', given: 'Max', born: 1997 },
                { id: 'tess', given: 'Tess', born: 2001 }
              ]
            },
            {
              id: 'helen', given: 'Helen', family: 'Stein', birthName: 'Marlow', born: 1961,
              partner: { id: 'david', given: 'David', born: 1960, since: 1987, from: 'Stein' },
              children: [
                {
                  id: 'ben', given: 'Ben', born: 1989,
                  partner: { id: 'priya', given: 'Priya', birthName: 'Rao', born: 1990, since: 2018, from: 'Rao' },
                  children: [{ id: 'kiran', given: 'Kiran', born: 2020 }]
                },
                { id: 'sophie', given: 'Sophie', born: 1992 }
              ]
            }
          ]
        }
      ]
    }
  };

  /* ---------- Leaf species. Stem at 0,0, tip pointing up ---------- */

  var SHAPES = {
    beech: {
      d: 'M0,-8 C-18,-18 -20,-44 0,-64 C20,-44 18,-18 0,-8 Z',
      v: 'M0,-8 L0,-58 M0,-18 L-10,-27 M0,-18 L10,-27 M0,-28 L-12,-38 M0,-28 L12,-38 M0,-38 L-10,-47 M0,-38 L10,-47 M0,-48 L-6,-55 M0,-48 L6,-55'
    },
    olive: {
      d: 'M0,-8 C-10,-20 -11,-46 0,-66 C11,-46 10,-20 0,-8 Z',
      v: 'M0,-8 L0,-60 M0,-24 L-5,-31 M0,-24 L5,-31 M0,-38 L-5,-45 M0,-38 L5,-45'
    },
    ginkgo: {
      d: 'M0,-12 C-8,-18 -28,-28 -31,-44 C-24,-56 -9,-58 -2,-50 L0,-45 L2,-50 C9,-58 24,-56 31,-44 C28,-28 8,-18 0,-12 Z',
      v: 'M0,-12 L-23,-45 M0,-12 L-13,-52 M0,-12 L0,-44 M0,-12 L13,-52 M0,-12 L23,-45'
    },
    linden: {
      d: 'M0,-8 C-10,-6 -26,-16 -24,-36 C-22,-52 -8,-56 0,-66 C8,-56 22,-52 24,-36 C26,-16 10,-6 0,-8 Z',
      v: 'M0,-8 L0,-60 M0,-20 L-14,-30 M0,-20 L14,-30 M0,-32 L-13,-43 M0,-32 L13,-43 M0,-44 L-8,-52 M0,-44 L8,-52'
    }
  };
  var PARTNER_SPECIES = ['olive', 'ginkgo', 'linden'];

  /* ---------- Geometry ---------- */

  function bez(b, t) {
    var u = 1 - t;
    return {
      x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x,
      y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y
    };
  }

  function bezTangent(b, t) {
    var u = 1 - t;
    return norm({
      x: 3 * u * u * (b[1].x - b[0].x) + 6 * u * t * (b[2].x - b[1].x) + 3 * t * t * (b[3].x - b[2].x),
      y: 3 * u * u * (b[1].y - b[0].y) + 6 * u * t * (b[2].y - b[1].y) + 3 * t * t * (b[3].y - b[2].y)
    });
  }

  /* A small, fast, repeatable noise for the pen-drawn edge of a branch */
  function grain(seed, i) {
    var n = (seed + Math.imul(i, 374761393)) | 0;
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    n = Math.imul(n ^ (n >>> 12), 0x297a2d39);
    return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
  }
  function edgeNoise(seed, x) {
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    var a = grain(seed, i), b = grain(seed, i + 1);
    return (a + (b - a) * u) * 2 - 1;
  }
  function inkFor(id, length, amount) {
    return { seed: Math.floor(hash(id) * 2147483647), length: length, amount: amount };
  }

  /* A filled, tapered outline of the first `t` of a curve, with a pointed growing
     tip. With `ink`, the edge is slightly uneven, like a pen line. That unevenness
     is part of the shape itself, so it costs nothing to draw and is always on.
     A branch that has finished growing ends square (`squareEnd`), so it meets the
     branches that continue from it without a notch. A root keeps its point. */
  function outline(b, widthAt, t, ink, squareEnd) {
    if (t <= 0.002) return '';
    // This runs for every growing branch and root on every frame, so it is written
    // plainly: no helper calls, no throwaway objects, numbers rounded by hand.
    var N = ink ? Math.max(6, Math.min(34, Math.ceil(ink.length * t / 9))) : 16;
    var x0 = b[0].x, y0 = b[0].y, x1 = b[1].x, y1 = b[1].y, x2 = b[2].x, y2 = b[2].y, x3 = b[3].x, y3 = b[3].y;
    var tipLen = Math.min(t, 0.25) * (1 - Math.max(0, (t - 0.8) / 0.2)) + 1e-4;
    var pointed = !(squareEnd && t >= 1);
    var left = '', right = '';
    for (var i = 0; i <= N; i++) {
      var s = t * i / N, u = 1 - s;
      var c0 = u * u * u, c1 = 3 * u * u * s, c2 = 3 * u * s * s, c3 = s * s * s;
      var px = c0 * x0 + c1 * x1 + c2 * x2 + c3 * x3;
      var py = c0 * y0 + c1 * y1 + c2 * y2 + c3 * y3;
      var tx = 3 * u * u * (x1 - x0) + 6 * u * s * (x2 - x1) + 3 * s * s * (x3 - x2);
      var ty = 3 * u * u * (y1 - y0) + 6 * u * s * (y2 - y1) + 3 * s * s * (y3 - y2);
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      tx /= tl; ty /= tl;
      var w = widthAt(s) / 2;
      var k = pointed ? (t - s) / tipLen : 1;
      if (k < 1) w *= Math.sqrt(k > 0 ? k : 0);
      var wl = w, wr = w;
      if (ink) {
        var rough = Math.min(1.5, 0.3 + w * 0.16) * (k < 1 ? (k > 0 ? k : 0) : 1) * ink.amount;
        var along = s * ink.length / 22;
        wl += edgeNoise(ink.seed, along) * rough;
        wr += edgeNoise(ink.seed + 7717, along) * rough;
      }
      left += (i ? 'L' : 'M') + Math.round((px - ty * wl) * 10) / 10 + ',' + Math.round((py + tx * wl) * 10) / 10;
      right = 'L' + Math.round((px + ty * wr) * 10) / 10 + ',' + Math.round((py - tx * wr) * 10) / 10 + right;
    }
    return left + right + 'Z';
  }

  function centreline(b) {
    return 'M' + b[0].x.toFixed(1) + ',' + b[0].y.toFixed(1) +
      'C' + b[1].x.toFixed(1) + ',' + b[1].y.toFixed(1) + ' ' +
      b[2].x.toFixed(1) + ',' + b[2].y.toFixed(1) + ' ' +
      b[3].x.toFixed(1) + ',' + b[3].y.toFixed(1);
  }

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 2.2);
  }

  /* ---------- Mount ---------- */

  function mount(config) {
    var opt = {
      spread: 92,
      radii: [0, 185, 355, 520, 680],
      trunk: 160,
      wild: 1,
      leafScale: 1,
      nameSize: 22,
      yearsSize: 14,
      branchBase: 3.3,
      ink: 1,
      roots: true,
      sap: false,
      minYear: 1898,
      maxYear: 2026
    };
    for (var key in config) opt[key] = config[key];

    var svg = document.getElementById('tree');
    var world = document.getElementById('world');
    var stage = document.getElementById('stage');
    var card = document.getElementById('card');
    var yearInput = document.getElementById('year');
    var yearOut = document.getElementById('yearOut');
    var playBtn = document.getElementById('play');
    /* The address can set a starting state, for example #year=1950&person=rosalind&open&still */
    var params = {};
    window.location.hash.slice(1).split('&').forEach(function (pair) {
      var parts = pair.split('=');
      if (parts[0]) params[parts[0]] = parts.length > 1 ? decodeURIComponent(parts[1]) : true;
    });
    var still = !!params.still || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.classList.toggle('still', still);

    var state = { year: opt.maxYear, selected: null, hover: null, playing: false };
    var maxDepth = opt.radii.length - 1;
    var nodes = [];
    var people = {};
    var root = FAMILY.root;

    /* --- Prepare the graph --- */
    (function prep(n, depth, parent) {
      n.depth = depth;
      n.parent = parent;
      n.children = n.children || [];
      n.family = n.family || (parent ? parent.family : FAMILY.name);
      n.node = n;
      n.species = 'beech';
      n.p = 0;
      nodes.push(n);
      people[n.id] = n;
      if (n.partner) {
        var q = n.partner;
        q.node = n;
        q.isPartner = true;
        q.family = n.family;
        q.species = PARTNER_SPECIES[Math.floor(hash(q.from) * PARTNER_SPECIES.length)];
        people[q.id] = q;
      }
      var kidsWeight = 0, kidsCount = 0;
      n.children.forEach(function (c) {
        prep(c, depth + 1, n);
        kidsWeight += c.weight;
        kidsCount += c.count;
      });
      n.count = 1 + (n.partner ? 1 : 0) + kidsCount;
      var own = (maxDepth / Math.max(depth, 1.5)) * (n.partner ? 1.5 : 1);
      n.weight = Math.max(own, kidsWeight);
    })(root, 0, null);

    /* --- Fan layout: generations on arcs, the family order as angle --- */
    var S = opt.spread * Math.PI / 180;
    (function place(n, a0, a1) {
      var kids = n.children;
      if (kids.length) {
        var sum = kids.reduce(function (s, c) { return s + c.weight; }, 0);
        var span = (a1 - a0) * sum / n.weight;
        var cur = (a0 + a1) / 2 - span / 2;
        kids.forEach(function (c) {
          var w = span * c.weight / sum;
          place(c, cur, cur + w);
          cur += w;
        });
        n.theta = (kids[0].theta + kids[kids.length - 1].theta) / 2;
      } else {
        n.theta = (a0 + a1) / 2;
      }
      if (n.depth > 0) n.theta += (rnd(n.id, 't') - 0.5) * 0.035 * opt.wild;
      var r = opt.radii[n.depth] + (n.depth ? (rnd(n.id, 'r') - 0.5) * 30 * opt.wild : 0);
      n.x = r * Math.sin(n.theta);
      n.y = -r * Math.cos(n.theta);
    })(root, -S, S);

    function branchWidth(count) {
      return opt.branchBase * Math.pow(count, 0.5);
    }

    nodes.forEach(function (n) {
      if (!n.parent) {
        n.dir = { x: 0, y: -1 };
        return;
      }
      var p = n.parent;
      var P0 = { x: p.x, y: p.y }, P3 = { x: n.x, y: n.y };
      var len = Math.hypot(P3.x - P0.x, P3.y - P0.y);
      var chord = { x: (P3.x - P0.x) / len, y: (P3.y - P0.y) / len };
      var radial = { x: Math.sin(n.theta), y: -Math.cos(n.theta) };
      var dIn = norm({ x: p.dir.x * 0.65 + chord.x * 0.35, y: p.dir.y * 0.65 + chord.y * 0.35 });
      var dOut = norm({ x: radial.x * 0.6 + chord.x * 0.4, y: radial.y * 0.6 + chord.y * 0.4 });
      var side = { x: -chord.y, y: chord.x };
      var wobA = (rnd(n.id, 'a') - 0.5) * len * 0.16 * opt.wild;
      var wobB = (rnd(n.id, 'b') - 0.5) * len * 0.16 * opt.wild;
      var P1 = { x: P0.x + dIn.x * len * 0.4 + side.x * wobA, y: P0.y + dIn.y * len * 0.4 + side.y * wobA };
      var P2 = { x: P3.x - dOut.x * len * 0.36 + side.x * wobB, y: P3.y - dOut.y * len * 0.36 + side.y * wobB };
      n.bz = [P0, P1, P2, P3];
      n.len = len;
      n.dir = norm({ x: P3.x - P2.x, y: P3.y - P2.y });
      n.w0 = branchWidth(n.count);
      n.w1 = n.children.length ? branchWidth(n.count) * 0.8 : 2;
      n.duration = Math.max(320, Math.min(700, 480 * len / 200));
      n.ink = inkFor(n.id, len * 1.08, opt.ink);
    });

    var T = opt.trunk;
    var trunkTop = branchWidth(root.count) * 0.95;
    var trunkBz = [
      { x: 0, y: T },
      { x: 9 * opt.wild, y: T * 0.66 },
      { x: -7 * opt.wild, y: T * 0.33 },
      { x: 0, y: 0 }
    ];
    function trunkWidth(s) {
      return trunkTop + (trunkTop * 1.5) * Math.pow(1 - s, 2.6);
    }
    var trunk = { p: 0, ink: inkFor('trunk', T, opt.ink) };

    /* --- Layers --- */
    var layer = {};
    ['back', 'roots', 'branches', 'sap', 'blossoms', 'leaves', 'labels'].forEach(function (name) {
      layer[name] = el('g', { class: 'layer-' + name }, svg);
    });

    /* --- Roots ---
       The roots are a small tree of their own, growing downward. One number,
       rootReach (0 to 1), says how developed the whole system is. Every root
       knows at what reach it is born and over what span it grows, and a fork is
       born at the moment its parent's tip passes the fork point, so nothing
       appears out of thin air. A first small root exists before the trunk. */
    var roots = [];
    var ROOT_SEED = 0.1;   // the reach of the first sprout, before any trunk
    var ROOT_EASE = 1.6;   // a root lengthens quickly at first, then slows
    var rootReach = 0;

    function addRoot(b, width, birth, span) {
      if (birth > 0.95) return null;
      var root = {
        b: b,
        width: width,
        birth: birth,
        span: Math.max(0.04, Math.min(span, 1 - birth)),
        ink: inkFor('root' + roots.length, Math.hypot(b[3].x - b[0].x, b[3].y - b[0].y) * 1.1, opt.ink * 0.7),
        el: el('path', { class: 'root' }, layer.roots)
      };
      roots.push(root);
      return root;
    }

    /* A root sets off along its heading (0 is straight down), wanders a little,
       and turns partway toward straight down by its tip. */
    function rootCurve(id, from, heading, length, sink) {
      var d0 = { x: Math.sin(heading), y: Math.cos(heading) };
      var endHeading = heading * (1 - sink);
      var d1 = { x: Math.sin(endHeading), y: Math.cos(endHeading) };
      var side = { x: d0.y, y: -d0.x };
      var deepest = T + 142;
      var end = {
        x: from.x + d0.x * length * 0.55 + d1.x * length * 0.45,
        y: Math.min(deepest, from.y + d0.y * length * 0.55 + d1.y * length * 0.45)
      };
      var w1 = (rnd(id, 'w1') - 0.5) * length * 0.22, w2 = (rnd(id, 'w2') - 0.5) * length * 0.22;
      return [
        from,
        { x: from.x + d0.x * length * 0.33 + side.x * w1, y: from.y + d0.y * length * 0.33 + side.y * w1 },
        { x: end.x - d1.x * length * 0.3 + side.x * w2, y: Math.min(deepest, end.y - d1.y * length * 0.3 + side.y * w2) },
        end
      ];
    }

    function growForks(parent, id, count, level) {
      if (!parent) return;
      for (var f = 0; f < count; f++) {
        var fid = id + (level === 1 ? 'f' : 'h') + f;
        var at = 0.28 + (f + rnd(fid, 's')) / count * 0.55;
        var from = bez(parent.b, at), along = bezTangent(parent.b, at);
        var turn = (f % 2 ? 1 : -1) * (rnd(fid, 'd') > 0.2 ? 1 : -1) * (0.5 + rnd(fid, 'u') * 0.6);
        var heading = Math.max(-1.45, Math.min(1.45, Math.atan2(along.x, along.y) + turn));
        var length = level === 1 ? 46 + rnd(fid, 'l') * 58 : 18 + rnd(fid, 'l') * 24;
        var parentWidthHere = parent.width * Math.pow(1 - at, 0.8) + 0.9;
        var born = parent.birth + (1 - Math.pow(1 - at, 1 / ROOT_EASE)) * parent.span + 0.01;
        var fork = addRoot(rootCurve(fid, from, heading, length, 0.45),
          Math.min(parentWidthHere * 0.7, level === 1 ? 5 : 2.2), born, level === 1 ? 0.3 : 0.16);
        if (fork && level === 1 && rnd(fid, 'h') > 0.35) growForks(fork, fid, 1 + (rnd(fid, 'g') > 0.6 ? 1 : 0), 2);
      }
    }

    if (opt.roots) {
      // The taproot comes first, straight down
      var tap = addRoot(rootCurve('tap', { x: 0, y: T - 6 }, (rnd('tap', 'h') - 0.5) * 0.25, 128, 0.2), 15, 0, 0.6);
      // Then side roots, a pair at a time: the first are shallow and long, later ones steeper
      for (var i = 0; i < 8; i++) {
        var id = 'lat' + i;
        var sideSign = i % 2 ? 1 : -1, tier = Math.floor(i / 2);
        var heading = sideSign * (82 - tier * 14 + (rnd(id, 'h') - 0.5) * 10) * Math.PI / 180;
        var lateral = addRoot(
          rootCurve(id, { x: sideSign * (5 + tier * 2.5), y: T + 2 + tier * 3 }, heading, 215 - tier * 34 + rnd(id, 'l') * 40, 0.32 + rnd(id, 's') * 0.2),
          12.5 - tier * 1.6, 0.02 + i * 0.042, 0.62);
        growForks(lateral, id, 2 + (rnd(id, 'n') > 0.5 ? 1 : 0), 1);
      }
      growForks(tap, 'tap', 3, 1);
    }

    function drawRoots() {
      // Thickening is drawn in fine steps rather than on every frame, so a root that
      // has reached its length is only redrawn when it has visibly thickened.
      var girthStep = Math.round(rootReach * 50);
      for (var r = 0; r < roots.length; r++) {
        var root = roots[r];
        var p = Math.max(0, Math.min(1, (rootReach - root.birth) / root.span));
        var drawn = p <= 0 ? 'none' : p >= 1 ? 'full:' + girthStep : p + ':' + girthStep;
        if (root.drawn === drawn) continue;
        root.drawn = drawn;
        var t = 1 - Math.pow(1 - p, ROOT_EASE);
        // A root keeps thickening after it has reached its length, as the tree above it grows
        var girth = 0.3 + 0.4 * p + 0.3 * girthStep / 50;
        root.el.setAttribute('d', t <= 0.002 ? '' : rootOutline(root, t, girth));
      }
    }
    function rootOutline(root, t, girth) {
      return outline(root.b, function (s) { return (root.width * Math.pow(1 - s, 0.8) + 0.9) * girth; }, t, root.ink);
    }

    var trunkPath = el('path', { class: 'branch trunk' }, layer.branches);

    /* --- Branches, sap, leaves, labels --- */
    function leafAngles(n) {
      var base = Math.atan2(n.dir.x, -n.dir.y);
      if (n.partner) return [base - 0.66, base + 0.66];
      if (n.children.length) return [base + (rnd(n.id, 's') > 0.5 ? 0.7 : -0.7)];
      return [base];
    }

    function leafSize(p) {
      var s = opt.leafScale;
      if (p.born >= 2021) return s * 0.58;
      if (p.born >= 2008) return s * 0.8;
      return s;
    }

    function makeLeaf(p, n, angle) {
      var s = leafSize(p);
      var shape = SHAPES[p.species];
      var g = el('g', {
        class: 'leaf-node' + (p.isPartner ? ' is-partner' : ''),
        'data-id': p.id,
        tabindex: '0',
        role: 'button',
        transform: 'translate(' + n.x.toFixed(1) + ' ' + n.y.toFixed(1) + ') rotate(' + (angle * 180 / Math.PI).toFixed(1) + ') scale(' + s.toFixed(2) + ')'
      }, layer.leaves);
      var gustDelay = (n.x / opt.radii[maxDepth] + 1) * 0.6 + rnd(p.id, 'd') * 0.25;
      g.innerHTML = '<g class="unfurl"><g class="sway" style="--dl:' + gustDelay.toFixed(2) + 's">' +
        opt.renderLeaf(p, shape, n) + '<path class="hit" d="' + shape.d + '"/></g></g>';
      p.leafEl = g;

      labelJobs.push({ p: p, n: n, angle: angle, s: s });
      leafBlobs.push({ p: p, x: n.x + Math.sin(angle) * 38 * s, y: n.y - Math.cos(angle) * 38 * s, r: 25 * s });
    }

    /* Each label tries a few spots around its leaf and takes the one that
       overlaps the fewest leaves and already-placed labels. */
    var labelJobs = [], leafBlobs = [], placedLabels = [];

    function labelBox(x, y, ox, oy, textWidth) {
      var ns = opt.nameSize, ys = opt.yearsSize, box = { x: x, y: y };
      if (Math.abs(ox) >= 0.38) {
        box.anchor = ox > 0 ? 'start' : 'end';
        box.x += ox > 0 ? 3 : -3;
        box.nameDy = ns * 0.15;
        box.yearsDy = box.nameDy + ys + 3;
      } else if (oy < 0) {
        box.anchor = 'middle';
        box.yearsDy = -2;
        box.nameDy = -2 - ys - 3;
      } else {
        box.anchor = 'middle';
        box.nameDy = ns;
        box.yearsDy = ns + ys + 3;
      }
      box.left = box.anchor === 'start' ? box.x : box.anchor === 'end' ? box.x - textWidth : box.x - textWidth / 2;
      box.right = box.left + textWidth;
      box.top = box.y + box.nameDy - ns * 0.8;
      box.bottom = box.y + box.yearsDy + 3;
      return box;
    }

    function labelCost(box, self) {
      var cost = 0, i;
      for (i = 0; i < placedLabels.length; i++) {
        var o = placedLabels[i];
        if (box.left < o.right + 4 && box.right > o.left - 4 && box.top < o.bottom + 2 && box.bottom > o.top - 2) cost += 3;
      }
      for (i = 0; i < leafBlobs.length; i++) {
        var blob = leafBlobs[i];
        if (blob.p === self) continue;
        var nx = Math.max(box.left, Math.min(blob.x, box.right));
        var ny = Math.max(box.top, Math.min(blob.y, box.bottom));
        if (Math.hypot(nx - blob.x, ny - blob.y) < blob.r) cost += 2;
      }
      return cost;
    }

    function placeLabels() {
      labelJobs.sort(function (a, b) { return b.n.depth - a.n.depth; });
      labelJobs.forEach(function (job) {
        var p = job.p, n = job.n, s = job.s;
        var dx = Math.sin(job.angle), dy = -Math.cos(job.angle);
        var px = -dy, py = dx;
        var nameWidth = (p.ghost ? 7 : p.given.length) * opt.nameSize * 0.52;
        var yearsWidth = (p.died ? 9 : p.ghost ? 10 : p.pending ? 9 : 4) * opt.yearsSize * 0.5;
        var textWidth = Math.max(nameWidth, yearsWidth);
        var tip = 66 * s + 12, side = 28 * s + 10;
        var spots = [
          [dx * tip, dy * tip],
          [dx * 40 * s + px * side, dy * 40 * s + py * side],
          [dx * 40 * s - px * side, dy * 40 * s - py * side],
          [dx * (tip + 22), dy * (tip + 22)],
          [dx * 62 * s + px * side, dy * 62 * s + py * side],
          [dx * 62 * s - px * side, dy * 62 * s - py * side],
          [dx * 14 * s + px * (side + 8), dy * 14 * s + py * (side + 8)],
          [dx * 14 * s - px * (side + 8), dy * 14 * s - py * (side + 8)]
        ];
        var best = null, bestCost = Infinity;
        spots.forEach(function (spot, index) {
          var len = Math.hypot(spot[0], spot[1]) || 1;
          var box = labelBox(n.x + spot[0], n.y + spot[1], spot[0] / len, spot[1] / len, textWidth);
          var cost = labelCost(box, p) + index * 0.1;
          if (cost < bestCost) { bestCost = cost; best = box; }
        });
        placedLabels.push(best);
        var label = el('g', { class: 'label', transform: 'translate(' + best.x.toFixed(1) + ' ' + best.y.toFixed(1) + ')' }, layer.labels);
        var nameText = el('text', { class: 'name', 'text-anchor': best.anchor, y: best.nameDy.toFixed(1) }, label);
        nameText.textContent = p.ghost ? 'Unknown' : p.given;
        p.yearsText = el('text', { class: 'years', 'text-anchor': best.anchor, y: best.yearsDy.toFixed(1) }, label);
        p.labelEl = label;
      });
    }

    nodes.forEach(function (n) {
      if (n.parent) {
        n.pathEl = el('path', { class: 'branch', 'data-id': n.id }, layer.branches);
        if (opt.sap) n.sapEl = el('path', { class: 'sap', d: centreline(n.bz) }, layer.sap);
      }
      var angles = leafAngles(n);
      makeLeaf(n, n, angles[0]);
      if (n.partner) {
        makeLeaf(n.partner, n, angles[1]);
        n.blossomEl = el('g', { class: 'blossom', transform: 'translate(' + n.x.toFixed(1) + ' ' + n.y.toFixed(1) + ')' }, layer.blossoms);
        n.blossomEl.innerHTML = '<g class="unfurl">' + (opt.renderBlossom ? opt.renderBlossom(n) : '') + '</g>';
      }
      if (n.collapsed) {
        var bx = n.x + n.dir.x * 86, by = n.y + n.dir.y * 86;
        n.budEl = el('g', { class: 'bud', 'data-id': n.id, tabindex: '0', role: 'button', transform: 'translate(' + bx.toFixed(1) + ' ' + by.toFixed(1) + ')' }, layer.leaves);
        n.budEl.innerHTML = '<g class="unfurl"><circle class="bud-shape" r="18"/><text class="bud-count" text-anchor="middle" y="5.5"></text></g>';
        n.budEl.setAttribute('aria-label', 'Show ' + n.given + "'s children");
      }
    });
    if (opt.sap) trunk.sapEl = el('path', { class: 'sap', d: centreline(trunkBz) }, layer.sap);
    placeLabels();

    /* --- World bounds --- */
    var bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: T + (opt.roots ? 150 : 46) };
    nodes.forEach(function (n) {
      bounds.x0 = Math.min(bounds.x0, n.x);
      bounds.x1 = Math.max(bounds.x1, n.x);
      bounds.y0 = Math.min(bounds.y0, n.y);
    });
    bounds.x0 -= 150; bounds.x1 += 150; bounds.y0 -= 125;
    var worldWidth = bounds.x1 - bounds.x0, worldHeight = bounds.y1 - bounds.y0;
    svg.setAttribute('viewBox', [bounds.x0, bounds.y0, worldWidth, worldHeight].join(' '));
    svg.setAttribute('width', worldWidth);
    svg.setAttribute('height', worldHeight);
    world.style.width = worldWidth + 'px';
    world.style.height = worldHeight + 'px';

    if (opt.decorate) {
      opt.decorate({
        back: layer.back,                              // drawn in the tree's own svg, behind it
        behind: world.querySelector('.behind'),        // ordinary elements behind the tree
        ahead: world.querySelector('.ahead'),          // ordinary elements in front of it
        // where an ordinary element centred on a point of the tree goes
        spot: function (cx, cy, rx, ry) {
          return 'left:' + (cx - rx - bounds.x0).toFixed(1) + 'px;top:' + (cy - ry - bounds.y0).toFixed(1) + 'px;width:' + (rx * 2) + 'px;height:' + (ry * 2) + 'px';
        },
        bounds: bounds, ground: T, el: el, rnd: rnd, nodes: nodes
      });
    }

    /* --- Visibility rules --- */
    function hiddenByCollapse(n) {
      for (var a = n.parent; a; a = a.parent) if (a.collapsed) return true;
      return false;
    }
    function nodeVisible(n) {
      return n.born <= state.year && !hiddenByCollapse(n);
    }
    function personState(p) {
      if (p.ghost) return 'ghost';
      if (p.pending) return 'pending';
      if (p.died && p.died <= state.year) return 'gone';
      return 'living';
    }
    function yearsLabel(p) {
      if (p.ghost) return 'about ' + p.born;
      if (p.pending) return 'suggested';
      if (p.died && p.died <= state.year) return p.born + '–' + p.died;
      return String(p.born);
    }

    function setOn(element, on) {
      if (element && element.classList.contains('on') !== on) element.classList.toggle('on', on);
    }

    function syncPerson(p, on) {
      setOn(p.leafEl, on);
      setOn(p.labelEl, on);
      var st = personState(p);
      if (p.stateNow !== st) {
        if (p.stateNow) p.leafEl.classList.remove('state-' + p.stateNow);
        p.leafEl.classList.add('state-' + st);
        p.stateNow = st;
      }
      var text = yearsLabel(p);
      if (p.yearsNow !== text) {
        p.yearsNow = text;
        p.yearsText.textContent = text;
        p.leafEl.setAttribute('aria-label', (p.ghost ? 'Unknown person' : p.given + ' ' + p.family) + ', ' + text);
      }
    }

    function syncNode(n, arrived) {
      var on = arrived && nodeVisible(n);
      syncPerson(n, on);
      if (n.partner) {
        var partnerOn = on && n.partner.since <= state.year;
        syncPerson(n.partner, partnerOn);
        setOn(n.blossomEl, partnerOn);
      }
      if (n.budEl) {
        var waiting = n.children.filter(function (c) { return c.born <= state.year; }).length;
        setOn(n.budEl, on && n.collapsed && waiting > 0);
        if (n.budWaiting !== waiting) {
          n.budWaiting = waiting;
          n.budEl.querySelector('.bud-count').textContent = '+' + waiting;
        }
      }
      if (n.sapEl) setOn(n.sapEl, on);
    }

    /* --- Growth loop: one mechanism for first load, the year slider and opening a bud --- */
    var running = false, last = 0, growing = false, moving = false, whenSettled = null;

    function drawTrunk() {
      trunkPath.setAttribute('d', outline(trunkBz, trunkWidth, easeOut(trunk.p), trunk.ink, true));
    }
    function drawBranch(n) {
      n.pathEl.setAttribute('d', outline(n.bz, function (s) { return n.w0 + (n.w1 - n.w0) * s; }, easeOut(n.p), n.ink, true));
    }
    function frame(now) {
      var dt = Math.min(50, now - last);
      last = now;
      var active = false;

      // The first root goes down before the trunk comes up
      var sprouted = still || !roots.length || rootReach >= ROOT_SEED * 0.85;
      if (trunk.p < 1) {
        if (sprouted) {
          trunk.p = still ? 1 : Math.min(1, trunk.p + dt / 760);
          drawTrunk();
        }
        active = true;
      }
      var grown = trunk.p;
      if (trunk.sapEl) setOn(trunk.sapEl, trunk.p >= 1);

      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!n.parent) {
          syncNode(n, trunk.p >= 1);
          continue;
        }
        var want = nodeVisible(n);
        var parentP = n.parent.parent ? n.parent.p : trunk.p;
        var before = n.p;
        if (want && n.p < 1 && parentP >= 1) {
          n.p = still ? 1 : Math.min(1, n.p + dt / n.duration);
        } else if (!want && n.p > 0) {
          var clear = true;
          for (var c = 0; c < n.children.length; c++) if (n.children[c].p > 0) clear = false;
          if (clear) n.p = still ? 0 : Math.max(0, n.p - dt / (n.duration * 0.6));
        }
        if (n.p !== before) {
          drawBranch(n);
          active = true;
        } else if ((want && n.p < 1) || (!want && n.p > 0)) {
          active = true;
        }
        grown += n.p;
        syncNode(n, n.p >= 1);
      }

      // The roots grow in step with everything above ground, a little ahead of it:
      // how much of the tree has grown decides how far the roots have reached.
      var rootsMoving = false;
      if (roots.length) {
        var reach = ROOT_SEED + (1 - ROOT_SEED) * Math.pow(grown / nodes.length, 0.6);
        var gap = reach - rootReach;
        if (Math.abs(gap) > 0.0008) {
          rootReach = still ? reach : rootReach + gap * (1 - Math.exp(-dt / 280));
          rootsMoving = true;
        } else if (gap !== 0) {
          rootReach = reach;
        }
        drawRoots();
      }

      growing = active;
      if (!active && whenSettled) {
        var done = whenSettled;
        whenSettled = null;
        done();
      }
      if (active || rootsMoving) {
        requestAnimationFrame(frame);
        return;
      }
      running = false;
    }

    function kick() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    function regrow() {
      trunk.p = 0;
      drawTrunk();
      nodes.forEach(function (n) {
        n.p = 0;
        if (n.pathEl) n.pathEl.setAttribute('d', '');
        syncNode(n, false);
      });
      rootReach = 0;
      drawRoots();
      kick();
    }

    /* --- Year slider --- */
    function setYear(year) {
      state.year = Math.max(opt.minYear, Math.min(opt.maxYear, Math.round(year)));
      yearInput.value = state.year;
      yearOut.textContent = state.year;
      if (state.selected && !card.hidden) renderCard(state.selected);
      kick();
    }

    var playTimer = null;
    function stopPlaying() {
      state.playing = false;
      clearInterval(playTimer);
      playBtn.textContent = 'Play';
    }
    function togglePlay() {
      if (state.playing) return stopPlaying();
      if (state.year >= opt.maxYear) setYear(opt.minYear);
      state.playing = true;
      playBtn.textContent = 'Pause';
      playTimer = setInterval(function () {
        if (state.year >= opt.maxYear) return stopPlaying();
        setYear(state.year + 1);
      }, 110);
    }

    /* --- Highlighting the route to the trunk --- */
    function refreshLit() {
      var target = state.selected || state.hover;
      nodes.forEach(function (n) {
        if (n.pathEl) n.pathEl.classList.remove('lit');
        if (n.sapEl) n.sapEl.classList.remove('lit');
      });
      trunkPath.classList.toggle('lit', !!target);
      if (trunk.sapEl) trunk.sapEl.classList.toggle('lit', !!target);
      svg.classList.toggle('has-lit', !!target);
      if (!target) return;
      for (var n = target.node; n && n.parent; n = n.parent) {
        n.pathEl.classList.add('lit');
        if (n.sapEl) n.sapEl.classList.add('lit');
      }
    }

    /* --- Person card --- */
    function plural(count, one, many) {
      return count + ' ' + (count === 1 ? one : many);
    }

    function describe(p) {
      var n = p.node, lines = [];
      if (p.isPartner) {
        lines.push('Partner of ' + n.given + ' since ' + p.since);
        lines.push('From the ' + p.from + ' family');
      } else if (!n.parent) {
        lines.push('The family begins here');
      } else {
        var par = n.parent;
        lines.push('Child of ' + par.given + (par.partner ? ' and ' + par.partner.given : ''));
      }
      if (!p.isPartner && n.partner && n.partner.since <= state.year) {
        lines.push('Partner of ' + n.partner.given + ' since ' + n.partner.since);
      }
      var kids = n.children.filter(function (c) { return c.born <= state.year && !c.pending; });
      var grandkids = 0;
      kids.forEach(function (k) {
        grandkids += k.children.filter(function (c) { return c.born <= state.year; }).length;
      });
      if (kids.length) {
        lines.push(plural(kids.length, 'child', 'children') + (grandkids ? ', ' + plural(grandkids, 'grandchild', 'grandchildren') : ''));
      }
      return lines;
    }

    function renderCard(p) {
      var st = personState(p);
      var shape = SHAPES[p.species];
      var medal = '<div class="medal"><svg viewBox="-36 -72 72 76" aria-hidden="true"><g class="leaf-node on state-' + st + '">' +
        opt.renderLeaf(p, shape, p.node) + '</g></svg></div>';
      var html = '<button class="close" type="button" aria-label="Close">×</button><div class="head">' + medal + '<div>';

      if (p.ghost) {
        html += '<h2>Unknown</h2><p class="life">Born about ' + p.born + '</p></div></div>' +
          '<ul class="facts"><li>A child of ' + esc(p.node.parent.given) + ' and ' + esc(p.node.parent.partner.given) + '</li><li>Nobody has added a name yet</li></ul>' +
          '<div class="actions"><button class="primary" type="button">Add what you know</button></div>';
      } else if (p.pending) {
        html += '<h2>' + esc(p.given + ' ' + p.family) + '</h2><p class="life">Born ' + p.born + '</p></div></div>' +
          '<ul class="facts"><li>Suggested by ' + esc(p.suggestedBy) + ' as a child of ' + esc(p.node.parent.given) + ' and ' + esc(p.node.parent.partner.given) + '</li><li>Waiting for review</li></ul>' +
          '<div class="actions"><button class="primary" type="button">Approve</button><button type="button">Decline</button></div>';
      } else {
        var life = st === 'gone' ? p.born + ' to ' + p.died : 'Born ' + p.born;
        html += '<h2>' + esc(p.given + ' ' + p.family) + '</h2>' +
          (p.birthName ? '<p class="born-as">born ' + esc(p.birthName) + '</p>' : '') +
          '<p class="life">' + life + '</p></div></div>' +
          '<ul class="facts">' + describe(p).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
          '<div class="actions"><button class="primary" type="button">Read ' + esc(p.given) + '’s story</button><button type="button">Focus here</button></div>' +
          '<p class="fix"><button class="link" type="button">Something wrong? Suggest a fix</button></p>';
      }
      card.innerHTML = html;
    }

    function placeCard(p) {
      var leaf = p.leafEl.getBoundingClientRect();
      if (window.matchMedia('(max-width: 640px)').matches) {
        card.style.left = card.style.top = card.style.transformOrigin = '';
        var sheetTop = card.getBoundingClientRect().top - 24;
        var dy = Math.min(0, sheetTop - 16 - leaf.bottom);
        var dx = leaf.left < 12 ? 12 - leaf.left : leaf.right > window.innerWidth - 12 ? window.innerWidth - 12 - leaf.right : 0;
        if (dx || dy) panBy(dx, dy);
        return;
      }
      var cw = card.offsetWidth, ch = card.offsetHeight;
      var cx = leaf.left + leaf.width / 2, cy = leaf.top + leaf.height / 2;
      var left = cx + 34;
      if (left + cw > window.innerWidth - 12) left = cx - 34 - cw;
      left = Math.max(12, left);
      var top = Math.max(76, Math.min(window.innerHeight - ch - 84, cy - ch / 2));
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      card.style.transformOrigin = (cx - left) + 'px ' + (cy - top) + 'px';
    }

    var closeTimer = null;

    function select(p) {
      if (state.selected) state.selected.leafEl.classList.remove('selected');
      state.selected = p;
      clearTimeout(closeTimer);
      if (!p) {
        card.classList.remove('open');
        if (still) card.hidden = true;
        else closeTimer = setTimeout(function () { card.hidden = true; }, 260);
        refreshLit();
        return;
      }
      p.leafEl.classList.add('selected');
      renderCard(p);
      card.hidden = false;
      card.classList.remove('open');
      placeCard(p);
      void card.offsetWidth;
      card.classList.add('open');
      refreshLit();
    }

    /* --- Camera ---
       The camera is a CSS transform on the one element that holds the whole tree.
       Moving it is done by the graphics card and redraws nothing, which is what
       keeps dragging and zooming smooth on a phone. */
    var cam = { x: 0, y: 0, k: 1 }, userMoved = false, moveTimer = null, fitted = false;
    var cameraQueued = false, sharpAt = 0, stageBox = stage.getBoundingClientRect();
    var pendingPerson = params.person || null, grownOnce = false;
    var MIN_ZOOM = 0.15, MAX_ZOOM = 3.2;

    function paintCamera() {
      cameraQueued = false;
      world.style.transform = 'translate(' + (cam.x + bounds.x0 * cam.k).toFixed(2) + 'px,' + (cam.y + bounds.y0 * cam.k).toFixed(2) + 'px) scale(' + cam.k.toFixed(4) + ')';
      // Zoom is meaning: far away, names step back and the shape of the tree remains
      var zoom = cam.k < 0.3 ? 'far' : cam.k < 0.44 ? 'mid' : 'near';
      if (svg.getAttribute('data-zoom') !== zoom) svg.setAttribute('data-zoom', zoom);
    }
    /* Many pointer events can arrive between two frames. Move the camera once per frame. */
    function applyCamera() {
      if (cameraQueued) return;
      cameraQueued = true;
      requestAnimationFrame(paintCamera);
    }

    function markMoving() {
      moving = true;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(function () {
        moving = false;
        if (Math.abs(cam.k / sharpAt - 1) > 0.02) sharpen();
      }, 160);
    }
    /* While it moves, the tree is a picture being slid and scaled. Once it rests
       at a new zoom, let the browser draw it again, sharp, at that size. */
    function sharpen() {
      sharpAt = cam.k;
      world.style.willChange = 'auto';
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { world.style.willChange = 'transform'; });
      });
    }

    /* On a wide screen the whole tree fits. On an upright phone the tree fills
       the height with the trunk in the middle and is panned sideways, so names
       stay readable. "Whole tree" always shows everything. */
    function fit(whole, animated) {
      var r = stageBox = stage.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return;
      var pad = opt.pad || (r.width <= 640 ? { top: 72, bottom: 86, side: 8 }
        : r.height <= 480 ? { top: 54, bottom: 84, side: 16 }
        : { top: 78, bottom: 100, side: 16 });
      var bw = worldWidth, bh = worldHeight;
      var aw = r.width - pad.side * 2, ah = r.height - pad.top - pad.bottom;
      var k = Math.min(aw / bw, ah / bh);
      var upright = aw / bw < ah / bh && k < 0.44;
      if (whole !== true && upright) k = Math.min(0.66, ah / bh);
      var to = {
        k: k,
        x: bw * k <= aw + 1 ? pad.side + (aw - bw * k) / 2 - bounds.x0 * k : r.width / 2,
        y: pad.top + (ah - bh * k) / 2 - bounds.y0 * k
      };
      userMoved = whole === true;
      fitted = true;
      if (animated) {
        glideTo(to, 750);
      } else {
        cameraRun++;
        cam = to;
        paintCamera();
        sharpen();
      }
      openPending();
    }

    /* Glide the camera to a new place. Any touch or scroll takes over at once. */
    var cameraRun = 0;
    function glideTo(to, ms) {
      var run = ++cameraRun;
      zoomGoal = null;
      if (still) {
        cam = to;
        paintCamera();
        sharpen();
        return;
      }
      var from = { x: cam.x, y: cam.y, k: cam.k }, start = performance.now();
      (function step(now) {
        if (run !== cameraRun) return;
        var t = Math.min(1, (now - start) / ms);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        cam.k = from.k * Math.pow(to.k / from.k, e);
        cam.x = from.x + (to.x - from.x) * e;
        cam.y = from.y + (to.y - from.y) * e;
        paintCamera();
        markMoving();
        if (t < 1) requestAnimationFrame(step);
      })(start);
    }

    /* A person named in the address is opened once the tree has grown and been fitted. */
    function openPending() {
      if (!pendingPerson || !fitted || !grownOnce) return;
      var p = people[pendingPerson];
      pendingPerson = null;
      if (p && p.leafEl.classList.contains('on')) select(p);
    }

    function panBy(dx, dy) {
      userMoved = true;
      glideTo({ x: cam.x + dx, y: cam.y + dy, k: cam.k }, 320);
    }

    function zoomAt(px, py, factor) {
      cameraRun++;
      var k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.k * factor));
      var f = k / cam.k;
      cam.x = px - (px - cam.x) * f;
      cam.y = py - (py - cam.y) * f;
      cam.k = k;
      userMoved = true;
      markMoving();
      if (state.selected) select(null);
    }

    /* Let go of a drag and the tree keeps drifting, slowing to a stop. */
    var velocity = { x: 0, y: 0 }, lastMoveAt = 0;
    function coast() {
      var run = ++cameraRun, prev = performance.now();
      (function step(now) {
        if (run !== cameraRun) return;
        var dt = Math.min(40, now - prev);
        prev = now;
        cam.x += velocity.x * dt;
        cam.y += velocity.y * dt;
        var slow = Math.exp(-dt / 300);
        velocity.x *= slow;
        velocity.y *= slow;
        paintCamera();
        markMoving();
        if (Math.hypot(velocity.x, velocity.y) > 0.012) requestAnimationFrame(step);
      })(prev);
    }

    /* A mouse wheel turns in notches. Ease toward where it is heading instead of jumping. */
    var zoomGoal = null, zoomRunning = false, zoomPrev = 0;
    function zoomStep(now) {
      if (!zoomGoal) { zoomRunning = false; return; }
      var dt = Math.min(40, now - zoomPrev);
      zoomPrev = now;
      var ratio = zoomGoal.k / cam.k;
      var arrived = Math.abs(Math.log(ratio)) < 0.002;
      zoomAt(zoomGoal.x, zoomGoal.y, arrived ? ratio : Math.pow(ratio, 1 - Math.exp(-dt / 70)));
      paintCamera();
      if (arrived) { zoomGoal = null; zoomRunning = false; return; }
      requestAnimationFrame(zoomStep);
    }

    var pointers = {}, downTarget = null, dragged = false, pinchStart = null;

    function pointerList() {
      return Object.keys(pointers).map(function (id) { return pointers[id]; });
    }

    stage.addEventListener('pointerdown', function (e) {
      cameraRun++;
      zoomGoal = null;
      velocity.x = velocity.y = 0;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      var list = pointerList();
      if (list.length === 1) {
        downTarget = e.target;
        dragged = false;
      } else if (list.length === 2) {
        dragged = true;
        pinchStart = {
          d: Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y),
          k: cam.k
        };
      }
      try { stage.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    });

    stage.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      var list = pointerList();
      if (list.length === 1) {
        if (!dragged && Math.hypot(p.x - p.sx, p.y - p.sy) < 6) return;
        if (!dragged) {
          dragged = true;
          stage.classList.add('dragging');
          document.body.classList.add('used');
        }
        var now = performance.now(), gap = Math.max(1, now - lastMoveAt);
        velocity.x = velocity.x * 0.6 + (dx / gap) * 0.4;
        velocity.y = velocity.y * 0.6 + (dy / gap) * 0.4;
        lastMoveAt = now;
        cam.x += dx; cam.y += dy;
        userMoved = true;
        applyCamera();
        markMoving();
      } else if (list.length === 2 && pinchStart) {
        var d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
        var mx = (list[0].x + list[1].x) / 2 - stageBox.left, my = (list[0].y + list[1].y) / 2 - stageBox.top;
        zoomAt(mx, my, (pinchStart.k * d / pinchStart.d) / cam.k);
        applyCamera();
      }
    });

    function pointerEnd(e) {
      if (!pointers[e.pointerId]) return;
      var wasPinch = !!pinchStart;
      delete pointers[e.pointerId];
      stage.classList.remove('dragging');
      if (pointerList().length) return;
      pinchStart = null;
      if (e.type === 'pointercancel') return;
      if (!dragged) return activate(downTarget);
      var flicked = !wasPinch && !still && performance.now() - lastMoveAt < 90 && Math.hypot(velocity.x, velocity.y) > 0.08;
      if (flicked) coast();
    }
    stage.addEventListener('pointerup', pointerEnd);
    stage.addEventListener('pointercancel', pointerEnd);

    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      // A pinch on a trackpad arrives as a wheel with the control key, in finer steps
      var step = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      var k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (zoomGoal ? zoomGoal.k : cam.k) * step));
      zoomGoal = { k: k, x: e.clientX - stageBox.left, y: e.clientY - stageBox.top };
      if (still) {
        zoomAt(zoomGoal.x, zoomGoal.y, k / cam.k);
        paintCamera();
        zoomGoal = null;
      } else if (!zoomRunning) {
        zoomRunning = true;
        zoomPrev = performance.now();
        requestAnimationFrame(zoomStep);
      }
    }, { passive: false });

    /* --- Wind ---
       Now and then a gust crosses the tree from left to right and the leaves
       stir in turn. Between gusts nothing moves, so nothing has to be redrawn. */
    function gustSoon(delay) {
      if (still) return;
      setTimeout(function () {
        var calm = !growing && !moving && !document.hidden && !pointerList().length;
        if (calm) {
          svg.classList.add('gust');
          setTimeout(function () { svg.classList.remove('gust'); }, 4400);
        }
        gustSoon(calm ? 7500 + Math.random() * 4500 : 1500);
      }, delay);
    }
    gustSoon(5200);

    function activate(target) {
      document.body.classList.add('used');
      var bud = target && target.closest && target.closest('.bud');
      if (bud) {
        people[bud.getAttribute('data-id')].collapsed = false;
        kick();
        return;
      }
      var leaf = target && target.closest && target.closest('.leaf-node');
      if (leaf && leaf.classList.contains('on')) {
        var p = people[leaf.getAttribute('data-id')];
        select(state.selected === p ? null : p);
      } else {
        select(null);
      }
    }

    stage.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(e.target);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') select(null);
    });

    stage.addEventListener('pointerover', function (e) {
      if (e.pointerType !== 'mouse') return;
      var leaf = e.target.closest && e.target.closest('.leaf-node');
      var next = leaf && leaf.classList.contains('on') ? people[leaf.getAttribute('data-id')] : null;
      if (next !== state.hover) {
        state.hover = next;
        refreshLit();
      }
    });

    card.addEventListener('click', function (e) {
      if (e.target.closest('.close')) select(null);
    });

    /* --- Controls --- */
    yearInput.min = opt.minYear;
    yearInput.max = opt.maxYear;
    yearInput.addEventListener('input', function () {
      if (state.playing) stopPlaying();
      setYear(+yearInput.value);
    });
    playBtn.addEventListener('click', togglePlay);
    document.getElementById('replay').addEventListener('click', function () {
      if (state.playing) stopPlaying();
      select(null);
      setYear(opt.maxYear);
      regrow();
    });
    document.getElementById('fit').addEventListener('click', function () {
      select(null);
      fit(true, true);
    });
    // Refit whenever the space for the tree changes (rotation, a resized window,
    // or a container that was not laid out yet when the page started).
    new ResizeObserver(function () {
      if (!userMoved) fit();
    }).observe(stage);

    fit();
    if (params.open) nodes.forEach(function (n) { n.collapsed = false; });
    setYear(params.year ? +params.year : opt.maxYear);
    whenSettled = function () {
      grownOnce = true;
      openPending();
    };
    regrow();

    return { fit: fit, setYear: setYear, regrow: regrow, people: people };
  }

  window.RFT = { mount: mount, FAMILY: FAMILY, SHAPES: SHAPES };
})();
