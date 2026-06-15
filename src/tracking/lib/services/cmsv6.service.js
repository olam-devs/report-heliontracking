/**
 * cmsv6.service.js — 808GPS/CMSV6 API Service
 * Fixed: correct endpoint names, GPS coordinate/speed/fuel scaling,
 *        vehicle field names, alarm params, and active-alarm endpoint.
 */

require('dotenv').config();
const axios     = require('axios');
const NodeCache = require('node-cache');
const crypto    = require('crypto');
const logger    = require('../utils/logger');

// ── Config ───────────────────────────────────────────────────────────────────
const BASE     = process.env.CMSV6_BASE_URL || 'http://13.53.215.88';
const USERNAME = process.env.CMSV6_USERNAME || 'helion';
const PASSWORD = process.env.CMSV6_PASSWORD || 'Starlink@2026';
const AES_KEY  = 'ttx123456Aes1234';

const TTL = {
  session:     parseInt(process.env.SESSION_CACHE_TTL)      || 1800,
  gps:         parseInt(process.env.GPS_CACHE_TTL)          || 10,
  fuel:        parseInt(process.env.FUEL_CACHE_TTL)         || 30,
  report:      parseInt(process.env.REPORT_CACHE_TTL)       || 300,
  vehicleList: parseInt(process.env.VEHICLE_LIST_CACHE_TTL) || 120,
};

// ── Caches ───────────────────────────────────────────────────────────────────
const sessionCache = new NodeCache({ stdTTL: TTL.session });
const dataCache    = new NodeCache({ useClones: false });
function cacheSet(k, v, ttl) { dataCache.set(k, v, ttl); return v; }

// ── AES Encryption ────────────────────────────────────────────────────────────
function aesEncrypt(plaintext) {
  const key    = Buffer.from(AES_KEY, 'utf8');
  const input  = Buffer.from(plaintext, 'utf8');
  const block  = 16;
  const padLen = block - (input.length % block);
  const padded = Buffer.concat([input, Buffer.alloc(padLen, padLen)]);
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64');
}

function encryptBody(obj) {
  return aesEncrypt(JSON.stringify(obj));
}

// ── GPS Scaling Helpers ────────────────────────────────────────────────────────
// Confirmed from live API data (StandardApiAction_getDeviceStatus):
//   lat:  raw integer  e.g. -6769745  → divide by 1,000,000 → -6.769745
//   lng:  raw integer  e.g. 39194545  → divide by 1,000,000 → 39.194545
//   mlat/mlng: pre-converted decimal strings — use as primary source when present
//   sp:   divide by 10  (e.g. 120 → 12.0 km/h)
//   yl:   divide by 100 (e.g. 140856 → 1408.56 — may be litres or sensor units)
//   lc:   total mileage (metres → divide by 1000 for km)
//   lt:   today's mileage (metres → divide by 1000 for km)
//   ol:   0=offline, 1=online, 2=alarm
//   ac:   Audio Type (codec) — NOT ignition. Always 10 for these devices.
//   s1:   JT/T 808 status word. Bit1=ACC (1=ON), bit0=device-active flag (always 1)
const DIRECTIONS = ['N','NE','E','SE','S','SW','W','NW'];
function scaleStatus(raw) {
  if (!raw) return null;
  // Use pre-converted mlat/mlng strings when available (most accurate)
  const lat = raw.mlat != null ? parseFloat(raw.mlat)
             : raw.lat  != null ? raw.lat / 1000000
             : null;
  const lng = raw.mlng != null ? parseFloat(raw.mlng)
             : raw.lng  != null ? raw.lng / 1000000
             : null;
  return {
    ...raw,
    devIdno:    raw.devIdno || raw.id || null,
    lat,
    lng,
    speed:      raw.sp  != null ? raw.sp  / 10  : null,
    fuel:       raw.yl  != null ? raw.yl  / 100 : null,
    gpsTime:    raw.gt  || null,
    // s1 = JT/T 808 hardware status bit field. Bit 1 = ACC (1=ON, 0=OFF).
    // Bit 0 is always 1 (device active flag). Bit 1 is the ignition/ACC state.
    // NOTE: 'ac' in this API means Audio Type (codec), NOT ignition — do not use it.
    accOn:      raw.s1 != null ? (raw.s1 & 2) === 2 : null,
    signal:     raw.sn  != null ? raw.sn : null,
    satellites: raw.ns  != null ? raw.ns : null,
    directionCode: raw.hx != null ? raw.hx : null,
    directionStr:  raw.hx != null ? (DIRECTIONS[Math.round(raw.hx / 45) % 8] || null) : null,
    mileageKm:  raw.lc  != null ? raw.lc  / 1000 : null,
    todayKm:    raw.lt  != null ? raw.lt  / 1000 : null,
    alarm:      raw.alm != null ? raw.alm : (raw.s1 != null ? raw.s1 : 0),
    plate:      raw.vid || raw.abbr || null,
  };
}

// ── Authentication ─────────────────────────────────────────────────────────────
async function getSession(force = false) {
  if (!force) {
    const cached = sessionCache.get('jsession');
    if (cached) return cached;
  }
  return await doFullLogin();
}

async function doFullLogin() {
  sessionCache.del('jsession');
  sessionCache.del('cookieJsession');

  logger.info('[Auth] Logging in...');

  const res = await axios.get(
    `${BASE}/StandardApiAction_login.action`,
    {
      params: { account: USERNAME, password: PASSWORD },
      maxRedirects: 0,
      validateStatus: s => s < 400,
    }
  );

  const json = res.data;
  logger.info('[Auth] Login result: ' + json.result);

  if (json.result !== 0 || !json.jsession) {
    throw new Error(`[Auth] Login failed — result:${json.result}`);
  }

  // Per API docs: jsession and JSESSIONID are both returned in the body and are identical.
  const bodyJsession = json.jsession;

  // Also try Set-Cookie header as fallback
  const setCookie = res.headers['set-cookie'];
  let cookieJsession = json.JSESSIONID || null;
  if (!cookieJsession && setCookie) {
    const cookieArr = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const c of cookieArr) {
      const match = c.match(/JSESSIONID=([^;]+)/i);
      if (match) { cookieJsession = match[1]; break; }
    }
  }

  logger.info(`[Auth] jsession: ${bodyJsession.substring(0, 8)}...`);

  sessionCache.set('jsession', bodyJsession);
  if (cookieJsession) sessionCache.set('cookieJsession', cookieJsession);

  logger.info('[Auth] Login successful');
  return bodyJsession;
}

// ── Request Helper ──────────────────────────────────────────────────────────
async function req(endpoint, params = {}) {
  let session       = await getSession();
  let cookieSession = sessionCache.get('cookieJsession');

  const doReq = (s, cs) => {
    const headers = {};
    if (cs) headers['Cookie'] = `JSESSIONID=${cs}`;
    return axios.get(`${BASE}${endpoint}`, {
      params:  { ...params, jsession: s },
      headers,
      timeout: 20000,
    });
  };

  let res = await doReq(session, cookieSession);

  // Session expired — re-login once and retry
  if (res.data?.result === 3 || res.data?.result === 5 || res.data?.result === 7) {
    logger.warn(`[Auth] Session rejected (result:${res.data.result}) — re-logging in`);
    session       = await getSession(true);
    cookieSession = sessionCache.get('cookieJsession');
    res           = await doReq(session, cookieSession);
  }

  return res.data;
}

async function postReq(endpoint, data = {}) {
  let session       = await getSession();
  let cookieSession = sessionCache.get('cookieJsession');

  const doReq = (s, cs) => {
    const headers = { 'Content-Type': 'text/plain', 'Newv': '1' };
    if (cs) headers['Cookie'] = `JSESSIONID=${cs}`;
    return axios.post(
      `${BASE}${endpoint}`,
      encryptBody({ ...data, jsession: s }),
      { headers, timeout: 20000 }
    );
  };

  let res = await doReq(session, cookieSession);

  if (res.data?.result === 3 || res.data?.result === 5 || res.data?.result === 7) {
    session       = await getSession(true);
    cookieSession = sessionCache.get('cookieJsession');
    res           = await doReq(session, cookieSession);
  }

  return res.data;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VEHICLES
//  queryUserVehicle returns: id (vehicleId), nm (plate), dl[].id (deviceId)
//  We normalize: add plate = nm, devIdno = dl[0].id for downstream compat.
// ═══════════════════════════════════════════════════════════════════════════
function normalizeVehicle(v) {
  return {
    ...v,
    plate:   v.nm,
    devIdno: v.dl?.[0]?.id || null,
  };
}

async function getVehicles() {
  const key = 'vehicles';
  const hit = dataCache.get(key);
  if (hit) return hit;
  const data = await req('/StandardApiAction_queryUserVehicle.action');
  logger.info('[Vehicles] Raw response: ' + JSON.stringify(data).substring(0, 200));
  const vehicles = (data.vehicles || []).map(normalizeVehicle);
  return cacheSet(key, vehicles, TTL.vehicleList);
}

async function getVehicle(devIdno) {
  const vehicles = await getVehicles();
  return vehicles.find(v => v.devIdno === devIdno) || null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  GPS
//  Real-time status: StandardApiAction_getDeviceStatus.action
//    Returns status[] with lat/lng as raw ints (÷1,000,000), sp (÷10), yl (÷100)
//  History track: StandardApiAction_queryTrackDetail.action
//    Returns tracks[] with same scaling
// ═══════════════════════════════════════════════════════════════════════════
async function getVehicleGPS(devIdno) {
  const key = `gps_${devIdno}`;
  const hit = dataCache.get(key);
  if (hit) return hit;
  const data  = await req('/StandardApiAction_getDeviceStatus.action', { devIdno });
  const point = scaleStatus(data.status?.[0] || null);
  if (point) cacheSet(key, point, TTL.gps);
  return point;
}

async function getAllGPS() {
  const key = 'gps_all';
  const hit = dataCache.get(key);
  if (hit) return hit;
  // No devIdno param → returns status for all devices under the account
  const data     = await req('/StandardApiAction_getDeviceStatus.action');
  const statuses = (data.status || []).map(scaleStatus);
  return cacheSet(key, statuses, TTL.gps);
}

async function getRawStatus() {
  // Returns the completely unmodified status array straight from CMSV6 — no scaling,
  // no field renaming. Use to compare ACC ON vs ACC OFF vehicles field-by-field.
  const data = await req('/StandardApiAction_getDeviceStatus.action');
  return (data.status || []).map(s => ({ ...s }));
}

async function getGPSHistory(devIdno, begintime, endtime) {
  const key = `hist_${devIdno}_${begintime}_${endtime}`;
  const hit = dataCache.get(key);
  if (hit) return hit;
  const data = await req('/StandardApiAction_queryTrackDetail.action', { devIdno, begintime, endtime });
  const tracks = (data.tracks || []).map(scaleStatus);
  cacheSet(key, tracks, TTL.report);
  return tracks;
}

// ═══════════════════════════════════════════════════════════════════════════
//  FUEL
//  Field is "yl" (not "oil"/"fuel"), must divide by 100 for litres.
// ═══════════════════════════════════════════════════════════════════════════
async function getFuelLevel(devIdno) {
  const key = `fuel_${devIdno}`;
  const hit = dataCache.get(key);
  if (hit) return hit;
  const data = await req('/StandardApiAction_getDeviceStatus.action', { devIdno });
  const p    = scaleStatus(data.status?.[0] || null);
  const fuel = p ? {
    devIdno,
    fuelValue: p.fuel,
    speed:     p.speed,
    lat:       p.lat,
    lng:       p.lng,
    gpsTime:   p.gpsTime,
    online:    p.ol,
  } : null;
  if (fuel) cacheSet(key, fuel, TTL.fuel);
  return fuel;
}

async function getFuelReport(devIdno, begintime, endtime, reportType = 'summary') {
  return await req('/StandardApiAction_queryOilReport.action', { devIdno, begintime, endtime, type: reportType });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAMERAS
//  Multiple stream URL formats per CMSV6 API docs.
//  Video streaming server runs on port 6604.
// ═══════════════════════════════════════════════════════════════════════════
const VIDEO_PORT = process.env.CMSV6_VIDEO_PORT || 6604;

async function getCameraStreamUrl(devIdno, channel = 1, streamType = 'sub') {
  const session  = await getSession();
  const stream   = streamType === 'main' ? 0 : 1;
  const host     = BASE.replace(/^https?:\/\//, '');
  const ch0      = channel - 1; // docs use 0-based channel index for stream URLs

  return {
    // Web player — embeds the CMSV6 HTML5 player in an iframe
    playerUrl: `http://${host}/808gps/open/player/video.html?lang=en&devIdno=${devIdno}&channel=${channel}&stream=${stream}&jsession=${session}`,
    // HLS page — mobile-friendly HLS player page
    hlsPageUrl: `http://${host}/808gps/open/hls/index.html?lang=en&devIdno=${devIdno}&channel=${ch0}&stream=${stream}&jsession=${session}`,
    // HLS stream — direct .m3u8 for <video> tags or video.js
    hlsUrl: `http://${host}:${VIDEO_PORT}/hls/1_${devIdno}_${ch0}_${stream}.m3u8?jsession=${session}`,
    // RTSP — for VLC, ffmpeg, NVR
    rtspUrl: `rtsp://${host}:${VIDEO_PORT}/3/3?AVType=1&jsession=${session}&DevIDNO=${devIdno}&Channel=${ch0}&Stream=${stream}`,
    // RTMP — for OBS, streaming servers
    rtmpUrl: `rtmp://${host}:${VIDEO_PORT}/3/3?AVType=1&jsession=${session}&DevIDNO=${devIdno}&Channel=${ch0}&Stream=${stream}`,
    // RTMP/FLV over HTTP — for flv.js players
    flvUrl:  `http://${host}:${VIDEO_PORT}/3/3?AVType=1&jsession=${session}&DevIDNO=${devIdno}&Channel=${ch0}&Stream=${stream}`,
    // Raw params
    devIdno, channel: ch0, stream, jsession: session,
  };
}

async function getRecordedVideos(devIdno, begintime, endtime, videoType = 'all') {
  const data = await req('/StandardApiAction_queryVideoFile.action', { devIdno, begintime, endtime, videoType });
  return data.files || data.obj || [];
}

async function takeSnapshot(devIdno, channel = 1) {
  return await postReq('/StandardApiAction_cameraCapture.action', { devIdno, channel });
}

// Request real-time video recording on device (note: API typo "Vedio" must be preserved)
async function requestRealtimeVideo(devIdno, channel = '0', sec = 30, label = '') {
  return await req('/StandardApiAction_realTimeVedio.action', {
    DevIDNO: devIdno, Chn: channel, Sec: sec, Label: label,
  });
}

// Query video files stored on server for a specific day
async function getVideoFileInfo(devIdno, opts = {}) {
  const now = new Date();
  const {
    LOC = 2, CHN = -1,
    YEAR = String(now.getFullYear()),
    MON  = String(now.getMonth() + 1).padStart(2, '0'),
    DAY  = String(now.getDate()).padStart(2, '0'),
    RECTYPE = -1, BEG = 0, END = 86399,
  } = opts;
  const data = await req('/StandardApiAction_getVideoFileInfo.action', {
    DevIDNO: devIdno, LOC, CHN, YEAR, MON, DAY,
    RECTYPE, FILEATTR: 2, BEG, END,
    ARM1: 0, ARM2: 0, RES: 0, STREAM: -1, STORE: 0,
  });
  return data.files || [];
}

// Query video files across day boundaries (1078 devices only)
async function getVideoHistoryFile(devIdno, opts = {}) {
  const { LOC = 2, CHN = -1, YEAR, MON, DAY, YEARE, MONE, DAYE, RECTYPE = -1, BEG = 0, END = 86399 } = opts;
  const data = await req('/StandardApiAction_getVideoHistoryFile.action', {
    DevIDNO: devIdno, LOC, CHN, YEAR, MON, DAY,
    RECTYPE, FILEATTR: 2, BEG, END,
    ARM1: 0, ARM2: 0, RES: 0, STREAM: -1, STORE: 0,
    ...(YEARE && { YEARE, MONE, DAYE }),
  });
  return data.files || [];
}

// Capture a still picture from a camera channel
async function capturePicture(devIdno, channel = 0, resolution = 1) {
  return await req('/StandardApiAction_capturePicture.action', {
    DevIDNO: devIdno, Chn: channel, Type: 1, Resolution: resolution,
  });
}

// List segment download tasks
async function getDownloadTasklist(devIdno, opts = {}) {
  const { begintime, endtime, status, page = 1, pageSize = 20 } = opts;
  const params = { currentPage: page, pageRecords: pageSize };
  if (devIdno)        params.devIdno   = devIdno;
  if (begintime)      params.begintime = begintime;
  if (endtime)        params.endtime   = endtime;
  if (status != null) params.status    = status;
  return await req('/StandardApiAction_downloadTasklist.action', params);
}

// Delete a segment download task by tag
async function deleteDownloadTask(devIdno, taskTag) {
  return await req('/StandardApiAction_delDownloadTasklist.action', { devIdno, taskTag });
}

// ── FTP Upload (device → server) ─────────────────────────────────────────────

// Trigger FTP video upload from device to server
async function ftpUpload(devIdno, opts = {}) {
  const {
    CHN = -1, BEGYEAR, BEGMON, BEGDAY, BEGSEC = 0,
    ENDYEAR, ENDMON, ENDDAY, ENDSEC = 86399,
    ARM1 = 0, ARM2 = 0, RES = 0, STREAM = -1, STORE = 0, NETMASK = 7,
  } = opts;
  return await req('/StandardApiAction_ftpUpload.action', {
    DevIDNO: devIdno, CHN, BEGYEAR, BEGMON, BEGDAY, BEGSEC,
    ENDYEAR, ENDMON, ENDDAY, ENDSEC, ARM1, ARM2, RES, STREAM, STORE, NETMASK,
  });
}

// Query status of a specific FTP upload task
async function getFtpStatus(seq, devIdno) {
  return await req('/StandardApiAction_queryFtpStatus.action', { seq, devIdno });
}

// List FTP upload tasks for a device
async function getFtpTaskList(devIdno, opts = {}) {
  const { begintime, endtime, status, page = 1, pageSize = 20 } = opts;
  const params = { devIdno, currentPage: page, pageRecords: pageSize };
  if (begintime) params.begintime = begintime;
  if (endtime)   params.endtime   = endtime;
  if (status != null) params.status = status;
  return await req('/StandardApiAction_queryDownLoadReplayEx.action', params);
}

// Pause (0), resume (1), or cancel (2) an FTP upload task
async function controlFtpTask(seq, devIdno, taskType) {
  return await req('/StandardApiAction_controllDownLoad.action', { seq, devIdno, taskType });
}

// ── Alarm Evidence ────────────────────────────────────────────────────────────

// Get images/videos attached to a specific alarm event
async function getAlarmEvidence(devIdno, opts = {}) {
  const { begintime, alarmType, guid, toMap = 0, md5 = 0 } = opts;
  return await req('/StandardApiAction_alarmEvidence.action', {
    devIdno, begintime, alarmType, guid, toMap, md5,
  });
}

// Get security alarm photo/video evidence list
async function getSecurityEvidence(opts = {}) {
  const { vehiIdno, begintime, endtime, alarmType, mediaType, page = 1, pageSize = 20 } = opts;
  const params = { vehiIdno, begintime, endtime, alarmType, currentPage: page, pageRecords: pageSize };
  if (mediaType != null) params.mediaType = mediaType;
  return await req('/StandardApiAction_performanceReportPhotoListSafe.action', params);
}

// ── Media Query ───────────────────────────────────────────────────────────────

// Query photos stored on server
async function queryPhotos(opts = {}) {
  const { devIdno, begintime, endtime, filetype, alarmType, page = 1, pageSize = 20 } = opts;
  const params = { begintime, endtime, currentPage: page, pageRecords: pageSize };
  if (devIdno)    params.devIdno    = devIdno;
  if (filetype != null) params.filetype = filetype;
  if (alarmType)  params.alarmType  = alarmType;
  return await req('/StandardApiAction_queryPhoto.action', params);
}

// Query audio/video files stored on server
async function queryAudioOrVideo(devIdno, opts = {}) {
  const { begintime, endtime, type = 1, filetype, alarmType, page = 1, pageSize = 20 } = opts;
  const params = { devIdno, begintime, endtime, type, currentPage: page, pageRecords: pageSize };
  if (filetype != null) params.filetype  = filetype;
  if (alarmType)        params.alarmType = alarmType;
  return await req('/StandardApiAction_queryAudioOrVideo.action', params);
}

// Add a segment download task for a video file
async function addDownloadTask(devIdno, opts = {}) {
  const { fbtm, fetm, sbtm, setm, lab = '', fph, vtp = 0, len, chn, dtp = 1 } = opts;
  return await req('/StandardApiAction_addDownloadTask.action', {
    did: devIdno, fbtm, fetm, sbtm, setm, lab, fph, vtp, len, chn, dtp,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ALARMS
//  Correct endpoint: queryAlarmDetail.action (not queryAlarm.action)
//  Param is "armType" (not "alarmType"), required, comma-separated.
//  Pagination params: currentPage / pageRecords (not page / pageSize).
//  Active real-time alarms: vehicleAlarm.action
// ═══════════════════════════════════════════════════════════════════════════
const ALARM_TYPES = {
  1:'SOS', 2:'Overspeed', 3:'Fatigue', 4:'GPS Loss',
  5:'Geofence Entry', 6:'Geofence Exit', 7:'Route Deviation',
  8:'Harsh Braking', 9:'Harsh Acceleration', 10:'Sharp Turn',
  11:'Camera Blocked', 12:'Camera Disconnected', 13:'Parking',
  14:'Low Voltage', 15:'Antenna Cut', 16:'Power Cut',
  17:'Lane Departure', 18:'Forward Collision', 19:'Pedestrian',
  20:'Driver Distraction', 21:'Drowsiness', 22:'Fuel Anomaly',
};

// All documented alarm type IDs as default
const ALL_ALARM_TYPES = Object.keys(ALARM_TYPES).join(',');

async function getAlarms(opts = {}) {
  const { devIdno, begintime, endtime, alarmType, page = 1, pageSize = 50 } = opts;
  const params = {
    currentPage:  page,
    pageRecords:  pageSize,
    // armType is required — use caller value or default to all known types
    armType: alarmType || ALL_ALARM_TYPES,
  };
  if (devIdno)   params.devIdno   = devIdno;
  if (begintime) params.begintime = begintime;
  if (endtime)   params.endtime   = endtime;
  return await req('/StandardApiAction_queryAlarmDetail.action', params);
}

async function getActiveAlarms(devIdno) {
  // vehicleAlarm.action returns real-time active alarms (vehicle must be online)
  const params = {};
  if (devIdno) params.DevIDNO = devIdno;
  const data = await req('/StandardApiAction_vehicleAlarm.action', params);
  return data.alarmlist || [];
}

// ═══════════════════════════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════════════════════════
async function getMileageReport(devIdno, begintime, endtime) {
  // Correct endpoint: runMileage.action (not queryMileage.action)
  // Uses vehiIdno param (plate/devIdno), returns infos[] with mile (metres) and ttime (online seconds)
  return await req('/StandardApiAction_runMileage.action', { vehiIdno: devIdno, begintime, endtime });
}

async function getUptimeReport(devIdno, begintime, endtime) {
  // vehicleStatus.action returns latest location per vehicle
  return await req('/StandardApiAction_vehicleStatus.action', { vehiIdno: devIdno, begintime, endtime });
}

async function getDrivingBehaviour(devIdno, begintime, endtime) {
  return await req('/StandardApiAction_queryDriverBehavior.action', { devIdno, begintime, endtime });
}

// ═══════════════════════════════════════════════════════════════════════════
//  FLEET SNAPSHOT
//  queryUserVehicle has NO online/speed/location — those come from getDeviceStatus.
//  We fetch both in parallel and merge by device ID.
// ═══════════════════════════════════════════════════════════════════════════
const SPEED_LIMIT = 80; // km/h — vehicles above this appear in speeding alert

async function getFleetSnapshot() {
  const key = 'fleet_snapshot';
  const hit = dataCache.get(key);
  if (hit) return hit;

  // Fetch vehicles, live statuses, and active alarms in parallel (alarms may fail gracefully)
  const [vehicleRes, statusRes, alarmRes] = await Promise.allSettled([
    req('/StandardApiAction_queryUserVehicle.action'),
    req('/StandardApiAction_getDeviceStatus.action'),
    req('/StandardApiAction_vehicleAlarm.action'),
  ]);

  const vehicles     = vehicleRes.status  === 'fulfilled' ? (vehicleRes.value.vehicles   || []).map(normalizeVehicle) : [];
  const statuses     = statusRes.status   === 'fulfilled' ? (statusRes.value.status      || []).map(scaleStatus) : [];
  const activeAlarms = alarmRes.status    === 'fulfilled' ? (alarmRes.value.alarmlist    || []) : [];

  if (vehicleRes.status === 'rejected') logger.error('[Snapshot] Vehicles fetch failed: ' + vehicleRes.reason?.message);
  if (statusRes.status  === 'rejected') logger.error('[Snapshot] Status fetch failed: '   + statusRes.reason?.message);
  if (alarmRes.status   === 'rejected') logger.warn('[Snapshot]  Active alarms unavailable: ' + alarmRes.reason?.message);

  // Build lookup maps — dual-key: both devIdno and id for compatibility
  logger.info(`[Snapshot] vehicles=${vehicles.length}, statuses=${statuses.length}, alarms=${activeAlarms.length}`);

  const statusMap = {};
  for (const s of statuses) {
    if (s.devIdno) statusMap[s.devIdno] = s;
    if (s.id)     statusMap[s.id]      = s;
    if (s.vid)    statusMap[s.vid]     = s;  // also index by plate (vid field)
  }

  // Merge vehicle + status — match by devIdno (=dl[0].id), then by plate
  const enriched = vehicles.map(v => {
    const s = (v.devIdno ? statusMap[v.devIdno] : null)
           || (v.plate   ? statusMap[v.plate]   : null)
           || null;
    return {
      devIdno:   v.devIdno,
      plate:     v.plate,
      online:    s?.ol       ?? 0,
      speed:     s?.speed    ?? 0,
      lat:       s?.lat      ?? 0,
      lng:       s?.lng      ?? 0,
      fuel:      s?.fuel     ?? null,
      gpsTime:   s?.gpsTime  ?? null,
      accOn:     s?.accOn    ?? false,
      direction: s?.directionStr ?? null,
      mileageKm: s?.mileageKm   ?? null,
      todayKm:   s?.todayKm     ?? null,
    };
  });

  const speeders = enriched
    .filter(v => v.speed > SPEED_LIMIT)
    .sort((a, b) => b.speed - a.speed);

  const snapshot = {
    totals: {
      vehicles: enriched.length,
      online:   enriched.filter(v => v.online === 1).length,
      offline:  enriched.filter(v => v.online === 0).length,
      alarming: activeAlarms.length,
      moving:   enriched.filter(v => v.speed > 0).length,
      parked:   enriched.filter(v => v.online === 1 && v.speed === 0).length,
    },
    alerts: {
      speeding: speeders.slice(0, 10).map(v => ({
        plate: v.plate, speed: v.speed, lat: v.lat, lng: v.lng, limit: SPEED_LIMIT,
      })),
      alarming: activeAlarms.slice(0, 20).map(a => ({
        plate:   a.plate   || a.nm  || String(a.DevIDNO || a.devIdno || ''),
        devIdno: a.DevIDNO || a.devIdno || '',
      })),
      offline: enriched.filter(v => v.online === 0).map(v => ({ plate: v.plate, devIdno: v.devIdno })),
    },
    topSpeeds: speeders.slice(0, 5).map(v => ({ plate: v.plate, speed: v.speed })),
    updatedAt: new Date().toISOString(),
  };

  return cacheSet(key, snapshot, TTL.gps);
}

// ═══════════════════════════════════════════════════════════════════════════
//  GEOFENCE / ACCESS AREA
//  queryAccessAreaInfo returns vehicle entry/exit events for custom areas.
//  passType: 1 = entered, 2 = exited
// ═══════════════════════════════════════════════════════════════════════════
async function getAccessAreaInfo(vehiIdno, begintime, endtime, opts = {}) {
  const { page = 1, pageSize = 50 } = opts;
  const data = await req('/StandardApiAction_queryAccessAreaInfo.action', {
    vehiIdno,
    begintime,
    endtime,
    toMap: 1,
    currentPage:  page,
    pageRecords:  pageSize,
  });
  return data;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PARKING DETAILS
//  parkDetail returns all parking events for a vehicle in a time range.
// ═══════════════════════════════════════════════════════════════════════════
async function getParkingDetail(vehiIdno, begintime, endtime, opts = {}) {
  const { page = 1, pageSize = 50, parkTime = 60 } = opts;
  return await req('/StandardApiAction_parkDetail.action', {
    vehiIdno,
    begintime,
    endtime,
    parkTime,
    toMap: 1,
    currentPage:  page,
    pageRecords:  pageSize,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MILEAGE DETAILS (Trip summary with fuel & distance per trip)
//  getOilTrackDetail returns trip-by-trip breakdown of mileage + fuel.
//  byOil=1 → fuel volume details, others → mileage details
// ═══════════════════════════════════════════════════════════════════════════
async function getMileageDetails(vehiIdno, begintime, endtime, opts = {}) {
  const { page = 1, pageSize = 50, byOil = 0 } = opts;
  return await req('/StandardApiAction_getOilTrackDetail.action', {
    vehiIdno,
    begintime,
    endtime,
    toMap: 1,
    byOil,
    currentPage:  page,
    pageRecords:  pageSize,
  });
}

async function getDailySummary(date) {
  const begintime = `${date} 00:00:00`;
  const endtime   = `${date} 23:59:59`;
  const [vehicles, alarmResp] = await Promise.all([
    getVehicles(),
    getAlarms({ begintime, endtime, pageSize: 500 }),
  ]);
  // queryAlarmDetail response key is "alarms", alarm type field is "atp"
  const alarmList = alarmResp.alarms || [];
  const byType = {};
  alarmList.forEach(a => {
    const label = ALARM_TYPES[a.atp] || `Type ${a.atp}`;
    byType[label] = (byType[label] || 0) + 1;
  });
  return { date, totalVehicles: vehicles.length, totalAlarms: alarmList.length, alarmsByType: byType };
}

// ═══════════════════════════════════════════════════════════════════════════
//  LINKAGE RULES
// ═══════════════════════════════════════════════════════════════════════════

async function createLinkageRule(opts = {}) {
  const { name, begintime, endtime, alarmType, param, text = '' } = opts;
  return await req('/StandardApiAction_mergeRule.action', {
    name, begintime, endtime, alarmType, param, text, type: 13,
  });
}

async function getLinkageRules(opts = {}) {
  const { name, alarmType, page = 1, pageSize = 50 } = opts;
  const params = { ruleType: 13, currentPage: page, pageRecords: pageSize };
  if (name)      params.name    = name;
  if (alarmType) params.armType = alarmType;
  return await req('/StandardApiAction_loadRules.action', params);
}

async function editLinkageRule(id, opts = {}) {
  const { name, begintime, endtime, param, text = '' } = opts;
  return await req('/StandardApiAction_editRule.action', { id, name, begintime, endtime, param, text });
}

async function deleteLinkageRule(id) {
  return await req('/StandardApiAction_delRule.action', { id });
}

async function assignRuleToDevice(ruleId, devIdno) {
  return await req('/StandardApiAction_devRulePermit.action', { ruleId, devIdno });
}

async function getRuleDevices(ruleId, opts = {}) {
  const { page = 1, pageSize = 50 } = opts;
  return await req('/StandardApiAction_loadDevRuleByRuleId.action', {
    ruleId, currentPage: page, pageRecords: pageSize,
  });
}

async function deleteRuleDevice(devIdno, opts = {}) {
  return await req('/StandardApiAction_delDevRule.action', { devIdno, ...opts });
}

async function getRulesByType(ruleType, opts = {}) {
  const { page = 1, pageSize = 50 } = opts;
  return await req('/StandardApiAction_queryRuleList.action', {
    ruleType, currentPage: page, pageRecords: pageSize,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  VEHICLE CONTROL
// ═══════════════════════════════════════════════════════════════════════════

const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

/** Set GPS reporting interval (seconds). Time=0 stops GPS uploads. */
async function setGPSInterval(devIdno, time = 5) {
  return await req('/StandardApiAction_vehicleControlGPSReport.action', {
    DevIDNO: devIdno, Time: time,
  });
}

/**
 * Send a control command to a vehicle.
 * CtrlType: 1=cut oil, 2=restore oil, 3=power off, 4=power on,
 *           5=restart, 6=factory reset, 7=sleep, 8=wake, 15=clear mileage,
 *           18=clear alarm, 23=capture photo, 24=start video
 */
async function vehicleControl(devIdno, ctrlType) {
  return await req('/StandardApiAction_vehicleControlOthers.action', {
    DevIDNO: devIdno, CtrlType: ctrlType,
    Usr: USERNAME, Pwd: md5(PASSWORD),
  });
}

/**
 * Send TTS (text-to-speech) message to vehicle display/speaker.
 * Flag: 1=emergency, 4=terminal display, 8=TTS broadcast, 16=ad screen. Combinable.
 */
async function sendTTS(devIdno, text, flag = 4) {
  return await req('/StandardApiAction_vehicleTTS.action', {
    DevIDNO: devIdno, Text: text, Flag: flag,
  });
}

/**
 * Send PTZ camera control command.
 * Command: 0=left,1=right,2=up,3=down,4-7=diagonals,
 *          8=zoom out,9=zoom in,10=aperture-,11=aperture+,
 *          14=lights,16=wipers,18=auto cruise,19=stop,
 *          21=call preset,22=set preset,23=delete preset
 */
async function sendPTZControl(devIdno, channel = 0, command = 19, speed = 1, param = 0) {
  return await req('/StandardApiAction_sendPTZControl.action', {
    DevIDNO: devIdno, Chn: channel, Command: command, Speed: speed, Param: param,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

async function getDeviceInfo(devIdno) {
  const data = await req('/StandardApiAction_getLoadDeviceInfo.action', { devIdno });
  return data.devstaus?.[0] || null;
}

async function addDevice(opts = {}) {
  return await req('/StandardApiAction_addDevice.action', opts);
}

async function editDevice(devIdno, opts = {}) {
  return await req('/StandardApiAction_editDevice.action', { devIdno, ...opts });
}

async function addVehicle(opts = {}) {
  return await req('/StandardApiAction_addVehicle.action', opts);
}

async function deleteDevice(devIdno) {
  return await req('/StandardApiAction_deleteDevice.action', { devIdno });
}

async function deleteVehicle(vehiIdno, delDevice = 0) {
  return await req('/StandardApiAction_deleteVehicle.action', { vehiIdno, delDevice });
}

async function installDevice(vehiIdno, devIdno) {
  return await req('/StandardApiAction_installVehicle.action', { vehiIdno, devIdno });
}

async function uninstallDevice(vehiIdno, devIdno) {
  return await req('/StandardApiAction_uninstallDevice.action', { vehiIdno, devIdno });
}

// ═══════════════════════════════════════════════════════════════════════════
//  TRAFFIC CARD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Query traffic flow info for a device */
async function getFlowInfo(devIdno) {
  return await req('/StandardApiAction_queryTrafficFlow.action', { devIdno });
}

/** Save/update traffic flow config for a device */
async function saveFlowConfig(devIdno, opts = {}) {
  return await req('/StandardApiAction_saveTrafficFlowConfig.action', { devIdno, ...opts });
}

// ═══════════════════════════════════════════════════════════════════════════
//  AREA / MARKER MANAGEMENT  (MapMarkerAction_* prefix)
// ═══════════════════════════════════════════════════════════════════════════

async function getUserMarkers() {
  return await req('/MapMarkerAction_getUserMarker.action', {});
}

async function addMark(opts = {}) {
  return await req('/MapMarkerAction_addMark.action', opts);
}

async function editMark(opts = {}) {
  return await req('/MapMarkerAction_editMark.action', opts);
}

async function findMark(markId) {
  return await req('/MapMarkerAction_findMark.action', { markId });
}

async function deleteMark(markId) {
  return await req('/MapMarkerAction_deleteMark.action', { markId });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ORGANIZATION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Create or edit a company/organization. Pass id to edit, omit to create. */
async function mergeCompany(opts = {}) {
  return await req('/StandardApiAction_mergeCompany.action', opts);
}

/** Find companies/organizations. opts: { companyId?, companyName?, pageIndex?, pageSize? } */
async function findCompany(opts = {}) {
  return await req('/StandardApiAction_findCompany.action', { pageIndex: 1, pageSize: 50, ...opts });
}

async function deleteCompany(companyId) {
  return await req('/StandardApiAction_deleteCompany.action', { companyId });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROLE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Create or edit a user role. Pass roleId to edit. */
async function mergeUserRole(opts = {}) {
  return await req('/StandardApiAction_mergeUserRole.action', opts);
}

async function findUserRole(opts = {}) {
  return await req('/StandardApiAction_findUserRole.action', { pageIndex: 1, pageSize: 50, ...opts });
}

async function deleteUserRole(roleId) {
  return await req('/StandardApiAction_deleteUserRole.action', { roleId });
}

// ═══════════════════════════════════════════════════════════════════════════
//  USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Create or edit a user account. Pass userId to edit. */
async function mergeUserAccount(opts = {}) {
  return await req('/StandardApiAction_mergeUserAccount.action', opts);
}

async function findUserAccount(opts = {}) {
  return await req('/StandardApiAction_findUserAccount.action', { pageIndex: 1, pageSize: 50, ...opts });
}

async function deleteUserAccount(userId) {
  return await req('/StandardApiAction_deleteUserAccount.action', { userId });
}

async function getUserDeviceAuth(userId) {
  return await req('/StandardApiAction_getUserDeviceAuth.action', { userId });
}

async function setUserDeviceAuth(userId, devIdno, authType = 1) {
  return await req('/StandardApiAction_setUserDeviceAuth.action', { userId, devIdno, authType });
}

// ═══════════════════════════════════════════════════════════════════════════
//  DRIVER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Get driver info linked to a device */
async function findDriverInfoByDeviceId(devIdno) {
  return await req('/StandardApiAction_findDriverInfoByDeviceId.action', { devIdno });
}

/** Get vehicle info by device ID */
async function findVehicleInfoByDeviceId(devIdno) {
  return await req('/StandardApiAction_findVehicleInfoByDeviceId.action', { devIdno });
}

/** Get vehicle info by device JN (serial number) */
async function findVehicleInfoByDeviceJn(deviceJn) {
  return await req('/StandardApiAction_findVehicleInfoByDeviceJn.action', { deviceJn });
}

/** Query driver punch-card (check-in/check-out) records.
 *  opts: { beginDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD', pageIndex?, pageSize? }
 */
async function queryPunchCardRecord(devIdno, opts = {}) {
  return await req('/StandardApiAction_queryPunchCardRecode.action', {
    devIdno, pageIndex: 1, pageSize: 20, ...opts,
  });
}

/** Query driver identity alarm records (face/IC card mismatch).
 *  opts: { beginDate, endDate, pageIndex?, pageSize? }
 */
async function queryIdentifyAlarm(devIdno, opts = {}) {
  return await req('/StandardApiAction_queryIdentifyAlarm.action', {
    devIdno, pageIndex: 1, pageSize: 20, ...opts,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  DRIVER CRUD  (DriverAction_* prefix)
// ═══════════════════════════════════════════════════════════════════════════

/** Query driver list. opts: { dName? } */
async function queryDriverList(opts = {}) {
  return await req('/StandardApiAction_queryDriverList.action', opts);
}

/** Add or modify a driver. Pass id to modify. */
async function mergeDriver(opts = {}) {
  return await req('/DriverAction_mergeDriver.action', opts);
}

/** Load single driver by id */
async function loadDriver(id) {
  return await req('/DriverAction_loadDriver.action', { id });
}

/** Delete driver(s) by id. id can be comma-separated string for multiple. */
async function deleteDriver(id) {
  return await req('/DriverAction_deleteDriver.action', { id });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SIM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Add or modify a SIM. Pass id to modify. */
async function mergeSIMInfo(opts = {}) {
  return await req('/StandardApiAction_mergeSIMInfo.action', opts);
}

/** Find a single SIM by id */
async function findSIMInfo(id) {
  return await req('/StandardApiAction_findSIMInfo.action', { id });
}

/** Delete SIM by id */
async function deleteSIMInfo(id) {
  return await req('/StandardApiAction_deleteSIMInfo.action', { id });
}

/** Query SIM list (paged). opts: { currentPage?, pageRecords? } */
async function loadSIMInfos(opts = {}) {
  return await req('/StandardApiAction_loadSIMInfos.action', { pageRecords: 50, ...opts });
}

/** Unbind SIM from device. flag=0 by simId, flag=1 by devIdno */
async function unbindingSIM(id, flag = 0) {
  return await req('/StandardApiAction_unbindingSIM.action', { id, flag });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PASSENGER FLOW REPORTS  (PeopleAction_* prefix)
// ═══════════════════════════════════════════════════════════════════════════

/** Passenger summary report.
 *  opts: { begintime, endtime, vehiIdnos?, currentPage?, pageRecords? }
 *  Max 7-day range.
 */
async function getPassengerSummary(opts = {}) {
  return await req('/PeopleAction_peopleSummary.action', { pageRecords: 50, ...opts });
}

/** Passenger detail report (per-stop breakdown).
 *  opts: { begintime, endtime, vehiIdnos, currentPage?, pageRecords? }
 */
async function getPassengerDetail(opts = {}) {
  return await req('/PeopleAction_peopleDetail.action', { pageRecords: 50, ...opts });
}

// ═══════════════════════════════════════════════════════════════════════════
//  AREA (GEOFENCE) MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Query geofence areas. opts: { groupId?, currentPage?, pageRecords? } */
async function queryArea(opts = {}) {
  return await req('/StandardApiAction_queryArea.action', { pageRecords: 100, currentPage: 1, ...opts });
}

/**
 * Create or update a geofence area.
 * type 1 = circle  → pass lat/lng (decimal °), radius (metres)
 * type 2 = polygon → pass points array [{lat,lng}] in decimal °
 * Converts decimal ° to raw integer (×1,000,000) before sending.
 */
async function mergeArea({ areaId = 0, areaName, areaType = 1, speed = 0, lat, lng, radius, points, alertIn, alertOut, ...rest } = {}) {
  const payload = { areaId, areaName, areaType, speed, alertIn, alertOut, ...rest };
  if (areaType === 1) {
    payload.lat    = Math.round(lat * 1_000_000);
    payload.lng    = Math.round(lng * 1_000_000);
    payload.radius = radius || 500;
  } else if (areaType === 2) {
    payload.points = Array.isArray(points)
      ? points.map(p => `${Math.round(p.lat * 1_000_000)},${Math.round(p.lng * 1_000_000)}`).join(';')
      : points;
  }
  return await req('/StandardApiAction_mergeArea.action', payload);
}

/** Delete area(s). ids = number or comma-separated string */
async function deleteArea(ids) {
  return await req('/StandardApiAction_deleteArea.action', { ids: String(ids) });
}

/** Bind a vehicle to a geofence area with alert settings */
async function bindAreaToVehicle({ areaId, devIdno, alertIn = 1, alertOut = 1, speedIn = 0 } = {}) {
  return await req('/StandardApiAction_bindArea.action', { areaId, devIdno, alertIn, alertOut, speedIn });
}

/** Query vehicles bound to an area */
async function queryAreaVehicles(areaId) {
  return await req('/StandardApiAction_queryAreaVehicle.action', { areaId });
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/** Query planned routes */
async function queryRoute(opts = {}) {
  return await req('/StandardApiAction_queryRoute.action', { pageRecords: 100, currentPage: 1, ...opts });
}

/**
 * Create or update a planned route.
 * points: array of { lat, lng, radius?, minTime?, maxTime? } in decimal degrees.
 * Converts to raw integer format before sending.
 */
async function mergeRoute({ routeId = 0, routeName, points = [], ...rest } = {}) {
  const rawPoints = points.map(p => ({
    ...p,
    lat: Math.round(p.lat * 1_000_000),
    lng: Math.round(p.lng * 1_000_000),
    radius:  p.radius  || 200,
    minTime: p.minTime || 0,
    maxTime: p.maxTime || 0,
  }));
  return await req('/StandardApiAction_mergeRoute.action', { routeId, routeName, points: rawPoints, ...rest });
}

/** Delete a route */
async function deleteRoute(routeId) {
  return await req('/StandardApiAction_deleteRoute.action', { routeId });
}

/** Bind a vehicle to a route (deviation alerts) */
async function bindRoute({ routeId, devIdno, alertDeviation = 1 } = {}) {
  return await req('/StandardApiAction_bindRoute.action', { routeId, devIdno, alertDeviation });
}

// ═══════════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════════
module.exports = {
  getSession, getVehicles, getVehicle,
  getVehicleGPS, getAllGPS, getRawStatus, getGPSHistory,
  getFuelLevel, getFuelReport,
  getCameraStreamUrl, getRecordedVideos, takeSnapshot,
  requestRealtimeVideo, getVideoFileInfo, getVideoHistoryFile,
  capturePicture, getDownloadTasklist, deleteDownloadTask, addDownloadTask,
  ftpUpload, getFtpStatus, getFtpTaskList, controlFtpTask,
  getAlarmEvidence, getSecurityEvidence, queryPhotos, queryAudioOrVideo,
  getAlarms, getActiveAlarms, ALARM_TYPES,
  getMileageReport, getMileageDetails, getUptimeReport, getDrivingBehaviour,
  getParkingDetail, getAccessAreaInfo,
  getFleetSnapshot, getDailySummary,
  createLinkageRule, getLinkageRules, editLinkageRule, deleteLinkageRule,
  assignRuleToDevice, getRuleDevices, deleteRuleDevice, getRulesByType,
  setGPSInterval, vehicleControl, sendTTS, sendPTZControl,
  getDeviceInfo, addDevice, editDevice, addVehicle,
  deleteDevice, deleteVehicle, installDevice, uninstallDevice,
  getFlowInfo, saveFlowConfig,
  getUserMarkers, addMark, editMark, findMark, deleteMark,
  mergeCompany, findCompany, deleteCompany,
  mergeUserRole, findUserRole, deleteUserRole,
  mergeUserAccount, findUserAccount, deleteUserAccount, getUserDeviceAuth, setUserDeviceAuth,
  findDriverInfoByDeviceId, findVehicleInfoByDeviceId, findVehicleInfoByDeviceJn,
  queryPunchCardRecord, queryIdentifyAlarm,
  queryDriverList, mergeDriver, loadDriver, deleteDriver,
  mergeSIMInfo, findSIMInfo, deleteSIMInfo, loadSIMInfos, unbindingSIM,
  getPassengerSummary, getPassengerDetail,
  queryArea, mergeArea, deleteArea, bindAreaToVehicle, queryAreaVehicles,
  queryRoute, mergeRoute, deleteRoute, bindRoute,
};
