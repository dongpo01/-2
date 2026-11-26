/* 谈吐 · 网页版
 * 纯前端：语料 + 三步训练闭环 + 浏览器端真实声学分析 + 本地档案
 * 与小程序共用同一套语料、评分口径与六维模型
 */
(function () {
  'use strict'

  var D = window.TT_DATA || { LIBS: [], CORPUS: [], SCENES: [] }
  var LIBS = D.LIBS, CORPUS = D.CORPUS, SCENES = D.SCENES
  var DIMS = ['有物', '有序', '有情', '有采', '有节', '有度']
  var W = { 有物: 0.30, 有序: 0.25, 有情: 0.10, 有采: 0.10, 有节: 0.15, 有度: 0.10 }
  var KEY = 'tantou_web_v1'

  /* ---------- 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel) }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n }
  function fmt(sec) { sec = Math.max(0, Math.floor(sec)); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60) }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
  function todayKey(d) {
    d = d || new Date()
    return [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')
  }
  var toastTimer = null
  function toast(msg) {
    var el = $('#toast')
    el.textContent = msg
    el.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.classList.remove('show') }, 2200)
  }

  /* ---------- 档案 ---------- */
  function blank() {
    return { version: 1, createdAt: Date.now(), baseline: null, streak: 0, lastCheckIn: '', dailyDone: {}, attempts: [], favorites: [], used: [] }
  }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY))
      return s && s.version ? s : blank()
    } catch (e) { return blank() }
  }
  function save(s) {
    if (s.attempts.length > 200) s.attempts = s.attempts.slice(-200)
    if (s.used.length > 400) s.used = s.used.slice(-400)
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch (e) {}
  }
  function checkIn() {
    var s = load(), today = todayKey()
    if (s.lastCheckIn === today) return s
    var y = new Date(); y.setDate(y.getDate() - 1)
    s.streak = s.lastCheckIn === todayKey(y) ? (s.streak || 0) + 1 : 1
    s.lastCheckIn = today
    save(s)
    return s
  }
  function markDone(step) {
    var s = load(), t = todayKey()
    s.dailyDone[t] = s.dailyDone[t] || {}
    s.dailyDone[t][step] = true
    save(s)
  }
  function todayDone() {
    var s = load()
    return s.dailyDone[todayKey()] || {}
  }
  function useCorpus(id) {
    if (!id) return
    var s = load()
    s.used.push({ id: id, ts: Date.now() })
    save(s)
  }
  function usedIdsWithin(days) {
    var s = load(), from = Date.now() - (days || 7) * 86400000
    return s.used.filter(function (u) { return u.ts >= from }).map(function (u) { return u.id })
  }
  function addAttempt(a) {
    var s = load()
    s.attempts.push(a)
    if (!s.baseline) s.baseline = { dims: a.dims, at: a.ts }
    save(s)
  }
  function getAttempt(id) {
    var s = load()
    for (var i = s.attempts.length - 1; i >= 0; i--) if (s.attempts[i].id === id) return s.attempts[i]
    return null
  }
  function recentAttempts(n) {
    var s = load()
    return s.attempts.slice(-(n || 10))
  }
  function radarValues() {
    var s = load()
    var dims = s.baseline ? s.baseline.dims : null
    if (!dims) {
      var r = recentAttempts(1)
      if (r.length) dims = r[0].dims
    }
    if (!dims) return [0, 0, 0, 0, 0, 0]
    return DIMS.map(function (k) { return Math.round(dims[k] || 0) })
  }
  function toggleFav(id) {
    var s = load(), i = s.favorites.indexOf(id)
    if (i >= 0) s.favorites.splice(i, 1); else s.favorites.push(id)
    save(s)
    return s.favorites.indexOf(id) >= 0
  }
  function isFav(id) { return load().favorites.indexOf(id) >= 0 }
  function libDist() {
    var s = load(), m = {}
    s.attempts.forEach(function (a) { if (a.entryLib) m[a.entryLib] = (m[a.entryLib] || 0) + 1 })
    return m
  }

  /* ---------- 排程 ---------- */
  function seedOf(d) { d = d || new Date(); return d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate() }
  function pick(pool, seed, used) {
    var fresh = pool.filter(function (e) { return used.indexOf(e.id) < 0 })
    var list = fresh.length ? fresh : pool
    if (!list.length) return null
    return list[Math.abs(seed) % list.length]
  }
  function recitePool() {
    return CORPUS.filter(function (e) {
      return e.text.length >= 24 && e.text.length <= 200 && (e.lib === 'A' || e.lib === 'F' || e.lib === 'E')
    })
  }
  function todayPlan() {
    var s = load(), seed = seedOf(), used = usedIdsWithin(7)
    var quotePool = CORPUS.filter(function (e) { return e.bucket === 'quote' && (e.lib === 'A' || e.lib === 'C') })
    var p = recitePool()
    var done = todayDone()
    return {
      recite: pick(p, seed, used),
      quote: pick(quotePool, seed * 7 + 1, used),
      scene: SCENES[Math.abs(seed) % SCENES.length],
      stepDone: { read: !!done.read, decompose: !!done.decompose, speak: !!done.speak },
      allDone: !!done.read && !!done.speak,
      streak: s.streak || 0
    }
  }

  /* ---------- 文本分析 ---------- */
  var CONNECT_RE = /(因为|所以|但是|然而|因此|首先|其次|最后|第一|第二|第三|另外|同时|不过|总之|一方面|另一方面|换句话说|也就是说|如果|否则|综上|可见)/g
  var FILLER_RE = /(嗯+|啊+|呃+|那个|然后|就是说|其实|这个嘛|怎么说呢)/g
  function countCJK(t) { var m = String(t || '').match(/[\u4e00-\u9fa5]/g); return m ? m.length : 0 }
  function hasFiller(s) { return /(嗯|啊|呃|那个|然后|就是说|其实|这个嘛|怎么说呢)/.test(s) }
  function sentences(t) {
    return String(t || '').split(/[。！？!?；;\n]/).map(function (x) { return x.trim() }).filter(function (x) { return x.length > 1 })
  }
  function analyzeText(raw) {
    var t = String(raw || '').trim()
    var chars = countCJK(t)
    if (chars < 10) return { ok: false }
    var ss = sentences(t)
    var fillers = t.match(FILLER_RE) || []
    var connects = t.match(CONNECT_RE) || []
    var avg = ss.length ? Math.round(ss.reduce(function (a, s) { return a + s.length }, 0) / ss.length) : 0
    var lenVar = 0
    if (ss.length > 1) {
      var mean = ss.reduce(function (a, s) { return a + s.length }, 0) / ss.length
      lenVar = Math.sqrt(ss.reduce(function (a, s) { return a + Math.pow(s.length - mean, 2) }, 0) / ss.length)
    }
    var longest = ss.slice().sort(function (a, b) { return b.length - a.length })[0] || ''
    return {
      ok: true, chars: chars, sentenceCount: ss.length, avgLen: avg, lenVar: Math.round(lenVar),
      fillerCount: fillers.length,
      fillerRate: +(fillers.length / Math.max(chars, 1) * 100).toFixed(1),
      connectCount: connects.length,
      hasConclusion: /(结论|建议|核心是|我认为|我的判断|一句话说|归根到底)/.test(t),
      hasExample: /(比如|例如|举个例子|有一次|去年|上周|上个月|拿.{1,12}来说)/.test(t),
      hasNumber: /(\d|百分之|一成|两成|三成|一倍|两倍|[一二三四五六七八九十两半](天|周|月|年|人|次|个|位|条|件|倍|成|万|千))/.test(t),
      hasQuote: /《|「|“/.test(t),
      longest: longest,
      fillerSentence: ss.filter(hasFiller)[0] || '',
      firstSentence: ss[0] || ''
    }
  }

  /* ---------- 声学 → 分数 ---------- */
  function acoustic(metrics, targetSec) {
    var m = metrics || {}
    var pp = m.pausePerMin || 0, cv = m.volCv || 0, dur = m.duration || 0
    var pausePart
    if (pp <= 2) pausePart = 50
    else if (pp <= 6) pausePart = 68
    else if (pp <= 9) pausePart = 88
    else if (pp <= 15) pausePart = 95
    else if (pp <= 22) pausePart = 80
    else pausePart = 62
    var volPart = 100 - clamp(cv * 100, 0, 55)
    var durPart = 0
    if (targetSec && dur) durPart = 100 - clamp(Math.abs(dur - targetSec) / targetSec * 100, 0, 60)
    return { pausePart: pausePart, volPart: volPart, durPart: durPart }
  }

  function computeReport(o) {
    var mode = o.mode || 'read'
    var metrics = o.metrics || null
    var scene = o.scene || null
    var entry = o.entry || null
    var checklist = o.checklist || {}
    var baseline = o.baseline || null
    var ta = analyzeText(o.transcript || '')
    var isRead = mode === 'read'
    var chars = isRead ? countCJK(o.text || '') : ta.chars
    var dur = metrics ? (metrics.duration || 0) : 0
    var rate = (isRead && chars >= 20 && dur) ? Math.round(chars / dur * 60) : 0
    var targetSec = isRead && chars ? Math.max(8, Math.round(chars / 190 * 60)) : (scene ? scene.sec : 0)

    var ratePart = null
    if (rate) {
      if (rate >= 130 && rate <= 240) ratePart = 95
      else if (rate < 130) ratePart = clamp(95 - (130 - rate) * 0.9, 35, 95)
      else ratePart = clamp(95 - (rate - 240) * 0.4, 35, 97)
    }
    var ac = acoustic(metrics, targetSec)
    if (ratePart !== null) ac.ratePart = ratePart

    var dims = {}, scored = {}
    DIMS.forEach(function (k) {
      dims[k] = baseline && baseline[k] ? baseline[k] : 58
      scored[k] = false
    })

    if (metrics && metrics.valid !== false) {
      var jie = (ac.ratePart !== null)
        ? ac.ratePart * 0.40 + ac.pausePart * 0.32 + ac.volPart * 0.18 + (ac.durPart || 70) * 0.10
        : ac.pausePart * 0.55 + ac.volPart * 0.25 + (ac.durPart || 70) * 0.20
      dims['有节'] = Math.round(clamp(jie, 30, 98))
      scored['有节'] = true
    }

    if (isRead) {
      if (metrics) {
        var cai = ac.pausePart * 0.45 + ac.volPart * 0.25 + (ac.ratePart || 70) * 0.30
        if (entry && entry.bucket === 'recite') cai += 4
        dims['有采'] = Math.round(clamp(cai, 30, 97))
        scored['有采'] = true
      }
    } else if (mode === 'text') {
      var wuT, xuT, caiT
      if (ta.ok) {
        wuT = 58 + (ta.hasExample ? 16 : 0) + (ta.hasNumber ? 10 : 0) + (ta.hasQuote ? 8 : 0)
        xuT = 56 + (ta.hasConclusion ? 18 : 0) + clamp(ta.connectCount * 3, 0, 16)
        caiT = 52 + (ta.hasQuote ? 14 : 0) + (ta.avgLen >= 12 && ta.avgLen <= 26 ? 12 : 4) + clamp(ta.lenVar * 0.9, 0, 14)
      } else { wuT = 60; xuT = 60; caiT = 60 }
      dims['有物'] = Math.round(clamp(wuT, 30, 96))
      dims['有序'] = Math.round(clamp(xuT, 30, 96))
      dims['有采'] = Math.round(clamp(caiT, 30, 96))
      scored['有物'] = true; scored['有序'] = true; scored['有采'] = true
    } else {
      var wu, xu, cai2, du, qing = checklist.qing ? 88 : 62
      if (ta.ok) {
        wu = 58 + (ta.hasExample ? 16 : 0) + (ta.hasNumber ? 10 : 0) + (ta.hasQuote ? 8 : 0)
        xu = 56 + (ta.hasConclusion ? 18 : 0) + clamp(ta.connectCount * 3, 0, 16)
        cai2 = 52 + (ta.hasQuote ? 14 : 0) + (ta.avgLen >= 12 && ta.avgLen <= 26 ? 12 : 4) + clamp(ta.lenVar * 0.9, 0, 14)
        du = 52 + (checklist.du ? 24 : 0) + (ac.durPart > 80 ? 12 : 0)
        if (ta.fillerRate > 8) { du -= 10; xu -= 6 }
      } else {
        wu = checklist.wu ? 84 : 60
        xu = checklist.xu ? 84 : 60
        cai2 = checklist.cai ? 82 : 60
        du = checklist.du ? 84 : 60
      }
      dims['有物'] = Math.round(clamp(wu, 30, 96))
      dims['有序'] = Math.round(clamp(xu, 30, 96))
      dims['有采'] = Math.round(clamp(cai2, 30, 96))
      dims['有度'] = Math.round(clamp(du, 30, 96))
      dims['有情'] = Math.round(clamp(qing, 30, 96))
      ;['有物', '有序', '有采', '有度', '有情'].forEach(function (k) { scored[k] = true })
    }

    var total = 0, ws = 0
    DIMS.forEach(function (k) { if (scored[k]) { total += dims[k] * W[k]; ws += W[k] } })
    total = ws ? Math.round(total / ws) : 0

    var confidence = (metrics && (metrics.valid === false || dur < 3)) ? 'low' : 'normal'

    return {
      mode: mode, rate: rate, charCount: chars, duration: dur, targetSec: targetSec,
      dims: dims, scored: scored, total: total, confidence: confidence,
      metrics: metrics ? {
        pauseCount: metrics.pauseCount || 0, pausePerMin: metrics.pausePerMin || 0,
        silenceRatio: metrics.silenceRatio || 0, volCv: metrics.volCv || 0
      } : null,
      text: ta.ok ? ta : null,
      checklist: checklist
    }
  }

  function metricRows(r) {
    var rows = []
    if (r.mode === 'text') {
      if (r.text) {
        rows.push({ k: '字数', v: r.text.chars + ' 字', s: (r.text.chars >= 120 && r.text.chars <= 400) ? 'good' : 'warn', note: '单次 120–400 字较合适' })
        rows.push({ k: '平均句长', v: r.text.avgLen + ' 字 / ' + r.text.sentenceCount + ' 句', s: (r.text.avgLen >= 12 && r.text.avgLen <= 26) ? 'good' : 'warn', note: '12–26 字最容易听懂' })
        rows.push({ k: '口头禅', v: r.text.fillerCount + ' 次 / ' + r.text.fillerRate + '%', s: r.text.fillerRate <= 5 ? 'good' : 'bad', note: '健康区间 ≤5%' })
        rows.push({ k: '连接词', v: r.text.connectCount + ' 处', s: r.text.connectCount >= 4 ? 'good' : 'warn', note: '≥4 处逻辑更清楚' })
      }
      return rows
    }
    if (r.rate) {
      rows.push({ k: '语速', v: r.rate + ' 字/分', s: (r.rate >= 130 && r.rate <= 240) ? 'good' : ((r.rate > 290 || r.rate < 85) ? 'bad' : 'warn'), note: '朗读健康 130–240' })
    } else if (r.mode === 'read') {
      rows.push({ k: '语速', v: '未测', s: 'none', note: r.charCount && r.charCount < 20 ? '原文过短' : '录音过短' })
    }
    if (r.metrics) {
      rows.push({ k: '有效停顿', v: r.metrics.pauseCount + ' 处 / ' + r.metrics.pausePerMin + ' 次每分', s: r.metrics.pausePerMin >= 6 ? 'good' : 'warn', note: '健康 8–15 次每分' })
      rows.push({ k: '音量稳定', v: r.metrics.volCv ? (Math.round(100 - Math.min(r.metrics.volCv * 100, 55)) + ' 分') : '—', s: (r.metrics.volCv && r.metrics.volCv < 0.35) ? 'good' : 'warn', note: '波动越低越稳' })
      rows.push({ k: '时长', v: Math.round(r.duration) + ' 秒 / 建议 ' + r.targetSec + ' 秒', s: Math.abs(r.duration - r.targetSec) / Math.max(r.targetSec, 1) < 0.25 ? 'good' : 'warn', note: '过短没展开，过长会走神' })
    }
    if (r.text) rows.push({ k: '口头禅', v: r.text.fillerCount + ' 次 / ' + r.text.fillerRate + '%', s: r.text.fillerRate <= 5 ? 'good' : 'bad', note: '健康 ≤5%' })
    return rows
  }

  /* ---------- 点评 ---------- */
  function weakest(r) {
    var key = '有节', low = 101
    DIMS.forEach(function (k) { if (r.scored[k] && r.dims[k] < low) { low = r.dims[k]; key = k } })
    return key
  }
  var DIM_THEME = { 有物: ['因果', '决策', '风险'], 有序: ['开场', '汇报', '结构'], 有情: ['关系', '分寸', '共情'], 有采: ['审美', '节奏', '景物'], 有节: ['节奏', '时机', '执行'], 有度: ['分寸', '拒绝', '场合'] }

  function recommend(r) {
    var dim = weakest(r), themes = DIM_THEME[dim] || []
    var pool = CORPUS.filter(function (e) {
      return e.cap.indexOf(dim) >= 0 && (!themes.length || e.theme.some(function (t) { return themes.indexOf(t) >= 0 }))
    })
    var pickE = pool[0] || CORPUS.filter(function (e) { return e.cap.indexOf(dim) >= 0 })[0] || CORPUS[0]
    return { id: pickE.id, text: pickE.text, work: pickE.work, author: pickE.author, dim: dim }
  }

  function advice(r, entry, scene) {
    var out = [], m = r.metrics || {}, t = r.text
    if (r.rate && r.charCount >= 20 && r.rate > 270) {
      out.push({ tag: '语速', quote: '整段平均 ' + r.rate + ' 字/分', why: '超过 270 字/分，听众开始丢信息，后半段基本靠猜。', fix: '在每个转折词前停一秒，把 20 字以上的句子拆成两句。' })
    } else if (r.rate && r.charCount >= 20 && r.rate < 125) {
      out.push({ tag: '语速', quote: '整段平均 ' + r.rate + ' 字/分', why: '过慢会让注意力掉到内容之外，也显得对内容不确信。', fix: '把铺垫句压掉一半，句间不要拖音，把语速提到 190 上下。' })
    }
    if (m.pausePerMin != null && m.pausePerMin < 6) {
      out.push({ tag: '停顿', quote: '全段只有 ' + m.pauseCount + ' 处有效停顿', why: '没有停顿，等于所有信息同一价格，听众抓不住重点。', fix: '在三处各留一秒：开场结论后、每个论据之前、收束句之前。' })
    } else if (m.pausePerMin != null && m.pausePerMin > 22) {
      out.push({ tag: '停顿', quote: '每分 ' + m.pausePerMin + ' 次停顿', why: '停顿过密通常是边想边说，听众会觉得你也没想清楚。', fix: '先写三点提纲再开口，把停顿从句中移到句间。' })
    }
    if (t && t.fillerRate > 5) {
      out.push({ tag: '口头禅', quote: t.fillerSentence ? '“' + t.fillerSentence.slice(0, 26) + '”' : '口头禅占 ' + t.fillerRate + '%', why: '填充词出现的位置，正好是你没想好的位置。', fix: '想说“然后”时闭嘴一秒，把填充词换成停顿。' })
    }
    if (t && t.connectCount <= 2) {
      out.push({ tag: '结构', quote: '全段只有 ' + t.connectCount + ' 处连接词', why: '句子之间没有显性的逻辑词，听众要自己猜前后关系，容易听散。', fix: '在每个转折处补一个“因为/所以/但是”，或用“第一…第二…”直接分点。' })
    }
    if (t && !t.hasConclusion) {
      out.push({ tag: '结构', quote: t.firstSentence ? '“' + t.firstSentence.slice(0, 26) + '”' : '开场没有结论句', why: '开头是背景而不是判断，听众要等到中段才知道你要说什么。', fix: '第一句改成“我的判断是……”，背景压成一句放后面。' })
    }
    if (t && t.longest && t.longest.length > 42) {
      out.push({ tag: '句子', quote: '“' + t.longest.slice(0, 34) + '…”', why: '单句超过 40 字，说出来换不过气，听进去断成两截。', fix: '在“而”“并”“同时”处切开，改成两句短句。' })
    }
    if (m.volCv > 0.45) {
      out.push({ tag: '音量', quote: '音量波动系数 ' + m.volCv, why: '音量忽大忽小，听众会以为你在情绪波动，而不是在强调重点。', fix: '句尾不要泄气，只在结论句提高一格音量。' })
    }
    if (r.targetSec && r.duration && Math.abs(r.duration - r.targetSec) / r.targetSec > 0.3) {
      out.push({ tag: '时长', quote: '本次 ' + Math.round(r.duration) + ' 秒，建议 ' + r.targetSec + ' 秒', why: r.duration < r.targetSec ? '时间没用完，说明内容没展开或提前收场。' : '超时意味着结构没收住。', fix: r.duration < r.targetSec ? '补一个具体例子，把第二段撑起来。' : '删掉最后一个次要论据，在第二段结束时收束。' })
    }
    if (!t && r.mode === 'speak') {
      out.push({ tag: '可核查', quote: '这次没有文字稿', why: '没有文字稿，结构只能靠自评，点评无法指到原句。', fix: '下次把要点敲进文字稿，点评就能定位到具体句子。' })
    }
    if (!out.length) {
      out.push({ tag: '整体', quote: '各项指标都在区间内', why: '没有明显短板，基础控制已经稳定。', fix: '下一步加难度：换压力更高的场景，或拉长到三分钟。' })
    }
    return {
      advice: out.slice(0, 3),
      demo: scene
        ? '开场可以这样起：先说结论——“我的判断是【一句话】”，再用一个具体场景把那句话坐实，然后抛出三段。'
        : (entry ? '跟读时先别求快：把“' + (entry.beat || '关键处停顿') + '”做到，再整体连读两遍。' : '先说结论，再给证据，最后收住。'),
      recommend: recommend(r),
      weakest: weakest(r)
    }
  }

  /* ---------- 录音（浏览器 Web Audio） ---------- */
  function analyzeFrames(frames, dur) {
    var n = frames.length
    if (n < 6 || dur < 0.8) {
      return { duration: +dur.toFixed(1), pauseCount: 0, pausePerMin: 0, silenceRatio: 0, volCv: 0, valid: false }
    }
    var sorted = frames.slice().sort(function (a, b) { return a - b })
    var floor = sorted[Math.floor(n * 0.1)] || 0.001
    var thr = Math.max(floor * 2.2, 0.006)
    var silent = 0, flags = frames.map(function (v) { if (v < thr) { silent++; return 1 } return 0 })
    var first = -1, last = -1
    for (var i = 0; i < n; i++) if (!flags[i]) { if (first < 0) first = i; last = i }
    var pauses = 0
    if (first >= 0) {
      var run = 0
      for (var j = first; j <= last; j++) {
        if (flags[j]) run++
        else { if (run >= 12) pauses++; run = 0 }
      }
    }
    var voiced = frames.filter(function (v) { return v >= thr })
    var cv = 0
    if (voiced.length > 4) {
      var mean = voiced.reduce(function (a, b) { return a + b }, 0) / voiced.length
      if (mean > 0) {
        var sq = 0
        for (var k = 0; k < voiced.length; k++) sq += Math.pow(voiced[k] - mean, 2)
        cv = Math.sqrt(sq / voiced.length) / mean
      }
    }
    return {
      duration: +dur.toFixed(1),
      pauseCount: pauses,
      pausePerMin: +(pauses / Math.max(dur / 60, 0.05)).toFixed(1),
      silenceRatio: +(silent / n).toFixed(3),
      volCv: +cv.toFixed(3),
      valid: true
    }
  }

  var rec = {
    ctx: null, stream: null, analyser: null, buf: null, frames: [], timer: null, startAt: 0,
    onTick: null, onEnd: null, maxSec: 120, running: false, lastUrl: '', mr: null
  }

  rec.start = function (maxSec) {
    rec.maxSec = maxSec || 120
    rec.frames = []
    rec.running = true
    rec.startAt = performance.now()
    var AC = window.AudioContext || window.webkitAudioContext
    try {
      rec.ctx = new AC()
      if (rec.ctx.state === 'suspended' && rec.ctx.resume) rec.ctx.resume()
    } catch (e) { rec.ctx = null }
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        rec.stream = stream
        if (!rec.ctx) rec.ctx = new AC()
        var src = rec.ctx.createMediaStreamSource(stream)
        rec.analyser = rec.ctx.createAnalyser()
        rec.analyser.fftSize = 1024
        rec.analyser.smoothingTimeConstant = 0
        src.connect(rec.analyser)
        rec.buf = new Float32Array(rec.analyser.fftSize)
        if (window.MediaRecorder) {
          try {
            rec.mr = new MediaRecorder(stream)
            var chunks = []
            rec.mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data) }
            rec.mr.onstop = function () {
              try {
                rec.lastUrl = URL.createObjectURL(new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' }))
                if (state.view === 'train' && state.train && state.train.step === 1 && !state.train.recording) render()
              } catch (e) {}
            }
            rec.mr.start()
          } catch (e) { rec.mr = null }
        }
        rec.timer = setInterval(rec.tick, 32)
      })
  }

  rec.tick = function () {
    if (!rec.running) return
    var arr = rec.buf
    rec.analyser.getFloatTimeDomainData(arr)
    var sum = 0
    for (var i = 0; i < arr.length; i++) sum += arr[i] * arr[i]
    var rms = Math.sqrt(sum / arr.length)
    rec.frames.push(rms)
    var el = rec.elapsed()
    if (rec.onTick) rec.onTick(el, rms, rec.frames.slice(-16))
    if (el >= rec.maxSec) rec.stop()
  }

  rec.elapsed = function () { return (performance.now() - rec.startAt) / 1000 }

  rec.stop = function () {
    if (!rec.running) return
    rec.running = false
    clearInterval(rec.timer)
    var dur = rec.elapsed()
    var res = analyzeFrames(rec.frames, dur)
    try {
      if (rec.mr && rec.mr.state !== 'inactive') rec.mr.stop()
      if (rec.stream) rec.stream.getTracks().forEach(function (t) { t.stop() })
      if (rec.ctx && rec.ctx.state !== 'closed') rec.ctx.close()
    } catch (e) {}
    rec.mr = null; rec.stream = null; rec.ctx = null
    if (rec.onEnd) rec.onEnd(res, rec.lastUrl)
  }

  /* ---------- 雷达图 ---------- */
  function drawRadar(canvas, values, size) {
    if (!canvas) return
    var dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + 'px'
    canvas.style.height = size + 'px'
    var ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    var w = size, h = size, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 26
    var n = 6
    var vals = (values || []).slice(0, 6)
    while (vals.length < 6) vals.push(0)
    var ang = function (i) { return -Math.PI / 2 + Math.PI * 2 * i / n }
    ctx.clearRect(0, 0, w, h)
    for (var ring = 1; ring <= 4; ring++) {
      var r = R * ring / 4
      ctx.beginPath()
      for (var i = 0; i <= n; i++) {
        var a = ang(i % n), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = ring === 4 ? '#DCD3C3' : '#EDE7DA'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    for (var i2 = 0; i2 < n; i2++) {
      var a2 = ang(i2)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(a2) * R, cy + Math.sin(a2) * R)
      ctx.strokeStyle = '#EDE7DA'
      ctx.stroke()
    }
    ctx.beginPath()
    for (var i3 = 0; i3 <= n; i3++) {
      var idx = i3 % n, a3 = ang(idx)
      var r3 = R * Math.max(0.06, Math.min(100, Number(vals[idx]) || 0) / 100)
      var x3 = cx + Math.cos(a3) * r3, y3 = cy + Math.sin(a3) * r3
      if (i3 === 0) ctx.moveTo(x3, y3); else ctx.lineTo(x3, y3)
    }
    ctx.fillStyle = 'rgba(154,107,79,0.16)'
    ctx.fill()
    ctx.strokeStyle = '#9A6B4F'
    ctx.lineWidth = 1.6
    ctx.stroke()
    for (var i4 = 0; i4 < n; i4++) {
      var a4 = ang(i4)
      var r4 = R * Math.max(0.06, Math.min(100, Number(vals[i4]) || 0) / 100)
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a4) * r4, cy + Math.sin(a4) * r4, 2.4, 0, Math.PI * 2)
      ctx.fillStyle = '#9A6B4F'
      ctx.fill()
    }
    ctx.font = '11px sans-serif'
    ctx.fillStyle = '#7A7369'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (var i5 = 0; i5 < n; i5++) {
      var a5 = ang(i5)
      var x5 = cx + Math.cos(a5) * (R + 14)
      var y5 = cy + Math.sin(a5) * (R + 14)
      if (Math.abs(Math.cos(a5)) < 0.01) x5 = cx
      ctx.fillText(DIMS[i5], x5, y5)
    }
  }

  /* ---------- 全局状态 ---------- */
  var state = {
    view: 'home',
    lib: 'ALL',
    kw: '',
    reportId: '',
    detailId: '',
    train: null
  }

  function newTrain(mode) {
    var plan = todayPlan()
    var pool = recitePool()
    var entry = plan.recite || pool[0]
    return {
      mode: mode || 'read',
      entryId: entry ? entry.id : '',
      sceneId: (mode === 'text') ? '' : (plan.scene ? plan.scene.id : (SCENES[0] && SCENES[0].id)),
      step: 0,
      result: null,
      checklist: { xu: false, wu: false, qing: false, du: false, cai: false },
      transcript: '',
      recording: false,
      maxSec: 0
    }
  }

  function entryOf(id) { for (var i = 0; i < CORPUS.length; i++) if (CORPUS[i].id === id) return CORPUS[i]; return null }
  function sceneOf(id) { for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i]; return null }
  function libName(code) { for (var i = 0; i < LIBS.length; i++) if (LIBS[i].code === code) return LIBS[i].name; return '' }
  function greeting() {
    var h = new Date().getHours()
    if (h < 6) return '夜深了，说两句再睡'
    if (h < 11) return '早上好，先开一次口'
    if (h < 14) return '午后一刻，练一段'
    if (h < 19) return '下午好，趁热说一段'
    return '晚上好，今天最后一段'
  }

  /* ---------- 视图 ---------- */
  function render() {
    var html = ''
    if (state.view === 'home') html = viewHome()
    else if (state.view === 'corpus') html = viewCorpus()
    else if (state.view === 'train') html = viewTrain()
    else if (state.view === 'report') html = viewReport()
    else html = viewProfile()
    $('#view').innerHTML = html
    $('#nav').querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.view === state.view)
    })
    var s = load()
    $('#streakMini').textContent = '连续 ' + (s.streak || 0) + ' 天'
    if (state.view === 'home') drawRadar($('#homeRadar'), radarValues(), 300)
    if (state.view === 'profile') drawRadar($('#proRadar'), radarValues(), 300)
    if (state.view === 'report') {
      var a = getAttempt(state.reportId) || recentAttempts(1)[0]
      if (a) drawRadar($('#repRadar'), DIMS.map(function (k) { return a.dims[k] || 0 }), 300)
    }
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  }

  function viewHome() {
    var plan = todayPlan()
    var rv = radarValues()
    var has = rv.some(function (v) { return v > 0 })
    var s = load()
    var weak = '尚未诊断', low = 101
    rv.forEach(function (v, i) { if (v > 0 && v < low) { low = v; weak = DIMS[i] } })
    var count = s.attempts.length
    var tasks = [
      { key: 'read', t: '读一段 · 出声读 3 遍', meta: plan.recite ? plan.recite.work + ' · ' + plan.recite.author + ' · ' + plan.recite.text.length + ' 字' : '', quote: plan.recite ? plan.recite.text : '', done: plan.stepDone.read },
      { key: 'decompose', t: '拆一段 · 看它为什么好', meta: plan.quote ? plan.quote.work + ' · ' + (plan.quote.rh || '') : '', quote: plan.quote ? plan.quote.text : '', done: plan.stepDone.decompose },
      { key: 'speak', t: '说一段 · ' + (plan.scene ? plan.scene.name : '即兴发言'), meta: plan.scene ? plan.scene.prompt : '', quote: '', done: plan.stepDone.speak }
    ]
    var d = new Date()
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]

    return '' +
      '<section class="hero">' +
        '<div>' +
          '<div class="sub">' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 周' + week + ' · ' + greeting() + '</div>' +
          '<h1>今日三件事</h1>' +
          '<div class="note">读一段、拆一段、说一段。三次开口，一次复盘。</div>' +
        '</div>' +
        '<div class="streak"><b class="num">' + (s.streak || 0) + '</b><span>连续开口</span></div>' +
      '</section>' +
      '<div class="grid-2" style="margin-top:16px">' +
        '<div>' +
          '<div class="section">今日任务</div>' +
          tasks.map(function (x, i) {
            return '<div class="task" data-act="task" data-key="' + x.key + '">' +
              '<div class="idx num">' + (i + 1) + '</div>' +
              '<div class="body"><h3>' + esc(x.t) + '</h3><div class="meta">' + esc(x.meta) + '</div>' +
              (x.quote ? '<div class="quote serif">' + esc(x.quote.slice(0, 46)) + (x.quote.length > 46 ? '…' : '') + '</div>' : '') +
              '</div>' +
              '<div class="state ' + (x.done ? 'done' : '') + '">' + (x.done ? '已完成' : '开始') + '</div>' +
            '</div>'
          }).join('') +
          '<button class="btn" data-act="startAll" style="margin-top:6px">' + (plan.allDone ? '再来一轮' : '开始今日训练') + '</button>' +
          '<div class="hint" style="margin-top:14px">语速、停顿、音量来自浏览器录音的真实计算；内容与结构依据勾选和文字稿。录音不上传，只在本机分析。</div>' +
        '</div>' +
        '<div>' +
          '<div class="card radar-wrap">' +
            '<div class="section" style="margin-top:0">六维档案</div>' +
            '<canvas id="homeRadar"></canvas>' +
            '<div class="radar-foot">' +
              (has ? '<span>最弱：' + weak + '</span><span>累计开口 ' + count + ' 次</span>' : '<span>还没有基线</span><a href="#" data-act="diagnose" style="color:var(--accent)">做 60 秒诊断 ›</a>') +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="label">怎么用</div>' +
            '<div class="sub" style="margin-top:8px;line-height:1.9">' +
              '① 读：先把句子读顺，练气息与停顿。<br>' +
              '② 拆：看它为什么好，记住结构而不是背结论。<br>' +
              '③ 说：换自己的话讲一遍，系统给你三条可改的地方。' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
  }

  function viewCorpus() {
    var list = CORPUS.filter(function (e) {
      if (state.lib !== 'ALL' && e.lib !== state.lib) return false
      if (!state.kw) return true
      var k = state.kw
      return e.text.indexOf(k) >= 0 || e.work.indexOf(k) >= 0 || (e.author || '').indexOf(k) >= 0 ||
        e.theme.join('').indexOf(k) >= 0 || e.cap.join('').indexOf(k) >= 0
    })
    return '' +
      '<div style="display:flex;align-items:baseline;gap:12px"><h2 style="margin:0;font-size:24px;letter-spacing:.1em">语料库</h2>' +
      '<span class="sub">' + CORPUS.length + ' 条精选 · 每条都标了用法与误用边界</span></div>' +
      '<div class="toolbar">' +
        '<input class="search" id="kw" placeholder="搜原文、篇名、作者或主题" value="' + esc(state.kw) + '" data-field="kw" />' +
        [''].concat(LIBS.map(function (l) { return l.code })).reduce(function (acc, code) {
          var name = code ? libName(code) : '全部'
          acc += '<button class="chip ' + ((code || 'ALL') === state.lib ? 'on' : '') + '" data-act="lib" data-lib="' + (code || 'ALL') + '">' + name + '</button>'
          return acc
        }, '') +
      '</div>' +
      '<div class="corpus-list">' +
        list.map(function (e) {
          return '<article class="item" data-act="detail" data-id="' + e.id + '">' +
            '<div class="top"><span class="lib">' + libName(e.lib) + '</span><span class="work">' + esc(e.work) + '</span><span>' + esc(e.diff) + '</span></div>' +
            '<div class="text serif">' + esc(e.text.length > 62 ? e.text.slice(0, 62) + '…' : e.text) + '</div>' +
            '<div class="foot">' + e.cap.map(function (c) { return '<span class="tag blue">' + c + '</span>' }).join('') +
              '<span class="use">' + esc(e.use) + '</span></div>' +
          '</article>'
        }).join('') || '<div class="empty" style="grid-column:1/-1">没有匹配的条目，换个词试试</div>' +
      '</div>'
  }

  function viewTrain() {
    if (!state.train) state.train = newTrain('read')
    var t = state.train
    var modes = [
      { k: 'read', n: '跟读', d: '按原文读，测节奏与停顿' },
      { k: 'speak', n: '实战', d: '给场景即兴说一段' },
      { k: 'text', n: '文字', d: '没麦克风，评结构与措辞' }
    ]
    var modeBar = '<div class="modes">' + modes.map(function (m) {
      return '<button class="mode ' + (t.mode === m.k ? 'on' : '') + '" data-act="mode" data-mode="' + m.k + '"><b>' + m.n + '</b><span>' + m.d + '</span></button>'
    }).join('') + '</div>'

    if (t.mode === 'text') return modeBar + textPanel(t)
    if (t.step === 0) return modeBar + (t.mode === 'read' ? readSetup(t) : speakSetup(t))
    return modeBar + resultPanel(t)
  }

  function readSetup(t) {
    var e = entryOf(t.entryId) || recitePool()[0]
    if (!e) return '<div class="empty">语料为空</div>'
    var chars = countCJK(e.text)
    var target = Math.max(8, Math.round(chars / 190 * 60))
    t.maxSec = Math.max(20, Math.min(150, Math.round(target * 1.6)))
    return '' +
      '<div class="card">' +
        '<div class="label">' + libName(e.lib) + ' · ' + esc(e.work) + ' · ' + esc(e.author) + ' · ' + esc(e.era) + '</div>' +
        '<div class="prompt-quote serif">' + esc(e.text) + '</div>' +
        '<div class="hint">为什么好：' + esc(e.why) + '</div>' +
        (e.beat ? '<div class="beat">朗读提示：' + esc(e.beat) + '</div>' : '') +
        '<div style="margin-top:14px;display:flex;gap:10px;align-items:center">' +
          '<button class="btn ghost sm" data-act="nextEntry">换一条</button>' +
          '<span class="sub">建议 ' + t.maxSec + ' 秒内读完，到点自动停</span>' +
        '</div>' +
      '</div>' +
      stage(t, '读完点停止，系统会算停顿、音量与语速')
  }

  function speakSetup(t) {
    var sc = sceneOf(t.sceneId) || SCENES[0]
    if (!sc) return '<div class="empty">场景为空</div>'
    t.maxSec = sc.sec + 15
    return '' +
      '<div class="card">' +
        '<div class="label">场景演练 · ' + esc(sc.audience) + '</div>' +
        '<div class="prompt-quote serif">' + esc(sc.name) + '</div>' +
        '<div style="color:#4a4238;font-size:14px;line-height:1.85">' + esc(sc.prompt) + '</div>' +
        '<div class="line"></div>' +
        '<div class="label">三段提示</div>' +
        '<ol style="margin:8px 0 0;padding-left:20px;color:#4a4238;font-size:14px;line-height:1.9">' +
          sc.beats.map(function (b) { return '<li>' + esc(b) + '</li>' }).join('') +
        '</ol>' +
        '<div style="margin-top:12px;font-size:13px;color:#a06a5a">避开：' + esc(sc.avoid) + '</div>' +
        '<div style="margin-top:14px;display:flex;gap:10px;align-items:center">' +
          '<select id="sceneSel" data-field="scene" style="height:34px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:#fff;font-family:inherit;font-size:13px">' +
            SCENES.map(function (x) { return '<option value="' + x.id + '"' + (x.id === sc.id ? ' selected' : '') + '>' + esc(x.name) + '（' + x.sec + ' 秒）</option>' }).join('') +
          '</select>' +
          '<span class="sub">建议 ' + sc.sec + ' 秒，最长 ' + t.maxSec + ' 秒</span>' +
        '</div>' +
      '</div>' +
      stage(t, '先说结论，再给证据，最后收住')
  }

  function stage(t, tip) {
    return '' +
      '<div class="card">' +
        '<div class="stage">' +
          '<button class="mic-btn ' + (t.recording ? 'rec' : '') + '" data-act="mic" ' + (t.recording ? 'disabled' : '') + '>' + (t.recording ? '录音中' : '点击开口') + '</button>' +
          '<div class="timer num" id="timer">00:00</div>' +
          '<div class="meter" id="meter">' + new Array(17).join('<i></i>') + '</div>' +
          '<div class="stage-tip" id="stageTip">' + esc(tip) + '</div>' +
          (t.recording ? '<button class="btn ghost" data-act="stop" style="margin-top:12px">说完了，停</button>' : '') +
        '</div>' +
      '</div>'
  }

  function resultPanel(t) {
    var res = t.result
    var rowsHtml = ''
    if (res) {
      var preview = computeReport({
        mode: t.mode === 'speak' ? 'speak' : 'read',
        metrics: res,
        text: t.mode === 'read' ? (entryOf(t.entryId) || {}).text : '',
        scene: t.mode === 'speak' ? sceneOf(t.sceneId) : null,
        entry: entryOf(t.entryId),
        checklist: t.checklist,
        transcript: t.transcript
      })
      rowsHtml = '<div class="metric-grid">' + metricRows(preview).slice(0, 4).map(function (r) {
        return '<div class="metric"><div class="v num ' + r.s + '">' + esc(r.v) + '</div><div class="k">' + esc(r.k) + ' · ' + esc(r.note) + '</div></div>'
      }).join('') + '</div>'
    }
    return '' +
      '<div class="card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div class="label">本次录音</div>' +
          (rec.lastUrl ? '<a href="' + rec.lastUrl + '" target="_blank" class="sub" style="color:var(--accent)">试听 ↗</a>' : '') +
        '</div>' +
        rowsHtml +
      '</div>' +
      (t.mode === 'speak' ? speakReview(t) : '') +
      '<div style="display:flex;gap:12px;margin-top:16px">' +
        '<button class="btn ghost" data-act="again">重录</button>' +
        '<button class="btn" data-act="submit">生成报告</button>' +
      '</div>'
  }

  function speakReview(t) {
    var items = [
      { k: 'xu', l: '开头先给了结论，没有先铺垫背景' },
      { k: 'wu', l: '至少举了一个具体例子或数据' },
      { k: 'qing', l: '提到了听众在意的事，而不是只讲自己' },
      { k: 'du', l: '在时限内收住了，没有拖尾' }
    ]
    return '' +
      '<div class="card">' +
        '<div class="label">复盘勾选 · 据实选择，不必全勾</div>' +
        '<div class="checks" style="margin-top:10px">' +
          items.map(function (i) {
            return '<div class="check ' + (t.checklist[i.k] ? 'on' : '') + '" data-act="check" data-k="' + i.k + '">' +
              '<div class="box">' + (t.checklist[i.k] ? '✓' : '') + '</div><div>' + i.l + '</div></div>'
          }).join('') +
        '</div>' +
        '<div class="line"></div>' +
        '<div class="label">文字稿 · 可选，补上后能定位到具体句子</div>' +
        '<textarea id="tr" data-field="transcript" placeholder="把刚才说的主要内容敲进来，一句话一行即可" style="margin-top:8px">' + esc(t.transcript) + '</textarea>' +
      '</div>'
  }

  function textPanel(t) {
    var sc = sceneOf(t.sceneId)
    return '' +
      '<div class="card">' +
        '<div class="label">文字评测 · 没有麦克风时用，只评内容与结构</div>' +
        '<div class="sub" style="margin:8px 0 12px">建议 150–400 字，一段话讲一件事。也可以用场景题目自测。</div>' +
        '<textarea id="tr" data-field="transcript" placeholder="例如：我的判断是这个方案可以上，但要缩范围……" style="min-height:200px">' + esc(t.transcript) + '</textarea>' +
        '<div class="toolbar" style="margin:12px 0 0">' +
          '<select id="sceneSel" data-field="scene" style="height:38px;border:1px solid var(--line);border-radius:8px;padding:0 10px;background:#fff;font-family:inherit;font-size:13px">' +
            '<option value="">不指定场景</option>' +
            SCENES.map(function (x) { return '<option value="' + x.id + '"' + (x.id === t.sceneId ? ' selected' : '') + '>' + esc(x.name) + '</option>' }).join('') +
          '</select>' +
          '<span class="sub">选了场景会按场景时长给建议</span>' +
          '<button class="btn" style="margin-left:auto" data-act="textScore">评测</button>' +
        '</div>' +
      '</div>' +
      '<div class="hint" style="margin-top:12px">这一项不产生“有节”分数（没有录音），其余五维按文字稿的真实统计给分，并标出原句。</div>'
  }

  function viewReport() {
    var a = getAttempt(state.reportId) || recentAttempts(1)[0]
    if (!a) {
      return '<div class="empty" style="padding:90px 0">还没有报告。<br><br><button class="btn" data-act="go" data-view="train">去练一段</button></div>'
    }
    state.reportId = a.id
    var d = new Date(a.ts)
    var dims = DIMS.map(function (k) { return { k: k, v: a.dims[k] || 0, scored: !!a.scored[k] } })
    var covered = DIMS.filter(function (k) { return a.scored[k] })
    var rows = metricRows({
      mode: a.type === 'text' ? 'text' : (a.type === 'speak' ? 'speak' : 'read'),
      rate: a.rate, charCount: a.charCount, metrics: a.metrics, duration: a.duration,
      targetSec: a.targetSec, text: a.text
    })
    var band = a.total >= 85 ? '已经稳了' : a.total >= 72 ? '成形了' : a.total >= 60 ? '有基础' : '继续练'
    return '' +
      '<div class="score-card">' +
        '<div class="top"><span class="pill">' + ({ read: '跟读', speak: '实战', text: '文字' }[a.type] || '训练') + '</span>' +
        '<span class="time">' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</span></div>' +
        '<div class="score-row"><b class="num">' + a.total + '</b><div><div class="band">' + band + '</div>' +
        '<div class="cov">覆盖：' + covered.join('、') + (covered.length < 6 ? '（其余沿用档案）' : '') + '</div></div></div>' +
        (a.confidence === 'low' ? '<div style="margin-top:10px;font-size:12px;color:#e2a892">录音偏短或数据不足，本次置信度低</div>' : '') +
      '</div>' +
      '<div class="grid-2" style="margin-top:16px">' +
        '<div class="card"><div class="section" style="margin-top:0">六维</div><canvas id="repRadar" style="display:block;margin:0 auto"></canvas>' +
          '<div class="hint" style="text-align:center;margin-top:4px">雷达为当前档案；灰条为本次未评项</div>' +
          '<div class="dim-list">' + dims.map(function (x) {
            return '<div class="dim-row"><div class="k ' + (x.scored ? '' : 'off') + '">' + x.k + '</div>' +
              '<div class="bar"><i class="' + (x.scored ? '' : 'off') + '" style="width:' + (x.scored ? x.v : 0) + '%"></i></div>' +
              '<div class="v num ' + (x.scored ? '' : 'off') + '">' + (x.scored ? x.v : '未评') + '</div></div>'
          }).join('') + '</div></div>' +
        '<div class="card"><div class="section" style="margin-top:0">实测指标</div>' +
          '<div class="metric-grid" style="grid-template-columns:1fr 1fr">' + rows.map(function (r) {
            return '<div class="metric"><div class="v num ' + r.s + '">' + esc(r.v) + '</div><div class="k">' + esc(r.k) + ' · ' + esc(r.note) + '</div></div>'
          }).join('') + '</div>' +
          '<div class="hint" style="margin-top:12px">语速、停顿、音量来自录音逐帧计算；结构与用词来自勾选与文字稿。</div></div>' +
      '</div>' +
      '<div class="section">三条改动</div>' +
      (a.advice || []).map(function (x) {
        return '<div class="advice"><div class="head"><span class="tag2">' + esc(x.tag) + '</span><span class="quote">' + esc(x.quote) + '</span></div>' +
          '<div class="row"><span class="k">为什么</span><span class="v">' + esc(x.why) + '</span></div>' +
          '<div class="row"><span class="k">怎么改</span><span class="v">' + esc(x.fix) + '</span></div></div>'
      }).join('') +
      '<div class="card demo" style="margin-top:16px"><div class="label">下一次可以这样起</div><div style="margin-top:8px;font-size:14px;line-height:1.9;color:#4a4238">' + esc(a.demo || '') + '</div></div>' +
      (a.recommend ? '<div class="card rec" data-act="practice" data-id="' + a.recommend.id + '">' +
        '<div class="label">下一步练这一条 · 补 ' + esc(a.recommend.dim) + '</div>' +
        '<div class="text serif">' + esc(a.recommend.text) + '</div>' +
        '<div class="work">' + esc(a.recommend.work) + ' · ' + esc(a.recommend.author) + ' ›</div></div>' : '') +
      '<div style="display:flex;gap:12px;margin-top:20px">' +
        '<button class="btn ghost" data-act="go" data-view="home">回今日</button>' +
        '<button class="btn" data-act="againReport">再练一次</button>' +
      '</div>' +
      '<div class="hint" style="margin-top:16px;text-align:center">本地引擎：没有语义理解，因此只对能计算的项打分；接模型后可给到句级改写。</div>'
  }

  function viewProfile() {
    var s = load()
    var rv = radarValues()
    var recent = recentAttempts(8)
    var max = Math.max.apply(null, recent.map(function (a) { return a.total }).concat([1]))
    var maxIdx = -1, mv = -1
    recent.forEach(function (a, i) { if (a.total > mv) { mv = a.total; maxIdx = i } })
    var mins = Math.round(s.attempts.reduce(function (acc, a) { return acc + (a.duration || 0) }, 0) / 60)
    var dist = libDist()
    var totalUsed = Object.keys(dist).reduce(function (acc, k) { return acc + dist[k] }, 0)
    var libs = LIBS.map(function (l) {
      var c = dist[l.code] || 0
      return { name: l.name, c: c, p: totalUsed ? Math.round(c / totalUsed * 100) : 0 }
    }).filter(function (x) { return x.c > 0 }).sort(function (a, b) { return b.c - a.c })
    var favs = s.favorites.map(entryOf).filter(Boolean)
    var weak = '', low = 101
    rv.forEach(function (v, i) { if (v > 0 && v < low) { low = v; weak = DIMS[i] } })

    return '' +
      '<div style="display:flex;align-items:baseline;gap:12px"><h2 style="margin:0;font-size:24px;letter-spacing:.1em">成长档案</h2>' +
      '<span class="sub">连续 ' + (s.streak || 0) + ' 天 · 开口 ' + s.attempts.length + ' 次 · 累计 ' + mins + ' 分钟</span></div>' +
      '<div class="stats" style="margin-top:16px">' +
        '<div class="stat"><b class="num">' + (s.streak || 0) + '</b><span>连续天数</span></div>' +
        '<div class="stat"><b class="num">' + s.attempts.length + '</b><span>累计开口</span></div>' +
        '<div class="stat"><b class="num">' + mins + '</b><span>累计分钟</span></div>' +
      '</div>' +
      '<div class="grid-2" style="margin-top:16px">' +
        '<div class="card"><div class="section" style="margin-top:0">六维</div><canvas id="proRadar" style="display:block;margin:0 auto"></canvas>' +
          '<div class="hint" style="text-align:center;margin-top:8px">' + (weak ? '当前最弱：' + weak : '还没有基线，先做一次诊断') + '</div></div>' +
        '<div class="card"><div class="section" style="margin-top:0">最近 ' + recent.length + ' 次</div>' +
          '<div class="chart">' + (recent.length ? recent.map(function (a, i) {
            var d = new Date(a.ts)
            return '<div class="bar-wrap"><span class="bar-v num">' + a.total + '</span>' +
              '<div class="bar ' + (i === maxIdx ? 'hot' : '') + '" style="height:' + Math.max(6, Math.round(a.total / max * 68)) + '%"></div>' +
              '<span class="bar-d">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div>'
          }).join('') : '<div class="empty" style="width:100%">还没有记录</div>') + '</div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="section" style="margin-top:0">语料使用谱</div>' +
        (libs.length ? libs.map(function (l) {
          return '<div class="lib-row"><div class="name">' + l.name + '</div><div class="bar2"><i style="width:' + l.p + '%"></i></div><div class="n num">' + l.c + '</div></div>'
        }).join('') : '<div class="hint">开始引用之后才出现</div>') + '</div>' +
      '<div class="card"><div class="section" style="margin-top:0">收藏</div>' +
        (favs.length ? favs.map(function (e) {
          return '<div class="set-row" data-act="detail" data-id="' + e.id + '"><div><div class="serif" style="font-size:17px">' + esc(e.text.length > 40 ? e.text.slice(0, 40) + '…' : e.text) + '</div>' +
            '<div class="sub" style="font-size:12px">' + esc(e.work) + '</div></div><div class="arrow">›</div></div>'
        }).join('') : '<div class="hint">在语料详情里点“收藏”，会收在这里</div>') + '</div>' +
      '<div class="card">' +
        '<div class="set-row" data-act="diagnose"><div>重新做一次诊断</div><div class="arrow">›</div></div>' +
        '<div class="set-row" data-act="about"><div>关于评分方式</div><div class="arrow">›</div></div>' +
        '<div class="set-row danger" data-act="clear"><div>清空本机数据</div><div class="arrow">›</div></div>' +
      '</div>'
  }

  /* ---------- 详情弹窗 ---------- */
  function openDetail(id) {
    var e = entryOf(id)
    if (!e) return
    var rel = CORPUS.filter(function (x) {
      return x.id !== e.id && x.theme.some(function (t) { return e.theme.indexOf(t) >= 0 })
    }).slice(0, 3)
    var faved = isFav(id)
    $('#modalBody').innerHTML = '' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">' +
        '<div class="label" style="padding-top:6px">' + libName(e.lib) + ' · ' + esc(e.work) + ' · ' + esc(e.author) + ' · ' + esc(e.era) + '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn ghost sm" data-act="fav" data-id="' + e.id + '">' + (faved ? '已收藏' : '收藏') + '</button>' +
          '<button class="btn ghost sm" data-act="closeModal">关闭</button>' +
        '</div>' +
      '</div>' +
      '<div class="serif" style="font-size:26px;line-height:1.85;margin:16px 0 14px">' + esc(e.text) + '</div>' +
      '<div>' + e.theme.map(function (t) { return '<span class="tag">' + t + '</span>' }).join('') +
        e.cap.map(function (c) { return '<span class="tag blue">' + c + '</span>' }).join('') + '</div>' +
      '<div class="line"></div>' +
      '<div class="label">为什么好</div><div style="font-size:14px;line-height:1.9;color:var(--ink2);margin-top:6px">' + esc(e.why) + '</div>' +
      '<div class="line"></div>' +
      '<div class="label">怎么用</div><div style="font-size:14px;line-height:1.9;color:var(--ink2);margin-top:6px">' + esc(e.use) + ' · ' + esc(e.rh) + ' · 难度 ' + esc(e.diff) + '</div>' +
      '<div style="margin-top:12px;background:#fbf3ef;border-left:3px solid #bd7c63;padding:12px 14px;border-radius:0 8px 8px 0">' +
        '<div style="font-size:11px;color:#a2553f;letter-spacing:.1em">误用边界</div>' +
        '<div style="font-size:13px;line-height:1.8;color:var(--ink2);margin-top:4px">' + esc(e.anti) + '</div></div>' +
      (e.beat ? '<div style="margin-top:12px;font-size:13px;color:#6a5c4c;background:#faf7f0;padding:12px 14px;border-radius:8px">朗读提示：' + esc(e.beat) + '</div>' : '') +
      (rel.length ? '<div class="line"></div><div class="label">同主题，换个说法</div><div style="margin-top:8px">' +
        rel.map(function (x) {
          return '<div class="set-row" data-act="detail" data-id="' + x.id + '"><div><div class="serif" style="font-size:15px">' + esc(x.text.length > 34 ? x.text.slice(0, 34) + '…' : x.text) + '</div><div class="sub" style="font-size:12px">' + esc(x.work) + '</div></div><div class="arrow">›</div></div>'
        }).join('') + '</div>' : '') +
      '<div style="margin-top:18px"><button class="btn" data-act="practice" data-id="' + e.id + '">拿去跟读</button></div>'
    $('#modal').hidden = false
  }

  /* ---------- 训练流程 ---------- */
  function startMic() {
    var t = state.train
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast('这个浏览器不支持录音，请用文字模式')
      return
    }
    t.recording = true
    t.result = null
    rec.lastUrl = ''
    render()
    rec.onTick = function (el, rms, levels) {
      var timer = $('#timer')
      if (timer) timer.textContent = fmt(el)
      var bars = $('#meter') ? $('#meter').querySelectorAll('i') : []
      for (var i = 0; i < bars.length; i++) {
        var v = levels[levels.length - bars.length + i] || 0
        bars[i].style.height = Math.max(4, Math.min(30, Math.round(v * 260))) + 'px'
      }
    }
    rec.onEnd = function (res) {
      t.recording = false
      t.result = res
      t.step = 1
      render()
      if (!res.valid) toast('录音太短，再试一次')
    }
    rec.start(t.maxSec).catch(function () {
      t.recording = false
      render()
      toast('麦克风被拒绝：地址栏权限里允许麦克风，或改用文字模式')
    })
  }

  function doSubmit() {
    var t = state.train
    if (!t.result) { toast('先录一段'); return }
    var entry = entryOf(t.entryId)
    var scene = t.mode === 'speak' ? sceneOf(t.sceneId) : null
    var s = load()
    var report = computeReport({
      mode: t.mode === 'speak' ? 'speak' : 'read',
      metrics: t.result,
      text: t.mode === 'read' ? (entry ? entry.text : '') : '',
      entry: entry,
      scene: scene,
      checklist: t.checklist,
      transcript: t.transcript,
      baseline: s.baseline ? s.baseline.dims : null
    })
    var ad = advice(report, entry, scene)
    var attempt = {
      id: 'a' + Date.now(), ts: Date.now(), type: t.mode,
      entryId: entry ? entry.id : '', entryLib: entry ? entry.lib : '',
      entryWork: entry ? entry.work : '', sceneId: scene ? scene.id : '',
      sceneName: scene ? scene.name : '',
      dims: report.dims, scored: report.scored, total: report.total,
      confidence: report.confidence, rate: report.rate, charCount: report.charCount,
      duration: report.duration, targetSec: report.targetSec, metrics: report.metrics,
      text: report.text, checklist: t.checklist, transcript: t.transcript,
      advice: ad.advice, demo: ad.demo, recommend: ad.recommend, weakest: ad.weakest
    }
    addAttempt(attempt)
    markDone(t.mode === 'speak' ? 'speak' : 'read')
    useCorpus(attempt.entryId)
    checkIn()
    state.reportId = attempt.id
    state.view = 'report'
    state.train = null
    render()
    toast('报告已生成')
  }

  function scoreText() {
    var t = state.train
    if (countCJK(t.transcript) < 20) { toast('至少写 20 个字再评测'); return }
    var scene = t.sceneId ? sceneOf(t.sceneId) : null
    var s = load()
    var report = computeReport({
      mode: 'text', metrics: null, text: '', entry: null, scene: scene,
      checklist: {}, transcript: t.transcript, baseline: s.baseline ? s.baseline.dims : null
    })
    var ad = advice(report, null, scene)
    var attempt = {
      id: 'a' + Date.now(), ts: Date.now(), type: 'text',
      entryId: '', entryLib: '', entryWork: '', sceneId: scene ? scene.id : '', sceneName: scene ? scene.name : '',
      dims: report.dims, scored: report.scored, total: report.total, confidence: 'normal',
      rate: 0, charCount: report.charCount, duration: 0, targetSec: report.targetSec,
      metrics: null, text: report.text, checklist: {}, transcript: t.transcript,
      advice: ad.advice, demo: ad.demo, recommend: ad.recommend, weakest: ad.weakest
    }
    addAttempt(attempt)
    markDone('decompose')
    checkIn()
    state.reportId = attempt.id
    state.view = 'report'
    state.train = null
    render()
    toast('已生成文字报告')
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]')
    if (!el) return
    if (el.tagName === 'A') ev.preventDefault()
    var act = el.dataset.act
    if (act === 'go') {
      state.view = el.dataset.view
      if (state.view === 'train' && !state.train) state.train = newTrain('read')
      render()
    } else if (act === 'task') {
      var key = el.dataset.key
      var plan = todayPlan()
      if (key === 'read' && plan.recite) {
        state.train = newTrain('read')
        state.train.entryId = plan.recite.id
        state.view = 'train'; render()
      } else if (key === 'decompose' && plan.quote) {
        openDetail(plan.quote.id)
      } else if (key === 'speak') {
        state.train = newTrain('speak')
        state.view = 'train'; render()
      }
    } else if (act === 'startAll') {
      var p = todayPlan()
      state.train = newTrain('read')
      if (p.recite) state.train.entryId = p.recite.id
      state.view = 'train'; render()
    } else if (act === 'diagnose') {
      state.view = 'train'
      state.train = newTrain('read')
      state.train.diagnose = true
      state.train.entryId = 'A-40'
      render()
      toast('用《赤壁赋》开头做 60 秒诊断：读稳，不求快')
    } else if (act === 'lib') {
      state.lib = el.dataset.lib; render()
    } else if (act === 'detail') {
      openDetail(el.dataset.id)
    } else if (act === 'closeModal') {
      $('#modal').hidden = true
    } else if (act === 'fav') {
      var on = toggleFav(el.dataset.id)
      el.textContent = on ? '已收藏' : '收藏'
      toast(on ? '已收藏' : '已取消')
    } else if (act === 'practice') {
      var id = el.dataset.id
      state.train = newTrain('read')
      state.train.entryId = id
      state.view = 'train'
      $('#modal').hidden = true
      render()
    } else if (act === 'mode') {
      state.train = newTrain(el.dataset.mode)
      render()
    } else if (act === 'nextEntry') {
      var pool = recitePool()
      var i = pool.findIndex(function (e) { return e.id === state.train.entryId })
      state.train.entryId = pool[(i + 1) % pool.length].id
      render()
    } else if (act === 'mic') {
      startMic()
    } else if (act === 'stop') {
      rec.stop()
    } else if (act === 'again') {
      state.train.step = 0
      state.train.result = null
      state.train.transcript = ''
      render()
    } else if (act === 'check') {
      var k = el.dataset.k
      state.train.checklist[k] = !state.train.checklist[k]
      render()
    } else if (act === 'submit') {
      doSubmit()
    } else if (act === 'textScore') {
      scoreText()
    } else if (act === 'againReport') {
      var a = getAttempt(state.reportId) || recentAttempts(1)[0]
      state.train = newTrain(a && a.type === 'speak' ? 'speak' : 'read')
      if (a && a.entryId) state.train.entryId = a.entryId
      state.view = 'train'; render()
    } else if (act === 'about') {
      $('#modalBody').innerHTML = '<h3 style="margin:0 0 12px">评分怎么来的</h3>' +
        '<p style="font-size:14px;line-height:1.9;color:var(--ink2);margin:0">' +
        '语速、有效停顿、音量稳定来自浏览器录音的逐帧计算（32ms 一帧，取 RMS）。<br><br>' +
        '结构与用词来自你的勾选和文字稿：是否先给结论、有没有例子和数据、连接词密度、句长分布、口头禅占比。<br><br>' +
        '没有语义理解，所以会给未采集项标注“未评”，而不是拿假分数把雷达填满。接模型后可替换为逐句证据与改写。' +
        '</p><div style="margin-top:18px"><button class="btn" data-act="closeModal">知道了</button></div>'
      $('#modal').hidden = false
    } else if (act === 'clear') {
      $('#modalBody').innerHTML = '<h3 style="margin:0 0 10px">清空本机数据</h3>' +
        '<p style="font-size:14px;color:var(--ink2)">会删除全部训练记录、收藏与档案，无法恢复。</p>' +
        '<div style="display:flex;gap:10px;margin-top:16px"><button class="btn ghost" data-act="closeModal">取消</button>' +
        '<button class="btn" data-act="clearConfirm" style="background:var(--bad)">确认清空</button></div>'
      $('#modal').hidden = false
    } else if (act === 'clearConfirm') {
      localStorage.removeItem(KEY)
      $('#modal').hidden = true
      state.train = null
      state.reportId = ''
      render()
      toast('已清空')
    }
  })

  document.addEventListener('input', function (ev) {
    var el = ev.target
    if (el.dataset.field === 'kw') { state.kw = el.value; render(); var box = $('#kw'); if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length) } }
    else if (el.dataset.field === 'transcript') { state.train.transcript = el.value }
  })

  document.addEventListener('change', function (ev) {
    var el = ev.target
    if (el.dataset.field === 'scene') {
      state.train.sceneId = el.value
      if (state.train.mode === 'speak') render()
    }
  })

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !$('#modal').hidden) $('#modal').hidden = true
  })

  /* ---------- 启动 ---------- */
  try {
    var qv = new URLSearchParams(location.search).get('view')
    if (qv && ['home', 'corpus', 'train', 'report', 'profile'].indexOf(qv) >= 0) {
      state.view = qv
      var qm = new URLSearchParams(location.search).get('mode')
      if (qv === 'train') state.train = newTrain(['read', 'speak', 'text'].indexOf(qm) >= 0 ? qm : 'read')
    }
  } catch (e) {}
  render()
  $('#ver').textContent = 'v0.2.1'

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {})
    })
  }
})()
