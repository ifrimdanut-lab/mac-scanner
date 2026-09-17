/**
 * ============================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.3.2
 * PaddleOCR Remote Engine
 *
 * COMPATIBLE WITH:
 * index.html V1.1.3.1
 *
 * Primary OCR:
 * GitHub Pages
 *      ↓
 * ngrok HTTPS
 *      ↓
 * Flask API
 *      ↓
 * PaddleOCR
 *
 * Fallback:
 * Tesseract.js only after real remote failure
 *
 * Database:
 * Google Apps Script + Google Sheets
 * ============================================================
 */


/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */


/**
 * IMPORTANT
 *
 * Replace this with your actual Apps Script /exec URL.
 */
const API_URL =
  'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';


/**
 * ngrok tunnel
 */
const PADDLE_SERVER_URL =
  'https://reporter-visibly-number.ngrok-free.dev';


const PADDLE_HEALTH_URL =
  PADDLE_SERVER_URL + '/health';


const PADDLE_OCR_URL =
  PADDLE_SERVER_URL + '/ocr-mac';


const APP_VERSION =
  'V1.1.3.2';


/**
 * Connection timeout
 */
const HEALTH_TIMEOUT_MS =
  8000;


const OCR_TIMEOUT_MS =
  30000;


/**
 * Remote scan consensus
 */
const REMOTE_SCAN_COUNT =
  3;


const REMOTE_REQUIRED_MATCHES =
  2;


const REMOTE_CAPTURE_INTERVAL_MS =
  300;


const REMOTE_INITIAL_DELAY_MS =
  350;



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


let ocrBusy =
  false;


let tesseractWorker =
  null;


let paddleServerOnline =
  false;


let paddleLastError =
  '';


let currentScanMode =
  'screen';


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


    bindInterface();


    handleMacInput();


    updateScanModeUI();


    loadDashboard();


    await discoverCameras();


    checkPaddleServer(
      false
    );


  }

);



/**
 * ============================================================
 * BIND INTERFACE
 * ============================================================
 */

function bindInterface() {


  const testBtn =
    document.getElementById(
      'testServerBtn'
    );


  if (
    testBtn
  ) {


    testBtn.onclick =
      testPaddleServer;


  }

}



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

      'ICHC MAC Scanner • Local PaddleOCR Engine • ' +

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
 * RESET VERIFICATION
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
 * SERVER STATUS UI
 *
 * Uses exactly:
 *
 * ocrServerPanel
 * ocrServerText
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

      'PaddleOCR ready',

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

  showMessageOnSuccess = false

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


    const contentType =

      response.headers.get(
        'content-type'
      ) || '';


    if (
      !contentType.includes(
        'application/json'
      )
    ) {


      throw new Error(
        'Invalid server response'
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
        'Health check failed'
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
      showMessageOnSuccess
    ) {


      showMessage(

        'PaddleOCR server connected successfully.',

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

      'Connection failed';


    setPaddleServerStatus(

      'offline',

      'Offline • ' +
      paddleLastError

    );


    console.error(

      'OCR server health check failed:',

      error

    );


    return false;


  }

}



/**
 * ============================================================
 * TEST BUTTON
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

      'PaddleOCR server is offline: ' +
      paddleLastError,

      'error'

    );


  }

}



/**
 * ============================================================
 * SCAN MODE
 *
 * device
 * screen
 * ============================================================
 */

function setScanMode(
  mode
) {


  if (

    mode !==
    'device'

    &&

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


    if (
      currentScanMode ===
      'device'
    ) {


      hint.textContent =

        'Optimized for printed MAC labels on devices.';


    } else {


      hint.textContent =

        'Optimized for MAC addresses displayed on screens.';


    }


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


    const startButton =

      document.getElementById(
        'startCameraBtn'
      );


    if (
      startButton
    ) {


      startButton.textContent =
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
      paddleServerOnline
    ) {


      setSystemStatus(

        'PaddleOCR ready',

        true

      );


    } else {


      setSystemStatus(

        'Camera ready • OCR Offline',

        false

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
        'Selected camera is unavailable.';

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
 * SYNC CAMERA SELECTOR
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
 * MAIN SCAN
 * ============================================================
 */

async function scanMac() {


  if (
    ocrBusy
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


  resetVerification();


  clearCandidates();


  clearMacResult();


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


    const remoteResult =

      await attemptRemotePaddleScan(
        video
      );


    if (
      remoteResult.status ===
      'completed'
    ) {


      if (
        remoteResult.detected
      ) {


        processRemoteReadings(
          remoteResult.readings
        );


      } else {


        rejectMacResult(

          'PaddleOCR processed the image, but no MAC Address was detected.'

        );


      }


      return;


    }


    /**
     * Real remote failure only.
     */

    setPaddleServerStatus(

      'offline',

      'Offline • ' +
      remoteResult.error

    );


    showMessage(

      'PaddleOCR server unavailable. Using local OCR fallback.',

      'warning'

    );


    await runLocalTesseractFallback(
      video
    );


  } catch (
    error
  ) {


    console.error(
      error
    );


    rejectMacResult(

      'Unexpected OCR error.'

    );


  } finally {


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
 * REMOTE SCAN
 * ============================================================
 */

async function attemptRemotePaddleScan(
  video
) {


  setOCRStatus(

    true,

    'PaddleOCR',

    'Connecting to OCR server...'

  );


  const online =

    await checkPaddleServer(
      false
    );


  if (
    !online
  ) {


    return {

      status:
        'failed',

      detected:
        false,

      readings:
        [],

      error:

        paddleLastError ||

        'Server unavailable'

    };


  }


  await sleep(
    REMOTE_INITIAL_DELAY_MS
  );


  const readings =
    [];


  let successfulRequests =
    0;


  let lastError =
    '';


  for (

    let i = 0;

    i <
    REMOTE_SCAN_COUNT;

    i++

  ) {


    setOCRStatus(

      true,

      'PaddleOCR',

      'Remote scan ' +
      (i + 1) +
      ' of ' +
      REMOTE_SCAN_COUNT

    );


    const canvas =

      captureVideoFrame(
        video
      );


    try {


      const result =

        await sendCanvasToPaddle(
          canvas
        );


      successfulRequests++;


      if (

        result &&

        result.success ===
        true

      ) {


        const candidates =

          extractRemoteCandidates(
            result
          );


        readings.push({

          candidates:
            candidates,

          raw:
            result

        });


      }


    } catch (
      error
    ) {


      lastError =

        error.message ||

        'OCR request failed';


    }


    if (
      i <
      REMOTE_SCAN_COUNT - 1
    ) {


      await sleep(
        REMOTE_CAPTURE_INTERVAL_MS
      );


    }


  }


  if (
    successfulRequests >
    0
  ) {


    paddleServerOnline =
      true;


    setPaddleServerStatus(

      'online',

      'PaddleOCR ready'

    );


    const anyCandidate =

      readings.some(

        function (
          reading
        ) {


          return (
            reading.candidates.length >
            0
          );


        }

      );


    return {

      status:
        'completed',

      detected:
        anyCandidate,

      readings:
        readings,

      error:
        ''

    };


  }


  paddleServerOnline =
    false;


  return {

    status:
      'failed',

    detected:
      false,

    readings:
      [],

    error:

      lastError ||

      'All OCR requests failed'

  };

}



/**
 * ============================================================
 * EXTRACT REMOTE CANDIDATES
 * ============================================================
 */

function extractRemoteCandidates(
  result
) {


  const list =
    [];


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

        !!result.labeled,

      sourceLine:

        result.source_line ||
        ''

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

          item &&

          item.mac &&

          normalizeMac(
            item.mac
          )

        ) {


          const mac =

            normalizeMac(
              item.mac
            );


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

                !!item.labeled,

              sourceLine:

                item.line ||
                ''

            });


          }


        }


      }

    );


  }


  return list;

}



/**
 * ============================================================
 * PROCESS REMOTE READINGS
 *
 * Builds aggregate candidate list.
 * ============================================================
 */

function processRemoteReadings(
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
                0,

              lines:
                []

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


          if (
            candidate.sourceLine
          ) {


            groups[
              candidate.mac
            ]
              .lines
              .push(
                candidate.sourceLine
              );


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


      if (
        b.count !==
        a.count
      ) {


        return (
          b.count -
          a.count
        );


      }


      return (

        b.labeledCount -
        a.labeledCount

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

      'No MAC candidates were detected.'

    );


    return;


  }


  /**
   * Auto-confirm if consensus is strong.
   */

  const best =
    candidates[0];


  if (

    best.count >=
    REMOTE_REQUIRED_MATCHES

  ) {


    const confidence =

      best.count ===
      REMOTE_SCAN_COUNT

        ? 'HIGH'

        : 'GOOD';


    acceptRemoteMac(

      best.mac,

      best.count,

      REMOTE_SCAN_COUNT,

      confidence

    );


    showCandidateList(
      candidates,
      best.mac
    );


    return;


  }


  /**
   * No strong consensus:
   * let user select manually.
   */

  showCandidateList(
    candidates,
    null
  );


  setOCRStatus(
    false
  );


  setMacState(

    'waiting',

    'Select a candidate'

  );


  showMessage(

    'Multiple OCR candidates found. Select the correct MAC and confirm it.',

    'warning'

  );

}



/**
 * ============================================================
 * SHOW CANDIDATES
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


      let label =
        candidate.mac;


      if (
        candidate.count >
        1
      ) {


        label +=

          ' • ' +
          candidate.count +
          '/' +
          REMOTE_SCAN_COUNT;


      }


      button.textContent =
        label;


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


  const list =

    document.getElementById(
      'candidateList'
    );


  if (
    section
  ) {


    section.classList.add(
      'hidden'
    );


  }


  if (
    list
  ) {


    list.innerHTML =
      '';


  }


  const confirmBtn =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirmBtn
  ) {


    confirmBtn.classList.add(
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


  const confirmBtn =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirmBtn
  ) {


    confirmBtn.classList.remove(
      'hidden'
    );


  }


  showCandidateList(

    currentCandidates,

    normalized

  );


  setMacState(

    'waiting',

    'Candidate selected'

  );


  const validation =

    document.getElementById(
      'macValidation'
    );


  if (
    validation
  ) {


    validation.textContent =

      'PaddleOCR candidate • Confirm before saving';


    validation.style.color =
      '#84590b';


  }


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  if (
    saveBtn
  ) {


    saveBtn.disabled =
      true;


  }

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


    showMessage(

      'Invalid MAC Address.',

      'error'

    );


    return;


  }


  macVerification = {

    mode:
      'confirmed-manual',

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


  const confirmBtn =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirmBtn
  ) {


    confirmBtn.classList.add(
      'hidden'
    );


  }


  showMessage(

    'MAC Address confirmed.',

    'success'

  );

}



/**
 * ============================================================
 * ACCEPT REMOTE MAC
 * ============================================================
 */

function acceptRemoteMac(

  mac,

  votes,

  total,

  confidence

) {


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
      ' / ' +
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


  vibrateSuccess();


  showMessage(

    'PaddleOCR confirmed: ' +
    mac +
    ' • ' +
    votes +
    '/' +
    total,

    'success'

  );

}



/**
 * ============================================================
 * SEND IMAGE TO PADDLE
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


  const contentType =

    response.headers.get(
      'content-type'
    ) || '';


  if (
    !contentType.includes(
      'application/json'
    )
  ) {


    throw new Error(
      'OCR server returned invalid response'
    );


  }


  return await response.json();

}



/**
 * ============================================================
 * CANVAS TO BLOB
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

        0.94

      );


    }

  );

}



/**
 * ============================================================
 * CAPTURE CAMERA FRAME
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


  let cropWidthRatio;


  let cropHeightRatio;


  if (
    currentScanMode ===
    'screen'
  ) {


    cropWidthRatio =
      0.94;


    cropHeightRatio =
      0.62;


  } else {


    cropWidthRatio =
      0.90;


    cropHeightRatio =
      0.55;


  }


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

      ? 1.6

      : 1.25;


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


          await scanPhotoRemoteFirst(
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
 * PHOTO OCR
 * ============================================================
 */

async function scanPhotoRemoteFirst(
  canvas
) {


  if (
    ocrBusy
  ) {


    return;


  }


  ocrBusy =
    true;


  resetVerification();


  clearCandidates();


  clearMacResult();


  setOCRStatus(

    true,

    'PaddleOCR',

    'Uploading image...'

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

        paddleLastError ||

        'OCR server offline'

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

        'PaddleOCR processed the image, but no MAC Address was found.'

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
              1,

            labeledCount:

              item.labeled

                ? 1

                : 0,

            lines:

              item.sourceLine

                ? [
                    item.sourceLine
                  ]

                : []

          };


        }

      );


    if (
      currentCandidates.length ===
      1
    ) {


      const best =
        currentCandidates[0];


      acceptRemoteMac(

        best.mac,

        1,

        1,

        best.labeledCount

          ? 'HIGH'

          : 'GOOD'

      );


      showCandidateList(

        currentCandidates,

        best.mac

      );


    } else {


      showCandidateList(

        currentCandidates,

        null

      );


      setMacState(

        'waiting',

        'Select a candidate'

      );


      showMessage(

        'Multiple MAC candidates found. Select the correct one.',

        'warning'

      );


    }


  } catch (
    error
  ) {


    paddleServerOnline =
      false;


    paddleLastError =

      error.message ||

      'Remote OCR failure';


    setPaddleServerStatus(

      'offline',

      'Offline • ' +
      paddleLastError

    );


    showMessage(

      'PaddleOCR unavailable. Using local OCR fallback.',

      'warning'

    );


    await runLocalTesseractCanvas(
      canvas
    );


  } finally {


    ocrBusy =
      false;


  }

}



/**
 * ============================================================
 * TESSERACT FALLBACK
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

      'Tesseract.js is not loaded.'

    );


  }


  setOCRStatus(

    true,

    'Local OCR',

    'Loading fallback engine...'

  );


  tesseractWorker =

    await Tesseract.createWorker(

      'eng',

      1,

      {

        logger:

          function (
            message
          ) {


            if (

              message.status &&

              message.progress !==
              undefined

            ) {


              setOCRStatus(

                true,

                'Local OCR',

                message.status +
                ' ' +
                Math.round(

                  message.progress *
                  100

                ) +
                '%'

              );


            }


          }

      }

    );


  return tesseractWorker;

}



/**
 * ============================================================
 * LOCAL FALLBACK CAMERA
 * ============================================================
 */

async function runLocalTesseractFallback(
  video
) {


  const canvas =

    captureVideoFrame(
      video
    );


  await runLocalTesseractCanvas(
    canvas
  );

}



/**
 * ============================================================
 * LOCAL FALLBACK CANVAS
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

    result &&
    result.data

      ? result.data.text || ''

      : '';


  const mac =

    extractStrictLocalMac(
      text
    );


  if (
    mac
  ) {


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
        'Tesseract'

    };


    setMacState(

      'waiting',

      'Local OCR result'

    );


    const validation =

      document.getElementById(
        'macValidation'
      );


    validation.textContent =

      'Local OCR result • Confirm before saving';


    validation.style.color =
      '#84590b';


    const confirmBtn =

      document.getElementById(
        'confirmBtn'
      );


    confirmBtn.classList.remove(
      'hidden'
    );


    setOCRStatus(
      false
    );


  } else {


    rejectMacResult(

      'Local OCR could not detect a reliable MAC Address.'

    );


  }

}



/**
 * ============================================================
 * STRICT LOCAL MAC EXTRACTION
 * ============================================================
 */

function extractStrictLocalMac(
  text
) {


  if (
    !text
  ) {


    return null;


  }


  const upper =

    String(text)
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
 * CLEAR MAC RESULT
 * ============================================================
 */

function clearMacResult() {


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


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  if (
    saveBtn
  ) {


    saveBtn.disabled =
      true;


  }


  const confirmBtn =

    document.getElementById(
      'confirmBtn'
    );


  if (
    confirmBtn
  ) {


    confirmBtn.classList.add(
      'hidden'
    );


  }


  setMacState(

    'waiting',

    'Scanning...'

  );

}



/**
 * ============================================================
 * REJECT MAC
 * ============================================================
 */

function rejectMacResult(
  message
) {


  resetVerification();


  clearCandidates();


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

      'No verified MAC Address';


    validation.style.color =
      '#d63b3b';


  }


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  if (
    saveBtn
  ) {


    saveBtn.disabled =
      true;


  }


  setMacState(

    'invalid',

    'MAC not verified'

  );


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
 * MANUAL INPUT
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
      ) ||
      '',

    engine:
      'Manual'

  };


  validateMacUI();

}



/**
 * ============================================================
 * VERIFIED MAC UI
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


  let text =

    macVerification.engine ||
    'OCR';


  if (
    macVerification.confidence
  ) {


    text +=

      ' • Confidence: ' +
      macVerification.confidence;


  }


  if (
    macVerification.votes
  ) {


    text +=

      ' • Confirmed: ' +
      macVerification.votes;


  }


  if (
    validation
  ) {


    validation.textContent =
      text;


    validation.style.color =
      '#16864b';


  }


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  if (
    saveBtn
  ) {


    saveBtn.disabled =
      false;


  }

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


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  const validation =

    document.getElementById(
      'macValidation'
    );


  if (
    !input ||
    !saveBtn
  ) {


    return false;


  }


  const mac =

    normalizeMac(
      input.value
    );


  if (
    mac
  ) {


    input.value =
      mac;


    if (
      macVerification.confirmed
    ) {


      updateVerifiedMacUI();


      return true;


    }


    setMacState(

      'waiting',

      'MAC requires confirmation'

    );


    if (
      validation
    ) {


      validation.textContent =

        'Valid MAC format • Confirm before saving';


      validation.style.color =
        '#84590b';


    }


    saveBtn.disabled =
      true;


    const confirmBtn =

      document.getElementById(
        'confirmBtn'
      );


    if (
      confirmBtn
    ) {


      confirmBtn.classList.remove(
        'hidden'
      );


    }


    return false;


  }


  if (
    !input.value
  ) {


    if (
      validation
    ) {


      validation.textContent =
        '';


    }


    setMacState(

      'waiting',

      'Waiting for scan'

    );


  } else {


    if (
      validation
    ) {


      validation.textContent =

        'Incomplete or invalid MAC Address';


      validation.style.color =
        '#d63b3b';


    }


    setMacState(

      'invalid',

      'Invalid MAC'

    );


  }


  saveBtn.disabled =
    true;


  return false;

}



/**
 * ============================================================
 * SAVE & SCAN NEXT
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


    showMessage(

      'Invalid MAC Address.',

      'error'

    );


    return;


  }


  const btn =

    document.getElementById(
      'saveBtn'
    );


  btn.disabled =
    true;


  btn.textContent =
    'SAVING...';


  const params = {

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

  };


  apiRequest(

    params,

    function (
      result
    ) {


      btn.textContent =
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


        resetVerification();


        clearCandidates();


        validateMacUI();


        showMessage(

          'Saved: ' +
          result.mac,

          'success'

        );


        vibrateSuccess();


        loadDashboard();


        window.scrollTo({

          top:
            0,

          behavior:
            'smooth'

        });


      } else if (

        result.type ===
        'duplicate'

      ) {


        btn.disabled =
          false;


        let message =

          'Duplicate: ' +
          result.mac;


        if (

          result.existing &&

          result.existing.location

        ) {


          message +=

            ' • Location: ' +

            result.existing.location;


        }


        showMessage(

          message,

          'warning'

        );


      } else {


        btn.disabled =
          false;


        showMessage(

          result.message ||

          'Save failed.',

          'error'

        );


      }


    },

    function () {


      btn.textContent =
        'SAVE & SCAN NEXT';


      btn.disabled =
        false;


    }

  );

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


      const counter =

        document.getElementById(
          'deviceCount'
        );


      if (
        counter
      ) {


        counter.textContent =

          data.count ||
          0;


      }


      renderRecent(

        data.recent ||
        []

      );


    }

  );

}



/**
 * ============================================================
 * APPS SCRIPT JSONP
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


  let finished =
    false;


  const timeout =

    setTimeout(

      function () {


        if (
          finished
        ) {


          return;


        }


        finished =
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
        finished
      ) {


        return;


      }


      finished =
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


  const query =

    new URLSearchParams(
      parameters
    );


  script.src =

    API_URL +

    '?' +

    query.toString();


  script.onerror =

    function () {


      if (
        finished
      ) {


        return;


      }


      finished =
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
 * RECENT SCANS
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

  show,

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
    !show
  ) {


    box.classList.add(
      'hidden'
    );


    return;


  }


  box.classList.remove(
    'hidden'
  );


  const titleElement =

    document.getElementById(
      'ocrTitle'
    );


  const progressElement =

    document.getElementById(
      'ocrProgress'
    );


  if (
    titleElement
  ) {


    titleElement.textContent =

      title ||

      'Reading...';


  }


  if (
    progressElement
  ) {


    progressElement.textContent =

      progress ||

      '';


  }

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


    console.log(

      type,

      message

    );


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

    6500

  );

}



/**
 * ============================================================
 * HAPTICS
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
 * ESCAPE HTML
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
