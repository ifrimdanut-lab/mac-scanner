/**
 * ============================================================
 * ICHC MAC Scanner
 *
 * V1.1.4
 * Instant Scan Mode
 *
 * PRIMARY:
 * Camera
 *   ↓
 * Automatic frame capture
 *   ↓
 * ngrok
 *   ↓
 * Flask
 *   ↓
 * PaddleOCR
 *
 * Verification:
 * Same MAC twice consecutively
 *
 * Manual Scan:
 * 3-frame PaddleOCR consensus
 *
 * ============================================================
 */


/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */


/**
 * IMPORTANT:
 *
 * Paste your real Google Apps Script /exec URL here.
 */
const API_URL =
  'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';


/**
 * Current PaddleOCR / ngrok endpoint
 */
const PADDLE_SERVER_URL =
  'https://reporter-visibly-number.ngrok-free.dev';


const PADDLE_HEALTH_URL =
  PADDLE_SERVER_URL + '/health';


const PADDLE_OCR_URL =
  PADDLE_SERVER_URL + '/ocr-mac';


const APP_VERSION =
  'V1.1.4';



/**
 * ============================================================
 * SERVER SETTINGS
 * ============================================================
 */

const HEALTH_TIMEOUT_MS =
  8000;


const OCR_TIMEOUT_MS =
  30000;



/**
 * ============================================================
 * INSTANT SCAN SETTINGS
 * ============================================================
 */


/**
 * Delay between completed instant OCR requests.
 *
 * Not setInterval:
 * next scan begins only after previous request finishes.
 */
const INSTANT_SCAN_DELAY_MS =
  1100;


/**
 * Delay after camera starts.
 */
const INSTANT_START_DELAY_MS =
  900;


/**
 * Same MAC must appear this many times consecutively.
 */
const INSTANT_REQUIRED_MATCHES =
  2;


/**
 * Resume scanning after successful Save.
 */
const INSTANT_RESUME_AFTER_SAVE_MS =
  700;



/**
 * ============================================================
 * MANUAL SCAN SETTINGS
 * ============================================================
 */

const MANUAL_SCAN_COUNT =
  3;


const MANUAL_REQUIRED_MATCHES =
  2;


const MANUAL_CAPTURE_INTERVAL_MS =
  300;



/**
 * ============================================================
 * GLOBAL STATE
 * ============================================================
 */

let cameraStream =
  null;


let videoDevices =
  [];


let currentDeviceId =
  null;


let currentCameraIndex =
  0;


let currentScanMode =
  'screen';


let paddleServerOnline =
  false;


let paddleLastError =
  '';


let ocrBusy =
  false;


let manualScanBusy =
  false;


let tesseractWorker =
  null;



/**
 * ============================================================
 * INSTANT SCAN STATE
 * ============================================================
 */

let instantEnabled =
  true;


let instantRunning =
  false;


let instantPaused =
  false;


let instantBusy =
  false;


let instantTimer =
  null;


let instantLastMac =
  null;


let instantMatchCount =
  0;


let instantTotalAttempts =
  0;



/**
 * ============================================================
 * RESULT STATE
 * ============================================================
 */

let currentCandidates =
  [];


let selectedCandidateMac =
  null;


let macVerification = {

  mode:
    'none',

  confirmed:
    false,

  confidence:
    '',

  votes:
    '',

  mac:
    '',

  engine:
    ''

};



/**
 * ============================================================
 * STARTUP
 * ============================================================
 */

document.addEventListener(

  'DOMContentLoaded',

  async function () {


    updateVersionUI();


    resetVerification();


    updateScanModeUI();


    updateInstantModeUI();


    handleMacInput();


    loadDashboard();


    await discoverCameras();


    await checkPaddleServer(
      false
    );


  }

);



/**
 * ============================================================
 * VERSION UI
 * ============================================================
 */

function updateVersionUI() {


  const versionBox =
    document.querySelector(
      '.version'
    );


  if (
    versionBox
  ) {


    versionBox.textContent =
      APP_VERSION;


  }


  const footer =
    document.querySelector(
      'footer'
    );


  if (
    footer
  ) {


    footer.textContent =

      'ICHC MAC Scanner • Instant PaddleOCR Engine • ' +

      APP_VERSION;


  }

}



/**
 * ============================================================
 * DELAY
 * ============================================================
 */

function sleep(
  ms
) {


  return new Promise(

    function (
      resolve
    ) {


      setTimeout(
        resolve,
        ms
      );


    }

  );

}



/**
 * ============================================================
 * RESET RESULT VERIFICATION
 * ============================================================
 */

function resetVerification() {


  macVerification = {

    mode:
      'none',

    confirmed:
      false,

    confidence:
      '',

    votes:
      '',

    mac:
      '',

    engine:
      ''

  };


  selectedCandidateMac =
    null;

}



/**
 * ============================================================
 * NGROK HEADERS
 * ============================================================
 */

function getNgrokHeaders() {


  return {

    'ngrok-skip-browser-warning':
      'true',

    'Accept':
      'application/json'

  };

}



/**
 * ============================================================
 * FETCH WITH TIMEOUT
 * ============================================================
 */

async function fetchWithTimeout(

  url,

  options,

  timeoutMs

) {


  const controller =
    new AbortController();


  const timeout =

    setTimeout(

      function () {


        controller.abort();


      },

      timeoutMs

    );


  try {


    const finalOptions =

      Object.assign(
        {},
        options || {}
      );


    finalOptions.signal =
      controller.signal;


    return await fetch(

      url,

      finalOptions

    );


  } catch (
    error
  ) {


    if (
      error.name ===
      'AbortError'
    ) {


      throw new Error(
        'Connection timeout'
      );


    }


    throw error;


  } finally {


    clearTimeout(
      timeout
    );


  }

}



/**
 * ============================================================
 * SERVER STATUS
 * ============================================================
 */

function setPaddleServerStatus(

  state,

  detail

) {


  const panel =

    document.getElementById(
      'ocrServerPanel'
    );


  const text =

    document.getElementById(
      'ocrServerText'
    );


  if (
    panel
  ) {


    panel.classList.remove(

      'serverOnline',

      'serverOffline',

      'serverChecking'

    );


    if (
      state ===
      'online'
    ) {


      panel.classList.add(
        'serverOnline'
      );


    } else if (
      state ===
      'checking'
    ) {


      panel.classList.add(
        'serverChecking'
      );


    } else {


      panel.classList.add(
        'serverOffline'
      );


    }


  }


  if (
    text
  ) {


    if (
      state ===
      'online'
    ) {


      text.textContent =

        detail ||

        'PaddleOCR ready';


    } else if (
      state ===
      'checking'
    ) {


      text.textContent =
        'Checking connection...';


    } else {


      text.textContent =

        detail ||

        'Offline';


    }


  }


  if (
    state ===
    'online'
  ) {


    setSystemStatus(

      instantEnabled

        ? 'Instant Scan ready'

        : 'PaddleOCR ready',

      true

    );


  } else if (
    state ===
    'checking'
  ) {


    setSystemStatus(

      'Checking OCR...',

      true

    );


  } else {


    setSystemStatus(

      'PaddleOCR Offline',

      false

    );


  }

}



/**
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 */

async function checkPaddleServer(

  showSuccessMessage = false

) {


  setPaddleServerStatus(

    'checking',

    'Checking connection...'

  );


  paddleLastError =
    '';


  try {


    const response =

      await fetchWithTimeout(

        PADDLE_HEALTH_URL,

        {

          method:
            'GET',

          cache:
            'no-store',

          headers:
            getNgrokHeaders()

        },

        HEALTH_TIMEOUT_MS

      );


    if (
      !response.ok
    ) {


      throw new Error(

        'HTTP ' +
        response.status

      );


    }


    const data =
      await response.json();


    if (

      !data ||

      data.success !==
      true

    ) {


      throw new Error(
        'Invalid health response'
      );


    }


    paddleServerOnline =
      true;


    paddleLastError =
      '';


    setPaddleServerStatus(

      'online',

      'PaddleOCR ready'

    );


    if (
      showSuccessMessage
    ) {


      showMessage(

        'PaddleOCR server connected.',

        'success'

      );


    }


    return true;


  } catch (
    error
  ) {


    paddleServerOnline =
      false;


    paddleLastError =

      error.message ||

      'Server unavailable';


    setPaddleServerStatus(

      'offline',

      'Offline • ' +
      paddleLastError

    );


    return false;


  }

}



/**
 * ============================================================
 * TEST SERVER
 * ============================================================
 */

async function testPaddleServer() {


  const button =
    document.getElementById(
      'testServerBtn'
    );


  if (
    button
  ) {


    button.disabled =
      true;


    button.textContent =
      '...';


  }


  const success =

    await checkPaddleServer(
      true
    );


  if (
    button
  ) {


    button.disabled =
      false;


    button.textContent =
      'TEST';


  }


  if (
    !success
  ) {


    showMessage(

      'PaddleOCR offline: ' +
      paddleLastError,

      'error'

    );


  }

}



/**
 * ============================================================
 * INSTANT MODE
 * ============================================================
 */

function setInstantMode(
  enabled
) {


  instantEnabled =
    !!enabled;


  updateInstantModeUI();


  if (
    instantEnabled
  ) {


    if (
      cameraStream &&
      !instantPaused
    ) {


      startInstantScan();


    }


  } else {


    stopInstantScan(
      false
    );


  }

}



/**
 * ============================================================
 * UPDATE INSTANT MODE UI
 * ============================================================
 */

function updateInstantModeUI() {


  const onBtn =

    document.getElementById(
      'instantOnBtn'
    );


  const offBtn =

    document.getElementById(
      'instantOffBtn'
    );


  const hint =

    document.getElementById(
      'instantHint'
    );


  if (
    onBtn
  ) {


    onBtn.classList.toggle(

      'active',

      instantEnabled

    );


  }


  if (
    offBtn
  ) {


    offBtn.classList.toggle(

      'active',

      !instantEnabled

    );


  }


  if (
    hint
  ) {


    hint.textContent =

      instantEnabled

        ? 'Camera automatically searches for a MAC Address.'

        : 'Automatic scanning disabled. Use SCAN NOW.';


  }


  if (
    !cameraStream
  ) {


    setInstantStatus(

      instantEnabled

        ? 'Instant Scan Ready'

        : 'Instant Scan Off',

      instantEnabled

        ? 'Start the camera to begin automatic scanning.'

        : 'Automatic scanning is disabled.',

      '⚡'

    );


  }

}



/**
 * ============================================================
 * INSTANT STATUS
 * ============================================================
 */

function setInstantStatus(

  title,

  text,

  icon = '⚡'

) {


  const titleEl =

    document.getElementById(
      'instantStatusTitle'
    );


  const textEl =

    document.getElementById(
      'instantStatusText'
    );


  const iconEl =

    document.getElementById(
      'instantStatusIcon'
    );


  if (
    titleEl
  ) {


    titleEl.textContent =
      title;


  }


  if (
    textEl
  ) {


    textEl.textContent =
      text;


  }


  if (
    iconEl
  ) {


    iconEl.textContent =
      icon;


  }

}



/**
 * ============================================================
 * START INSTANT SCAN
 * ============================================================
 */

function startInstantScan() {


  if (
    !instantEnabled ||
    instantPaused ||
    !cameraStream
  ) {


    return;


  }


  stopInstantTimer();


  instantRunning =
    true;


  instantLastMac =
    null;


  instantMatchCount =
    0;


  setInstantStatus(

    'Instant Scan Active',

    'Searching automatically for a MAC Address...',

    '⚡'

  );


  instantTimer =

    setTimeout(

      runInstantScanCycle,

      INSTANT_START_DELAY_MS

    );

}



/**
 * ============================================================
 * STOP INSTANT SCAN
 * ============================================================
 */

function stopInstantScan(
  paused = false
) {


  stopInstantTimer();


  instantRunning =
    false;


  instantBusy =
    false;


  instantPaused =
    paused;


  if (
    paused
  ) {


    setInstantStatus(

      'Instant Scan Paused',

      'Result detected. Save or clear it to scan the next device.',

      '✓'

    );


  } else {


    setInstantStatus(

      instantEnabled

        ? 'Instant Scan Ready'

        : 'Instant Scan Off',

      instantEnabled

        ? 'Waiting to start scanning.'

        : 'Automatic scanning disabled.',

      '⚡'

    );


  }

}



/**
 * ============================================================
 * STOP TIMER
 * ============================================================
 */

function stopInstantTimer() {


  if (
    instantTimer
  ) {


    clearTimeout(
      instantTimer
    );


    instantTimer =
      null;


  }

}



/**
 * ============================================================
 * SCHEDULE NEXT INSTANT SCAN
 * ============================================================
 */

function scheduleNextInstantScan() {


  if (

    !instantEnabled ||

    !instantRunning ||

    instantPaused ||

    !cameraStream

  ) {


    return;


  }


  stopInstantTimer();


  instantTimer =

    setTimeout(

      runInstantScanCycle,

      INSTANT_SCAN_DELAY_MS

    );

}



/**
 * ============================================================
 * INSTANT SCAN CYCLE
 * ============================================================
 */

async function runInstantScanCycle() {


  if (

    !instantEnabled ||

    !instantRunning ||

    instantPaused ||

    instantBusy ||

    !cameraStream

  ) {


    return;


  }


  const video =

    document.getElementById(
      'camera'
    );


  if (

    !video ||

    !video.videoWidth ||

    !video.videoHeight

  ) {


    scheduleNextInstantScan();


    return;


  }


  instantBusy =
    true;


  instantTotalAttempts++;


  setInstantStatus(

    'Instant Scan Active',

    'Searching... attempt ' +
    instantTotalAttempts,

    '⚡'

  );


  try {


    /**
     * Verify remote connectivity only if
     * currently marked offline.
     */

    if (
      !paddleServerOnline
    ) {


      const online =

        await checkPaddleServer(
          false
        );


      if (
        !online
      ) {


        throw new Error(
          paddleLastError ||
          'PaddleOCR server unavailable'
        );


      }


    }


    const canvas =

      captureVideoFrame(
        video
      );


    const result =

      await sendCanvasToPaddle(
        canvas
      );


    if (

      !result ||

      result.success !==
      true

    ) {


      instantLastMac =
        null;


      instantMatchCount =
        0;


      setInstantStatus(

        'Instant Scan Active',

        'No MAC detected. Keep the address inside the frame.',

        '⚡'

      );


      return;


    }


    const candidates =

      extractRemoteCandidates(
        result
      );


    if (
      candidates.length ===
      0
    ) {


      instantLastMac =
        null;


      instantMatchCount =
        0;


      setInstantStatus(

        'Instant Scan Active',

        'No MAC detected. Keep scanning...',

        '⚡'

      );


      return;


    }


    /**
     * Paddle server orders best candidate first.
     */

    const detectedMac =

      candidates[0].mac;


    if (
      detectedMac ===
      instantLastMac
    ) {


      instantMatchCount++;


    } else {


      instantLastMac =
        detectedMac;


      instantMatchCount =
        1;


    }


    setInstantStatus(

      'MAC candidate detected',

      detectedMac +
      ' • Verification ' +
      instantMatchCount +
      '/' +
      INSTANT_REQUIRED_MATCHES,

      '🔎'

    );


    /**
     * Same MAC twice consecutively.
     */

    if (

      instantMatchCount >=
      INSTANT_REQUIRED_MATCHES

    ) {


      acceptInstantMac(
        detectedMac
      );


    }


  } catch (
    error
  ) {


    console.error(

      'Instant scan error:',

      error

    );


    paddleServerOnline =
      false;


    setPaddleServerStatus(

      'offline',

      'Offline • ' +
      (
        error.message ||
        'Connection error'
      )

    );


    stopInstantScan(
      false
    );


    setInstantStatus(

      'Instant Scan Offline',

      'PaddleOCR connection failed. Use TEST after restarting the OCR server.',

      '⚠'

    );


  } finally {


    instantBusy =
      false;


    if (
      instantRunning &&
      !instantPaused
    ) {


      scheduleNextInstantScan();


    }


  }

}



/**
 * ============================================================
 * ACCEPT INSTANT MAC
 * ============================================================
 */

function acceptInstantMac(
  mac
) {


  const normalized =

    normalizeMac(
      mac
    );


  if (
    !normalized
  ) {


    return;


  }


  instantPaused =
    true;


  instantRunning =
    false;


  stopInstantTimer();


  const input =

    document.getElementById(
      'macInput'
    );


  input.value =
    normalized;


  macVerification = {

    mode:
      'instant',

    confirmed:
      true,

    confidence:
      'HIGH',

    votes:
      INSTANT_REQUIRED_MATCHES +
      ' consecutive scans',

    mac:
      normalized,

    engine:
      'PaddleOCR Instant'

  };


  updateVerifiedMacUI();


  setInstantStatus(

    'MAC VERIFIED',

    normalized +
    ' • Instant Scan paused',

    '✓'

  );


  vibrateSuccess();


  showMessage(

    'Instant Scan verified: ' +
    normalized,

    'success'

  );

}



/**
 * ============================================================
 * RESUME INSTANT AFTER SAVE
 * ============================================================
 */

function resumeInstantAfterSave() {


  if (
    !instantEnabled ||
    !cameraStream
  ) {


    return;


  }


  instantPaused =
    false;


  instantLastMac =
    null;


  instantMatchCount =
    0;


  instantTotalAttempts =
    0;


  setTimeout(

    function () {


      startInstantScan();


    },

    INSTANT_RESUME_AFTER_SAVE_MS

  );

}



/**
 * ============================================================
 * SCAN MODE
 * ============================================================
 */

function setScanMode(
  mode
) {


  if (

    mode !==
    'device' &&

    mode !==
    'screen'

  ) {


    return;


  }


  currentScanMode =
    mode;


  updateScanModeUI();

}



/**
 * ============================================================
 * SCAN MODE UI
 * ============================================================
 */

function updateScanModeUI() {


  const labelBtn =

    document.getElementById(
      'labelModeBtn'
    );


  const screenBtn =

    document.getElementById(
      'screenModeBtn'
    );


  const hint =

    document.getElementById(
      'modeHint'
    );


  const frame =

    document.getElementById(
      'scanFrame'
    );


  const scanHint =

    document.getElementById(
      'scanHint'
    );


  if (
    labelBtn
  ) {


    labelBtn.classList.toggle(

      'active',

      currentScanMode ===
      'device'

    );


  }


  if (
    screenBtn
  ) {


    screenBtn.classList.toggle(

      'active',

      currentScanMode ===
      'screen'

    );


  }


  if (
    hint
  ) {


    hint.textContent =

      currentScanMode ===
      'device'

        ? 'Optimized for printed MAC labels on devices.'

        : 'Optimized for MAC addresses displayed on screens.';


  }


  if (
    frame
  ) {


    frame.classList.remove(

      'screenFrame',

      'labelFrame'

    );


    frame.classList.add(

      currentScanMode ===
      'screen'

        ? 'screenFrame'

        : 'labelFrame'

    );


  }


  if (
    scanHint
  ) {


    scanHint.textContent =

      currentScanMode ===
      'device'

        ? 'PUT DEVICE LABEL INSIDE FRAME'

        : 'PUT MAC ADDRESS INSIDE FRAME';


  }

}



/**
 * ============================================================
 * CAMERA DISCOVERY
 * ============================================================
 */

async function discoverCameras() {


  if (

    !navigator.mediaDevices ||

    !navigator.mediaDevices.enumerateDevices

  ) {


    showMessage(

      'This browser does not support camera access.',

      'error'

    );


    return;


  }


  try {


    const devices =

      await navigator
        .mediaDevices
        .enumerateDevices();


    videoDevices =

      devices.filter(

        function (
          device
        ) {


          return (
            device.kind ===
            'videoinput'
          );


        }

      );


    populateCameraList();


  } catch (
    error
  ) {


    console.error(

      'Camera discovery error:',

      error

    );


  }

}



/**
 * ============================================================
 * CAMERA LIST
 * ============================================================
 */

function populateCameraList() {


  const select =

    document.getElementById(
      'cameraSelect'
    );


  const row =

    document.getElementById(
      'cameraSelectRow'
    );


  if (
    !select
  ) {


    return;


  }


  select.innerHTML =
    '';


  if (
    videoDevices.length ===
    0
  ) {


    if (
      row
    ) {


      row.classList.add(
        'hidden'
      );


    }


    return;


  }


  videoDevices.forEach(

    function (
      device,
      index
    ) {


      const option =

        document.createElement(
          'option'
        );


      option.value =
        device.deviceId;


      option.textContent =

        device.label ||

        (
          'Camera ' +
          (index + 1)
        );


      select.appendChild(
        option
      );


    }

  );


  if (
    row
  ) {


    row.classList.remove(
      'hidden'
    );


  }

}



/**
 * ============================================================
 * START CAMERA
 * ============================================================
 */

async function startCamera(

  requestedDeviceId = null

) {


  const video =

    document.getElementById(
      'camera'
    );


  if (
    !video
  ) {


    return;


  }


  try {


    stopCamera();


    let constraints;


    if (
      requestedDeviceId
    ) {


      constraints = {

        video: {

          deviceId: {

            exact:
              requestedDeviceId

          },

          width: {

            ideal:
              1920

          },

          height: {

            ideal:
              1080

          }

        },

        audio:
          false

      };


    } else {


      constraints = {

        video: {

          facingMode: {

            ideal:
              'environment'

          },

          width: {

            ideal:
              1920

          },

          height: {

            ideal:
              1080

          }

        },

        audio:
          false

      };


    }


    cameraStream =

      await navigator
        .mediaDevices
        .getUserMedia(
          constraints
        );


    video.srcObject =
      cameraStream;


    await video.play();


    const placeholder =

      document.getElementById(
        'cameraPlaceholder'
      );


    if (
      placeholder
    ) {


      placeholder.classList.add(
        'hidden'
      );


    }


    const scanBtn =

      document.getElementById(
        'scanBtn'
      );


    if (
      scanBtn
    ) {


      scanBtn.disabled =
        false;


    }


    const switchBtn =

      document.getElementById(
        'switchCameraBtn'
      );


    if (
      switchBtn
    ) {


      switchBtn.disabled =
        false;


    }


    const startBtn =

      document.getElementById(
        'startCameraBtn'
      );


    if (
      startBtn
    ) {


      startBtn.textContent =
        'RESTART CAMERA';


    }


    await discoverCameras();


    const activeTrack =

      cameraStream
        .getVideoTracks()[0];


    const settings =

      activeTrack
        .getSettings();


    currentDeviceId =

      settings.deviceId ||

      null;


    syncCameraSelector();


    if (
      !paddleServerOnline
    ) {


      await checkPaddleServer(
        false
      );


    }


    if (
      instantEnabled
    ) {


      instantPaused =
        false;


      startInstantScan();


    } else {


      setInstantStatus(

        'Instant Scan Off',

        'Use SCAN NOW to read the MAC Address.',

        '⚡'

      );


    }


  } catch (
    error
  ) {


    handleCameraError(
      error
    );


  }

}



/**
 * ============================================================
 * STOP CAMERA
 * ============================================================
 */

function stopCamera() {


  stopInstantScan(
    false
  );


  if (
    !cameraStream
  ) {


    return;


  }


  cameraStream

    .getTracks()

    .forEach(

      function (
        track
      ) {


        track.stop();


      }

    );


  cameraStream =
    null;

}



/**
 * ============================================================
 * CAMERA ERROR
 * ============================================================
 */

function handleCameraError(
  error
) {


  let message =
    'Camera could not be started.';


  switch (
    error.name
  ) {


    case 'NotAllowedError':

      message =
        'Camera permission was denied.';

      break;


    case 'NotFoundError':

      message =
        'No camera was detected.';

      break;


    case 'NotReadableError':

      message =
        'Camera may already be in use.';

      break;


    case 'OverconstrainedError':

      message =
        'Selected camera unavailable.';

      break;


    case 'SecurityError':

      message =
        'Camera access requires HTTPS.';

      break;


  }


  setSystemStatus(

    'Camera unavailable',

    false

  );


  showMessage(

    message,

    'error'

  );

}



/**
 * ============================================================
 * CHANGE CAMERA
 * ============================================================
 */

async function changeCamera() {


  const select =

    document.getElementById(
      'cameraSelect'
    );


  if (
    !select ||
    !select.value
  ) {


    return;


  }


  currentDeviceId =
    select.value;


  await startCamera(
    currentDeviceId
  );

}



/**
 * ============================================================
 * SYNC CAMERA
 * ============================================================
 */

function syncCameraSelector() {


  const select =

    document.getElementById(
      'cameraSelect'
    );


  if (

    select &&

    currentDeviceId

  ) {


    select.value =
      currentDeviceId;


  }

}



/**
 * ============================================================
 * SWITCH CAMERA
 * ============================================================
 */

async function switchCamera() {


  if (
    videoDevices.length <
    2
  ) {


    showMessage(

      'Only one camera available.',

      'warning'

    );


    return;


  }


  const currentIndex =

    videoDevices.findIndex(

      function (
        device
      ) {


        return (
          device.deviceId ===
          currentDeviceId
        );


      }

    );


  currentCameraIndex =

    currentIndex >=
    0

      ? currentIndex + 1

      : 0;


  if (
    currentCameraIndex >=
    videoDevices.length
  ) {


    currentCameraIndex =
      0;


  }


  await startCamera(

    videoDevices[
      currentCameraIndex
    ].deviceId

  );

}



/**
 * ============================================================
 * MANUAL SCAN
 * ============================================================
 */

async function scanMac() {


  if (
    manualScanBusy
  ) {


    return;


  }


  const video =

    document.getElementById(
      'camera'
    );


  if (

    !video ||

    !video.videoWidth ||

    !video.videoHeight

  ) {


    showMessage(

      'Camera is not ready.',

      'warning'

    );


    return;


  }


  stopInstantScan(
    true
  );


  clearCandidates();


  clearMacResult();


  manualScanBusy =
    true;


  ocrBusy =
    true;


  const scanBtn =

    document.getElementById(
      'scanBtn'
    );


  if (
    scanBtn
  ) {


    scanBtn.disabled =
      true;


  }


  try {


    const online =

      await checkPaddleServer(
        false
      );


    if (
      !online
    ) {


      throw new Error(
        paddleLastError
      );


    }


    const readings =
      [];


    for (

      let i = 0;

      i <
      MANUAL_SCAN_COUNT;

      i++

    ) {


      setOCRStatus(

        true,

        'PaddleOCR',

        'Manual verification ' +
        (i + 1) +
        '/' +
        MANUAL_SCAN_COUNT

      );


      const canvas =

        captureVideoFrame(
          video
        );


      const result =

        await sendCanvasToPaddle(
          canvas
        );


      const candidates =

        extractRemoteCandidates(
          result
        );


      readings.push({

        candidates:
          candidates

      });


      if (
        i <
        MANUAL_SCAN_COUNT - 1
      ) {


        await sleep(
          MANUAL_CAPTURE_INTERVAL_MS
        );


      }


    }


    processManualReadings(
      readings
    );


  } catch (
    error
  ) {


    paddleServerOnline =
      false;


    setPaddleServerStatus(

      'offline',

      'Offline • ' +
      (
        error.message ||
        'Server failure'
      )

    );


    showMessage(

      'PaddleOCR unavailable. Using local OCR fallback.',

      'warning'

    );


    const canvas =

      captureVideoFrame(
        video
      );


    await runLocalTesseractCanvas(
      canvas
    );


  } finally {


    manualScanBusy =
      false;


    ocrBusy =
      false;


    if (
      scanBtn &&
      cameraStream
    ) {


      scanBtn.disabled =
        false;


    }


  }

}



/**
 * ============================================================
 * MANUAL READINGS
 * ============================================================
 */

function processManualReadings(
  readings
) {


  const groups =
    {};


  readings.forEach(

    function (
      reading
    ) {


      reading.candidates.forEach(

        function (
          candidate
        ) {


          if (
            !groups[
              candidate.mac
            ]
          ) {


            groups[
              candidate.mac
            ] = {

              mac:
                candidate.mac,

              count:
                0,

              labeledCount:
                0

            };


          }


          groups[
            candidate.mac
          ].count++;


          if (
            candidate.labeled
          ) {


            groups[
              candidate.mac
            ].labeledCount++;


          }


        }

      );


    }

  );


  const candidates =

    Object.values(
      groups
    );


  candidates.sort(

    function (
      a,
      b
    ) {


      return (

        b.count -
        a.count

      );


    }

  );


  currentCandidates =
    candidates;


  if (
    candidates.length ===
    0
  ) {


    rejectMacResult(

      'No MAC Address detected.'

    );


    resumeInstantIfPossible();


    return;


  }


  const best =
    candidates[0];


  if (
    best.count >=
    MANUAL_REQUIRED_MATCHES
  ) {


    acceptRemoteMac(

      best.mac,

      best.count,

      MANUAL_SCAN_COUNT,

      best.count ===
      MANUAL_SCAN_COUNT

        ? 'HIGH'

        : 'GOOD'

    );


    showCandidateList(

      candidates,

      best.mac

    );


    return;


  }


  showCandidateList(

    candidates,

    null

  );


  setMacState(

    'waiting',

    'Select a candidate'

  );


  setOCRStatus(
    false
  );

}



/**
 * ============================================================
 * REMOTE CANDIDATES
 * ============================================================
 */

function extractRemoteCandidates(
  result
) {


  const list =
    [];


  if (
    !result
  ) {


    return list;


  }


  if (

    result.mac &&

    normalizeMac(
      result.mac
    )

  ) {


    list.push({

      mac:

        normalizeMac(
          result.mac
        ),

      labeled:

        !!result.labeled

    });


  }


  if (
    Array.isArray(
      result.candidates
    )
  ) {


    result.candidates.forEach(

      function (
        item
      ) {


        if (

          !item ||

          !item.mac

        ) {


          return;


        }


        const mac =

          normalizeMac(
            item.mac
          );


        if (
          !mac
        ) {


          return;


        }


        const exists =

          list.some(

            function (
              existing
            ) {


              return (
                existing.mac ===
                mac
              );


            }

          );


        if (
          !exists
        ) {


          list.push({

            mac:
              mac,

            labeled:

              !!item.labeled

          });


        }


      }

    );


  }


  return list;

}



/**
 * ============================================================
 * SEND CANVAS TO PADDLE
 * ============================================================
 */

async function sendCanvasToPaddle(
  canvas
) {


  const blob =

    await canvasToBlob(
      canvas
    );


  const formData =
    new FormData();


  formData.append(

    'image',

    blob,

    'mac-scan.jpg'

  );


  const response =

    await fetchWithTimeout(

      PADDLE_OCR_URL,

      {

        method:
          'POST',

        body:
          formData,

        cache:
          'no-store',

        headers: {

          'ngrok-skip-browser-warning':
            'true',

          'Accept':
            'application/json'

        }

      },

      OCR_TIMEOUT_MS

    );


  if (
    !response.ok
  ) {


    throw new Error(

      'OCR HTTP ' +
      response.status

    );


  }


  return await response.json();

}



/**
 * ============================================================
 * CANVAS BLOB
 * ============================================================
 */

function canvasToBlob(
  canvas
) {


  return new Promise(

    function (
      resolve,
      reject
    ) {


      canvas.toBlob(

        function (
          blob
        ) {


          if (
            blob
          ) {


            resolve(
              blob
            );


          } else {


            reject(

              new Error(
                'Unable to create image.'
              )

            );


          }


        },

        'image/jpeg',

        0.90

      );


    }

  );

}



/**
 * ============================================================
 * CAPTURE FRAME
 * ============================================================
 */

function captureVideoFrame(
  video
) {


  const canvas =

    document.createElement(
      'canvas'
    );


  const ctx =

    canvas.getContext(

      '2d',

      {
        willReadFrequently:
          true
      }

    );


  const sourceWidth =
    video.videoWidth;


  const sourceHeight =
    video.videoHeight;


  const cropWidthRatio =

    currentScanMode ===
    'screen'

      ? 0.94

      : 0.90;


  const cropHeightRatio =

    currentScanMode ===
    'screen'

      ? 0.58

      : 0.52;


  const cropWidth =

    Math.floor(

      sourceWidth *
      cropWidthRatio

    );


  const cropHeight =

    Math.floor(

      sourceHeight *
      cropHeightRatio

    );


  const startX =

    Math.floor(

      (
        sourceWidth -
        cropWidth
      ) / 2

    );


  const startY =

    Math.floor(

      (
        sourceHeight -
        cropHeight
      ) / 2

    );


  const scale =

    sourceWidth <
    1600

      ? 1.5

      : 1.2;


  canvas.width =

    Math.floor(

      cropWidth *
      scale

    );


  canvas.height =

    Math.floor(

      cropHeight *
      scale

    );


  ctx.drawImage(

    video,

    startX,

    startY,

    cropWidth,

    cropHeight,

    0,

    0,

    canvas.width,

    canvas.height

  );


  return canvas;

}



/**
 * ============================================================
 * PHOTO / IMAGE
 * ============================================================
 */

function scanUploadedPhoto(
  event
) {


  stopInstantScan(
    true
  );


  const file =

    event
      .target
      .files[0];


  if (
    !file
  ) {


    return;


  }


  const reader =
    new FileReader();


  reader.onload =

    function (
      e
    ) {


      const img =
        new Image();


      img.onload =

        async function () {


          const canvas =

            document.createElement(
              'canvas'
            );


          const ctx =

            canvas.getContext(

              '2d',

              {
                willReadFrequently:
                  true
              }

            );


          const maxWidth =
            2400;


          let width =
            img.width;


          let height =
            img.height;


          if (
            width >
            maxWidth
          ) {


            const ratio =

              maxWidth /
              width;


            width =
              maxWidth;


            height =

              Math.round(

                height *
                ratio

              );


          }


          canvas.width =
            width;


          canvas.height =
            height;


          ctx.drawImage(

            img,

            0,

            0,

            width,

            height

          );


          await processPhoto(
            canvas
          );


        };


      img.src =
        e.target.result;


    };


  reader.readAsDataURL(
    file
  );

}



/**
 * ============================================================
 * PROCESS PHOTO
 * ============================================================
 */

async function processPhoto(
  canvas
) {


  clearCandidates();


  clearMacResult();


  setOCRStatus(

    true,

    'PaddleOCR',

    'Processing photo...'

  );


  try {


    const online =

      await checkPaddleServer(
        false
      );


    if (
      !online
    ) {


      throw new Error(
        paddleLastError
      );


    }


    const result =

      await sendCanvasToPaddle(
        canvas
      );


    const candidates =

      extractRemoteCandidates(
        result
      );


    if (
      candidates.length ===
      0
    ) {


      rejectMacResult(

        'No MAC Address found in photo.'

      );


      return;


    }


    currentCandidates =

      candidates.map(

        function (
          item
        ) {


          return {

            mac:
              item.mac,

            count:
              1

          };


        }

      );


    if (
      candidates.length ===
      1
    ) {


      selectCandidate(
        candidates[0].mac
      );


    } else {


      showCandidateList(

        currentCandidates,

        null

      );


    }


  } catch (
    error
  ) {


    await runLocalTesseractCanvas(
      canvas
    );


  } finally {


    setOCRStatus(
      false
    );


  }

}



/**
 * ============================================================
 * CANDIDATES UI
 * ============================================================
 */

function showCandidateList(

  candidates,

  selectedMac

) {


  const section =

    document.getElementById(
      'candidateSection'
    );


  const list =

    document.getElementById(
      'candidateList'
    );


  if (
    !section ||
    !list
  ) {


    return;


  }


  section.classList.remove(
    'hidden'
  );


  list.innerHTML =
    '';


  candidates.forEach(

    function (
      candidate
    ) {


      const button =

        document.createElement(
          'button'
        );


      button.type =
        'button';


      button.className =
        'candidateBtn';


      if (
        candidate.mac ===
        selectedMac
      ) {


        button.classList.add(
          'active'
        );


      }


      button.textContent =

        candidate.mac +

        (
          candidate.count > 1

            ? ' • ' +
              candidate.count +
              'x'

            : ''
        );


      button.onclick =

        function () {


          selectCandidate(
            candidate.mac
          );


        };


      list.appendChild(
        button
      );


    }

  );

}



/**
 * ============================================================
 * CLEAR CANDIDATES
 * ============================================================
 */

function clearCandidates() {


  currentCandidates =
    [];


  selectedCandidateMac =
    null;


  const section =

    document.getElementById(
      'candidateSection'
    );


  if (
    section
  ) {


    section.classList.add(
      'hidden'
    );


  }


  const list =

    document.getElementById(
      'candidateList'
    );


  if (
    list
  ) {


    list.innerHTML =
      '';


  }


  const confirm =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirm
  ) {


    confirm.classList.add(
      'hidden'
    );


  }

}



/**
 * ============================================================
 * SELECT CANDIDATE
 * ============================================================
 */

function selectCandidate(
  mac
) {


  const normalized =

    normalizeMac(
      mac
    );


  if (
    !normalized
  ) {


    return;


  }


  selectedCandidateMac =
    normalized;


  const input =

    document.getElementById(
      'macInput'
    );


  input.value =
    normalized;


  macVerification = {

    mode:
      'candidate',

    confirmed:
      false,

    confidence:
      'VERIFY',

    votes:
      '',

    mac:
      normalized,

    engine:
      'PaddleOCR'

  };


  const confirm =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirm
  ) {


    confirm.classList.remove(
      'hidden'
    );


  }


  setMacState(

    'waiting',

    'Confirm detected MAC'

  );


  const validation =

    document.getElementById(
      'macValidation'
    );


  validation.textContent =

    'PaddleOCR candidate • Confirm before saving';


  validation.style.color =
    '#84590b';

}



/**
 * ============================================================
 * CONFIRM MAC
 * ============================================================
 */

function confirmMac() {


  const input =

    document.getElementById(
      'macInput'
    );


  const mac =

    normalizeMac(
      input.value
    );


  if (
    !mac
  ) {


    return;


  }


  stopInstantScan(
    true
  );


  macVerification = {

    mode:
      'user',

    confirmed:
      true,

    confidence:
      'USER VERIFIED',

    votes:
      '',

    mac:
      mac,

    engine:
      'PaddleOCR'

  };


  updateVerifiedMacUI();


  const confirm =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirm
  ) {


    confirm.classList.add(
      'hidden'
    );


  }

}



/**
 * ============================================================
 * ACCEPT REMOTE MANUAL MAC
 * ============================================================
 */

function acceptRemoteMac(

  mac,

  votes,

  total,

  confidence

) {


  stopInstantScan(
    true
  );


  const input =

    document.getElementById(
      'macInput'
    );


  input.value =
    mac;


  macVerification = {

    mode:
      'remote',

    confirmed:
      true,

    confidence:
      confidence,

    votes:

      votes +
      '/' +
      total,

    mac:
      mac,

    engine:
      'PaddleOCR'

  };


  updateVerifiedMacUI();


  setOCRStatus(
    false
  );


  setInstantStatus(

    'MAC VERIFIED',

    mac +
    ' • Ready to save',

    '✓'

  );


  vibrateSuccess();

}



/**
 * ============================================================
 * LOCAL TESSERACT FALLBACK
 * ============================================================
 */

async function getTesseractWorker() {


  if (
    tesseractWorker
  ) {


    return tesseractWorker;


  }


  if (
    typeof Tesseract ===
    'undefined'
  ) {


    throw new Error(
      'Tesseract.js not loaded.'
    );


  }


  tesseractWorker =

    await Tesseract.createWorker(
      'eng'
    );


  return tesseractWorker;

}



/**
 * ============================================================
 * LOCAL OCR
 * ============================================================
 */

async function runLocalTesseractCanvas(
  canvas
) {


  setOCRStatus(

    true,

    'Local OCR fallback',

    'Reading image...'

  );


  const worker =

    await getTesseractWorker();


  const result =

    await worker.recognize(
      canvas
    );


  const text =

    result.data.text ||
    '';


  const mac =

    extractStrictLocalMac(
      text
    );


  if (
    !mac
  ) {


    rejectMacResult(

      'No reliable MAC Address detected.'

    );


    return;


  }


  const input =

    document.getElementById(
      'macInput'
    );


  input.value =
    mac;


  macVerification = {

    mode:
      'local',

    confirmed:
      false,

    confidence:
      'VERIFY',

    votes:
      '',

    mac:
      mac,

    engine:
      'Local OCR'

  };


  const confirm =

    document.getElementById(
      'confirmBtn'
    );


  confirm.classList.remove(
    'hidden'
  );


  setMacState(

    'waiting',

    'Local OCR result'

  );


  document
    .getElementById(
      'macValidation'
    )
    .textContent =
    'Local OCR • Confirm before saving';


  setOCRStatus(
    false
  );

}



/**
 * ============================================================
 * STRICT LOCAL MAC
 * ============================================================
 */

function extractStrictLocalMac(
  text
) {


  const upper =

    String(
      text || ''
    )
      .toUpperCase();


  const patterns = [

    /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g,

    /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g,

    /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g

  ];


  for (
    const pattern
    of patterns
  ) {


    const matches =

      upper.match(
        pattern
      );


    if (
      matches &&
      matches.length
    ) {


      return normalizeMac(
        matches[0]
      );


    }


  }


  return null;

}



/**
 * ============================================================
 * CLEAR RESULT
 * ============================================================
 */

function clearMacResult() {


  resetVerification();


  const input =

    document.getElementById(
      'macInput'
    );


  if (
    input
  ) {


    input.value =
      '';


  }


  const validation =

    document.getElementById(
      'macValidation'
    );


  if (
    validation
  ) {


    validation.textContent =
      '';


  }


  const save =

    document.getElementById(
      'saveBtn'
    );


  if (
    save
  ) {


    save.disabled =
      true;


  }


  setMacState(

    'waiting',

    'Waiting for scan'

  );

}



/**
 * ============================================================
 * REJECT RESULT
 * ============================================================
 */

function rejectMacResult(
  message
) {


  clearMacResult();


  setMacState(

    'invalid',

    'MAC not verified'

  );


  const validation =

    document.getElementById(
      'macValidation'
    );


  validation.textContent =

    'No verified MAC Address';


  validation.style.color =
    '#d63b3b';


  setOCRStatus(
    false
  );


  showMessage(

    message,

    'warning'

  );

}



/**
 * ============================================================
 * NORMALIZE MAC
 * ============================================================
 */

function normalizeMac(
  value
) {


  if (
    !value
  ) {


    return null;


  }


  const clean =

    String(value)

      .toUpperCase()

      .replace(

        /[^0-9A-F]/g,

        ''

      );


  if (
    !/^[0-9A-F]{12}$/
      .test(
        clean
      )
  ) {


    return null;


  }


  return clean

    .match(
      /.{2}/g
    )

    .join(
      ':'
    );

}



/**
 * ============================================================
 * MANUAL MAC INPUT
 * ============================================================
 */

function handleMacInput() {


  const input =

    document.getElementById(
      'macInput'
    );


  if (
    !input
  ) {


    return;


  }


  let raw =

    input.value

      .toUpperCase()

      .replace(

        /[^0-9A-F]/g,

        ''

      );


  raw =
    raw.substring(
      0,
      12
    );


  const groups =
    [];


  for (

    let i = 0;

    i < raw.length;

    i += 2

  ) {


    groups.push(

      raw.substring(
        i,
        i + 2
      )

    );


  }


  input.value =

    groups.join(
      ':'
    );


  if (
    normalizeMac(
      input.value
    )
  ) {


    stopInstantScan(
      true
    );


    macVerification = {

      mode:
        'manual',

      confirmed:
        false,

      confidence:
        'MANUAL',

      votes:
        '',

      mac:

        normalizeMac(
          input.value
        ),

      engine:
        'Manual'

    };


    const confirm =

      document.getElementById(
        'confirmBtn'
      );


    confirm.classList.remove(
      'hidden'
    );


  }


  validateMacUI();

}



/**
 * ============================================================
 * VERIFIED UI
 * ============================================================
 */

function updateVerifiedMacUI() {


  const input =

    document.getElementById(
      'macInput'
    );


  const mac =

    normalizeMac(
      input.value
    );


  if (
    !mac
  ) {


    return;


  }


  input.value =
    mac;


  setMacState(

    'valid',

    'Verified MAC detected'

  );


  const validation =

    document.getElementById(
      'macValidation'
    );


  validation.textContent =

    macVerification.engine +

    ' • Confidence: ' +

    macVerification.confidence +

    (
      macVerification.votes

        ? ' • Confirmed: ' +
          macVerification.votes

        : ''
    );


  validation.style.color =
    '#16864b';


  document
    .getElementById(
      'saveBtn'
    )
    .disabled =
    false;

}



/**
 * ============================================================
 * VALIDATE MAC
 * ============================================================
 */

function validateMacUI() {


  const input =

    document.getElementById(
      'macInput'
    );


  const mac =

    normalizeMac(
      input.value
    );


  const save =

    document.getElementById(
      'saveBtn'
    );


  if (
    !mac
  ) {


    save.disabled =
      true;


    return false;


  }


  if (
    macVerification.confirmed
  ) {


    save.disabled =
      false;


    return true;


  }


  save.disabled =
    true;


  return false;

}



/**
 * ============================================================
 * SAVE & NEXT
 * ============================================================
 */

function saveAndNext() {


  if (
    !macVerification.confirmed
  ) {


    showMessage(

      'Confirm the MAC Address before saving.',

      'warning'

    );


    return;


  }


  const mac =

    normalizeMac(

      document
        .getElementById(
          'macInput'
        )
        .value

    );


  if (
    !mac
  ) {


    return;


  }


  const button =

    document.getElementById(
      'saveBtn'
    );


  button.disabled =
    true;


  button.textContent =
    'SAVING...';


  apiRequest(

    {

      api:
        'v11',

      action:
        'saveMac',

      mac:
        mac,

      device:

        document
          .getElementById(
            'deviceType'
          )
          .value,

      location:

        document
          .getElementById(
            'location'
          )
          .value,

      note:

        document
          .getElementById(
            'note'
          )
          .value

    },

    function (
      result
    ) {


      button.textContent =
        'SAVE & SCAN NEXT';


      if (
        result.success
      ) {


        document
          .getElementById(
            'deviceCount'
          )
          .textContent =
          result.count;


        document
          .getElementById(
            'macInput'
          )
          .value =
          '';


        document
          .getElementById(
            'note'
          )
          .value =
          '';


        clearCandidates();


        clearMacResult();


        showMessage(

          'Saved: ' +
          result.mac,

          'success'

        );


        loadDashboard();


        resumeInstantAfterSave();


      } else {


        button.disabled =
          false;


        showMessage(

          result.message ||

          'Save failed.',

          result.type ===
          'duplicate'

            ? 'warning'

            : 'error'

        );


      }


    },

    function () {


      button.textContent =
        'SAVE & SCAN NEXT';


      button.disabled =
        false;


    }

  );

}



/**
 * ============================================================
 * RESUME HELPER
 * ============================================================
 */

function resumeInstantIfPossible() {


  if (
    instantEnabled &&
    cameraStream
  ) {


    instantPaused =
      false;


    startInstantScan();


  }

}



/**
 * ============================================================
 * DASHBOARD
 * ============================================================
 */

function loadDashboard() {


  apiRequest(

    {

      api:
        'v11',

      action:
        'dashboard'

    },

    function (
      data
    ) {


      if (
        !data.success
      ) {


        return;


      }


      document
        .getElementById(
          'deviceCount'
        )
        .textContent =

        data.count ||
        0;


      renderRecent(

        data.recent ||
        []

      );


    }

  );

}



/**
 * ============================================================
 * APPS SCRIPT API
 * ============================================================
 */

function apiRequest(

  parameters,

  onSuccess,

  onError

) {


  if (
    API_URL.includes(
      'PASTE_YOUR'
    )
  ) {


    if (
      parameters.action !==
      'dashboard'
    ) {


      showMessage(

        'Google Sheets API URL is not configured.',

        'error'

      );


    }


    if (
      onError
    ) {


      onError();


    }


    return;


  }


  const callbackName =

    '__macCallback_' +

    Date.now() +

    '_' +

    Math.floor(

      Math.random() *
      100000

    );


  const script =

    document.createElement(
      'script'
    );


  let done =
    false;


  const timeout =

    setTimeout(

      function () {


        if (
          done
        ) {


          return;


        }


        done =
          true;


        cleanup();


        if (
          onError
        ) {


          onError();


        }


      },

      15000

    );


  function cleanup() {


    clearTimeout(
      timeout
    );


    delete window[
      callbackName
    ];


    if (
      script.parentNode
    ) {


      script.parentNode
        .removeChild(
          script
        );


    }

  }


  window[
    callbackName
  ] =

    function (
      data
    ) {


      if (
        done
      ) {


        return;


      }


      done =
        true;


      cleanup();


      if (
        onSuccess
      ) {


        onSuccess(
          data
        );


      }


    };


  parameters.callback =
    callbackName;


  script.src =

    API_URL +

    '?' +

    new URLSearchParams(
      parameters
    ).toString();


  script.onerror =

    function () {


      if (
        done
      ) {


        return;


      }


      done =
        true;


      cleanup();


      if (
        onError
      ) {


        onError();


      }


    };


  document.body
    .appendChild(
      script
    );

}



/**
 * ============================================================
 * RECENT
 * ============================================================
 */

function renderRecent(
  items
) {


  const container =

    document.getElementById(
      'recentList'
    );


  if (
    !container
  ) {


    return;


  }


  if (
    !items ||
    items.length ===
    0
  ) {


    container.innerHTML =

      '<div class="emptyState">' +
      'No devices registered yet.' +
      '</div>';


    return;


  }


  container.innerHTML =

    items.map(

      function (
        item
      ) {


        return `

          <div class="recentItem">

            <div class="recentTop">

              <div class="recentMac">
                ${escapeHtml(item.mac)}
              </div>

              <div class="recentDevice">
                ${escapeHtml(item.device || 'Device')}
              </div>

            </div>

            <div class="recentBottom">

              <span>
                ${escapeHtml(item.location || 'No location')}
              </span>

              <span>
                ${escapeHtml(item.timestamp)}
              </span>

            </div>

          </div>

        `;


      }

    ).join(
      ''
    );

}



/**
 * ============================================================
 * OCR STATUS
 * ============================================================
 */

function setOCRStatus(

  visible,

  title,

  progress

) {


  const box =

    document.getElementById(
      'ocrStatus'
    );


  if (
    !box
  ) {


    return;


  }


  if (
    !visible
  ) {


    box.classList.add(
      'hidden'
    );


    return;


  }


  box.classList.remove(
    'hidden'
  );


  document
    .getElementById(
      'ocrTitle'
    )
    .textContent =
    title ||
    'Reading...';


  document
    .getElementById(
      'ocrProgress'
    )
    .textContent =
    progress ||
    '';

}



/**
 * ============================================================
 * MAC STATE
 * ============================================================
 */

function setMacState(

  type,

  text

) {


  const state =

    document.getElementById(
      'macState'
    );


  if (
    !state
  ) {


    return;


  }


  state.className =

    'macState ' +
    type;


  state.textContent =
    text;

}



/**
 * ============================================================
 * SYSTEM STATUS
 * ============================================================
 */

function setSystemStatus(

  text,

  ready

) {


  const status =

    document.getElementById(
      'systemStatus'
    );


  if (
    !status
  ) {


    return;


  }


  status.innerHTML =

    '<span class="statusDot"></span>' +

    escapeHtml(
      text
    );


  const dot =

    status.querySelector(
      '.statusDot'
    );


  if (
    dot
  ) {


    dot.style.background =

      ready

        ? '#4cea92'

        : '#ff7474';


  }

}



/**
 * ============================================================
 * MESSAGE
 * ============================================================
 */

function showMessage(

  message,

  type

) {


  const box =

    document.getElementById(
      'messageBox'
    );


  if (
    !box
  ) {


    return;


  }


  box.className =
    'messageBox';


  if (
    type ===
    'success'
  ) {


    box.classList.add(
      'messageSuccess'
    );


  } else if (
    type ===
    'warning'
  ) {


    box.classList.add(
      'messageWarning'
    );


  } else {


    box.classList.add(
      'messageError'
    );


  }


  box.textContent =
    message;


  box.classList.remove(
    'hidden'
  );


  setTimeout(

    function () {


      box.classList.add(
        'hidden'
      );


    },

    6000

  );

}



/**
 * ============================================================
 * HAPTIC
 * ============================================================
 */

function vibrateSuccess() {


  if (
    navigator.vibrate
  ) {


    navigator.vibrate(

      [
        70,
        40,
        70
      ]

    );


  }

}



/**
 * ============================================================
 * HTML ESCAPE
 * ============================================================
 */

function escapeHtml(
  value
) {


  if (

    value === null ||

    value === undefined

  ) {


    return '';


  }


  return String(
    value
  )

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );

}
