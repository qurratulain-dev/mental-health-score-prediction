/* =====================================================================
   Config
   ===================================================================== */
const LOCAL_API = 'http://127.0.0.1:8000';
const isLocalHost = location.protocol === 'file:' || ['localhost', '127.0.0.1', ''].includes(location.hostname);
const API = (window.MENTAL_HEALTH_API || (isLocalHost ? LOCAL_API : location.origin)).replace(/\/$/, '');
const ARC_LEN = Math.PI * 100;               // length of the semi-circle path (r = 100)
const $ = id => document.getElementById(id);

// Fallback option lists, used if GET /options is unreachable
const FALLBACK = {
  genders: ['Male', 'Female'],
  academic_levels: ['High School', 'Undergraduate', 'Graduate'],
  platforms: ['Facebook','Instagram','KakaoTalk','LINE','LinkedIn','Snapchat','TikTok','Twitter','VKontakte','WeChat','WhatsApp','YouTube'],
  purposes: ['Education', 'Entertainment', 'Networking', 'News'],
  stress_levels: ['Low', 'Medium', 'High', 'Very High']
};
const DEFAULTS = { gender: 'Male', academic_level: 'Undergraduate', platform: 'Instagram', purpose: 'Entertainment', stress_level: 'Medium' };
const COUNTRIES = ['Pakistan','India','USA','UK','UAE','Canada','Australia','Germany','France','Brazil','Japan','South Korea','China','Russia','Turkey','Egypt','Nigeria','Mexico','Indonesia','Other'];

// Score bands: label, message, accent colour
const BANDS = [
  { max: 4,   label: 'NEEDS CARE',     color: '#f08a8a', msg: 'Your habits suggest real strain right now. Small changes to sleep and screen time can help, and talking to someone is always worth it.' },
  { max: 5.5, label: 'UNDER PRESSURE', color: '#f0b27a', msg: 'Things look a little stretched. More rest and less late-night scrolling tend to lift this score the most.' },
  { max: 7,   label: 'HOLDING STEADY', color: '#a99cf5', msg: 'A balanced picture with room to grow. Protect your sleep and keep moving each day.' },
  { max: 8.5, label: 'DOING WELL',     color: '#a99cf5', msg: 'Your lifestyle inputs line up with healthier patterns in the data.' },
  { max: 10,  label: 'THRIVING',       color: '#8fe3c0', msg: 'An excellent balance. Whatever you’re doing, it’s clearly working for you.' }
];
const bandFor = s => BANDS.find(b => s <= b.max) || BANDS[BANDS.length - 1];

/* =====================================================================
   Setup: options and sliders
   ===================================================================== */
function fillSelect(id, items, selected) {
  const el = $(id);
  el.innerHTML = items.map(v => `<option value="${v}">${v}</option>`).join('');
  el.value = items.includes(selected) ? selected : items[0];
}

function fillCountries(items) {
  $('countries').innerHTML = items.map(c => `<option value="${c}">`).join('');
}

function setStatus(state, text) {          // the dot beside the eyebrow shows API health
  $('eyebrow').className = 'eyebrow ' + state;
  $('eyebrow').title = text;
}

async function loadOptions() {
  let opts = FALLBACK;
  try {
    const res = await fetch(`${API}/options`);
    if (!res.ok) throw new Error(res.status);
    opts = await res.json();
    setStatus('on', 'Model online');
  } catch {
    setStatus('off', 'Model offline. Start the API server');
    setMeta(`Couldn’t reach the API at ${API}, so default options are shown. Start the server and refresh.`, true);
  }
  fillSelect('gender', opts.genders, DEFAULTS.gender);
  fillSegment('academic_level', 'academic', opts.academic_levels, DEFAULTS.academic_level);
  fillSelect('platform', opts.platforms, DEFAULTS.platform);
  fillSegment('purpose', 'purpose', opts.purposes, DEFAULTS.purpose);
  fillSegment('stress_level', 'stress', opts.stress_levels, DEFAULTS.stress_level);
  fillCountries(opts.countries || COUNTRIES);
}

// Row of radio buttons styled as a segmented control (used for stress level and purpose)
function fillSegment(containerId, name, items, selected) {
  const pick = items.includes(selected) ? selected : items[0];
  $(containerId).innerHTML = items.map((v, i) =>
    `<input type="radio" name="${name}" id="${name}-${i}" value="${v}"${v === pick ? ' checked' : ''}><label for="${name}-${i}">${v}</label>`).join('');
}
const checked = name => (document.querySelector(`input[name=${name}]:checked`) || {}).value;

/* =====================================================================
   Form to payload (matches the FastAPI StudentData schema)
   ===================================================================== */
function buildPayload() {
  return {
    age: parseInt($('age').value, 10),
    gender: $('gender').value,
    country: $('country').value.trim(),
    academic_level: checked('academic'),
    most_used_platform: $('platform').value,
    purpose_of_use: checked('purpose'),
    avg_daily_usage_hours: parseFloat($('usage').value),
    daily_unlocks: parseInt($('unlocks').value, 10),
    study_hours: parseFloat($('study').value),
    physical_activity_hours: parseFloat($('activity').value),
    sleep_hours_per_night: parseFloat($('sleep').value),
    stress_level: checked('stress')
  };
}

// Client-side checks mirroring the API's constraints
function validate(p) {
  const bad = [];
  if (!(p.age >= 18 && p.age <= 24)) bad.push(['age', 'Age must be between 18 and 24.']);
  if (!p.country) bad.push(['country', 'Please enter your country.']);
  [['study', p.study_hours, 'Study hours'], ['activity', p.physical_activity_hours, 'Physical activity'],
   ['sleep', p.sleep_hours_per_night, 'Sleep'], ['usage', p.avg_daily_usage_hours, 'Social media use']]
    .forEach(([id, v, name]) => { if (!(v >= 0 && v <= 24)) bad.push([id, `${name} must be between 0 and 24 hours.`]); });
  if (!(p.daily_unlocks >= 0)) bad.push(['unlocks', 'Enter how many times you unlock your phone per day.']);
  if (!p.stress_level) bad.push(['stress_level', 'Pick a stress level.']);
  if (!p.academic_level) bad.push(['academic_level', 'Pick an academic level.']);
  if (!p.purpose_of_use) bad.push(['purpose', 'Pick a main purpose.']);
  ['age', 'country', 'study', 'activity', 'sleep', 'usage', 'unlocks'].forEach(id => $(id).classList.remove('invalid'));
  bad.forEach(([id]) => $(id).classList.add('invalid'));
  return bad;
}

/* =====================================================================
   Gauge animation: number, arc and end-dot driven by one rAF loop
   ===================================================================== */
let shown = 0, anim = null, hasResult = false;
const easeOut = t => 1 - Math.pow(1 - t, 4);

function paint(v) {
  $('arc').style.strokeDashoffset = ARC_LEN * (1 - v / 10);
  $('score').textContent = v.toFixed(1);
  const a = Math.PI * (1 - v / 10);                       // dot rides the end of the arc
  $('dot').setAttribute('cx', (120 + 100 * Math.cos(a)).toFixed(2));
  $('dot').setAttribute('cy', (120 - 100 * Math.sin(a)).toFixed(2));
}

function animateTo(target, ms = 1400) {
  cancelAnimationFrame(anim);
  const from = shown, start = performance.now();
  const step = now => {
    const t = Math.min((now - start) / ms, 1);
    shown = from + (target - from) * easeOut(t);
    paint(shown);
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

function showResult(score, modelName) {
  const band = bandFor(score);
  hasResult = true;
  $('score').classList.remove('idle');
  $('dot').style.opacity = 1;
  const s = $('status');
  s.textContent = band.label; s.style.color = band.color; s.style.borderColor = band.color + '88';
  $('message').textContent = band.msg;
  setMeta(`Estimated by ${modelName}`);
  animateTo(Math.max(0, Math.min(10, score)));
}

function setMeta(text, isError = false) {
  const m = $('meta'); m.textContent = text; m.classList.toggle('error', isError);
}

/* =====================================================================
   Prediction
   ===================================================================== */
const btn = $('submit');
let inflight = 0, debounce;

async function predict({ manual = false } = {}) {
  const payload = buildPayload();
  const errors = validate(payload);
  if (errors.length) { if (manual) setMeta(errors[0][1], true); return; }

  const ticket = ++inflight;                 // ignore stale responses
  if (manual) { btn.classList.add('loading'); btn.disabled = true; $('btn-label').textContent = 'Predicting…'; }
  $('card').classList.add('pulse');

  try {
    const res = await fetch(`${API}/predict`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // FastAPI validation errors arrive as an array in `detail`
      const d = Array.isArray(data.detail) ? data.detail.map(e => `${e.loc.slice(-1)}: ${e.msg}`).join('; ') : data.detail;
      throw new Error(d || `Request failed (${res.status})`);
    }
    if (ticket === inflight) showResult(data.mental_health_score, data.model);
  } catch (err) {
    const offline = err instanceof TypeError;
    if (ticket === inflight) setMeta(offline ? `Can’t reach the API. Make sure it’s running at ${API}.` : err.message, true);
  } finally {
    $('card').classList.remove('pulse');
    if (manual) { btn.classList.remove('loading'); btn.disabled = false; $('btn-label').textContent = 'Predict my score'; }
  }
}

// Debounced live updates after the first result, so the score feels alive
function scheduleLive() {
  if (!hasResult) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => predict(), 350);
}

/* =====================================================================
   Init
   ===================================================================== */
$('form').addEventListener('input', e => { e.target.classList.remove('invalid'); scheduleLive(); });
$('form').addEventListener('change', scheduleLive);
$('form').addEventListener('submit', e => { e.preventDefault(); predict({ manual: true }); });

fillCountries(COUNTRIES);
paint(0);
$('score').textContent = '–.–';
loadOptions();
