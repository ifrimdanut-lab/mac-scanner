/**
 * ============================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.3.1
 * ngrok Connection Fix
 *
 * PRIMARY OCR:
 * Browser / iPhone
 *      ↓ HTTPS
 * ngrok
 *      ↓
 * Flask API
 *      ↓
 * PaddleOCR
 *
 * FALLBACK:
 * Tesseract.js - ONLY after real server/network failure.
 *
 * DATABASE:
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
 * Keep your real Apps Script /exec URL here.
 *
 * Example:
 *
 * https://script.google.com/macros/s/ABC123.../exec
 */
const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbxNhJ2t4fZIu1K_lv2C5dUC1os0wFQN5J0CwIE85iFthjC-0wguwcLhIXIXsSHFKSAo6g/exec';


/**
 * Current ngrok tunnel.
 */
const PADDLE_SERVER_URL =
  'https://reporter-visibly-number.ngrok-free.dev';


const PADDLE_HEALTH_URL =
  PADDLE_SERVER_URL + '/health';


const PADDLE_OCR_URL =
  PADDLE_SERVER_URL + '/ocr-mac';


const APP_VERSION =
  'V1.1.3.1';


/**
 * Connection timeouts
 */
const HEALTH_TIMEOUT_MS =
  8000;


const OCR_TIMEOUT_MS =
  30000;


/**
 * Remote OCR consensus
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


    bindCompatibilityControls();


    handleMacInput();


    loadDashboard();


    await discoverCameras();


    /**
     * Do not block UI startup.
     */
    checkPaddleServer(
      false
    );


  }

);



/**
 * ============================================================
 * UI COMPATIBILITY
 *
 * Works with both the previous UI and the newer
 * "Local PaddleOCR" interface.
 * ============================================================
 */

function bindCompatibilityControls() {


  /**
   * TEST button
   *
   * Supports several possible IDs.
   */

  const testButtonIds = [

    'testServerBtn',

    'testOcrBtn',

    'testOCRBtn',

    'paddleTestBtn'

  ];


  testButtonIds.forEach(

    function (
      id
    ) {


      const button =
        document.getElementById(
          id
        );


      if (
        button
      ) {


        button.onclick =
          function () {


            testPaddleServer();


          };


      }


    }

  );


}



/**
 * ============================================================
 * VERSION
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
      'V1.1.3.1';


  }


  const footer =
    document.querySelector(
      'footer'
    );


  if (
    footer
  ) {


    footer.textContent =

      'ICHC MAC Scanner • PaddleOCR Remote Engine • ' +

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
 * PADDLE SERVER STATUS UI
 * ============================================================
 */

function setPaddleServerStatus(

  state,

  detail

) {


  /**
   * Main blue status card
   */

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



  /**
   * Newer Local PaddleOCR card.
   *
   * Try several possible IDs so we do not require
   * another index.html modification.
   */

  const possibleStatusIds = [

    'ocrServerStatus',

    'serverStatus',

    'paddleServerStatus',

    'paddleStatus',

    'ocrConnectionStatus'

  ];


  let statusElement =
    null;


  possibleStatusIds.some(

    function (
      id
    ) {


      const el =
        document.getElementById(
          id
        );


      if (
        el
      ) {


        statusElement =
          el;


        return true;


      }


      return false;


    }

  );


  /**
   * Also search for an element containing
   * the original "Checking connection..." text.
   */

  if (
    !statusElement
  ) {


    const candidates =

      document.querySelectorAll(

        '.server-status, .ocr-server-status, .connection-status, .status-text'

      );


    if (
      candidates.length
    ) {


      statusElement =
        candidates[0];


    }


  }


  if (
    statusElement
  ) {


    if (
      state ===
      'online'
    ) {


      statusElement.textContent =

        detail ||

        'PaddleOCR ready';


    } else if (
      state ===
      'checking'
    ) {


      statusElement.textContent =

        'Checking connection...';


    } else {


      statusElement.textContent =

        detail ||

        'Offline';


    }


  }



  /**
   * Card border / visual state where available.
   */

  const possibleCardIds = [

    'ocrServerCard',

    'serverStatusCard',

    'paddleServerCard'

  ];


  possibleCardIds.forEach(

    function (
      id
    ) {


      const card =
        document.getElementById(
          id
        );


      if (
        !card
      ) {


        return;


      }


      card.classList.remove(

        'online',

        'offline',

        'checking',

        'success',

        'error'

      );


      if (
        state ===
        'online'
      ) {


        card.classList.add(
          'online'
        );


      } else if (
        state ===
        'checking'
      ) {


        card.classList.add(
          'checking'
        );


      } else {


        card.classList.add(
          'offline'
        );


      }


    }

  );

}



/**
 * ============================================================
 * CHECK PADDLEOCR SERVER
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
        response.status +
        ' ' +
        response.statusText

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


      const raw =

        await response.text();


      console.warn(

        'Unexpected health response:',

        raw

      );


      throw new Error(
        'Server returned non-JSON response'
      );


    }



    const data =

      await response.json();



    if (

      !data ||

      data.success !== true

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

      'Unknown connection error';



    console.error(

      'PaddleOCR health check failed:',

      error

    );



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
 * TEST BUTTON
 *
 * This function is globally accessible from HTML:
 *
 * onclick="testPaddleServer()"
 * ============================================================
 */

async function testPaddleServer() {


  const testButtonIds = [

    'testServerBtn',

    'testOcrBtn',

    'testOCRBtn',

    'paddleTestBtn'

  ];


  const buttons =
    [];


  testButtonIds.forEach(

    function (
      id
    ) {


      const button =
        document.getElementById(
          id
        );


      if (
        button
      ) {


        buttons.push(
          button
        );


        button.disabled =
          true;


        button.dataset.originalText =
          button.textContent;


        button.textContent =
          '...';


      }


    }

  );


  const success =

    await checkPaddleServer(
      true
    );


  buttons.forEach(

    function (
      button
    ) {


      button.disabled =
        false;


      button.textContent =

        button.dataset.originalText ||

        'TEST';


    }

  );


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
 * Optional compatibility for:
 *
 * DEVICE LABEL
 * SCREEN
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


  console.log(

    'Scan mode:',

    currentScanMode

  );

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


    showMessage(

      'Camera element not found.',

      'error'

    );


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


    console.error(

      'Camera error:',

      error

    );


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
        'Camera permission was denied. Allow camera access in browser settings.';


      break;


    case 'NotFoundError':


      message =
        'No camera was detected on this device.';


      break;


    case 'NotReadableError':


      message =
        'The camera may already be used by another application.';


      break;


    case 'OverconstrainedError':


      message =
        'The selected camera is not available.';


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
 * SYNC CAMERA SELECT
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

      'Only one camera is available.',

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

    currentIndex >= 0

      ? currentIndex + 1

      : 0;


  if (
    currentCameraIndex >=
    videoDevices.length
  ) {


    currentCameraIndex =
      0;


  }


  const nextDevice =

    videoDevices[
      currentCameraIndex
    ];


  await startCamera(
    nextDevice.deviceId
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


    /**
     * Always attempt PaddleOCR first.
     *
     * We do NOT automatically trust an old
     * paddleServerOnline=false state.
     */

    const remoteResult =

      await attemptRemotePaddleScan(
        video
      );


    /**
     * Remote server successfully answered.
     *
     * Even if no MAC was found, this is NOT
     * a server failure.
     *
     * Therefore:
     * DO NOT run local fallback.
     */

    if (
      remoteResult.status ===
      'completed'
    ) {


      if (
        remoteResult.detected
      ) {


        evaluateRemoteConsensus(
          remoteResult.readings
        );


      } else {


        rejectMacResult(

          'PaddleOCR responded correctly, but no MAC Address was detected.'

        );


      }


      return;


    }


    /**
     * Real network/server failure.
     *
     * Only now use local OCR fallback.
     */

    console.warn(

      'Real PaddleOCR failure. Starting local fallback.'

    );


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

      'Unexpected scan error:',

      error

    );


    rejectMacResult(

      'Unexpected OCR error. Please try again.'

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
 * ATTEMPT REMOTE PADDLE SCAN
 *
 * Returns:
 *
 * {
 *   status: "completed" | "failed",
 *   detected: true | false,
 *   readings: [],
 *   error: ""
 * }
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


  /**
   * First verify server.
   */

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


  let failedRequests =
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


      console.log(

        'PaddleOCR result ' +
        (i + 1) +
        ':',

        result

      );


      if (

        result &&

        result.success ===
        true

      ) {


        if (

          result.mac &&

          normalizeMac(
            result.mac
          )

        ) {


          readings.push({

            mac:

              normalizeMac(
                result.mac
              ),

            labeled:

              !!result.labeled,

            sourceLine:

              result.source_line ||
              '',

            raw:

              result

          });


        }


      } else {


        /**
         * Server returned JSON,
         * so connectivity works.
         *
         * Treat this as successful server communication.
         */

        console.warn(

          'PaddleOCR response without success:',

          result

        );


      }


    } catch (
      error
    ) {


      failedRequests++;


      lastError =

        error.message ||

        'Remote OCR request failed';


      console.error(

        'PaddleOCR request failed:',

        error

      );


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


  /**
   * At least one real response came from server.
   *
   * Therefore the server itself is reachable.
   */

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


    return {

      status:
        'completed',

      detected:

        readings.length >
        0,

      readings:
        readings,

      error:
        ''

    };


  }


  /**
   * Every remote request failed.
   */

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
 * SEND CANVAS TO PADDLEOCR
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


  /**
   * IMPORTANT
   *
   * Do NOT manually set Content-Type here.
   *
   * Browser must generate multipart boundary.
   */

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
      response.status +
      ' ' +
      response.statusText

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


    const raw =

      await response.text();


    console.error(

      'Unexpected ngrok/Paddle response:',

      raw

    );


    throw new Error(
      'OCR server returned non-JSON response'
    );


  }


  return await response.json();

}



/**
 * ============================================================
 * REMOTE CONSENSUS
 * ============================================================
 */

function evaluateRemoteConsensus(
  readings
) {


  if (

    !readings ||

    readings.length ===
    0

  ) {


    rejectMacResult(

      'PaddleOCR could not detect a MAC Address.'

    );


    return;

  }


  const groups =
    {};


  readings.forEach(

    function (
      reading
    ) {


      if (
        !groups[
          reading.mac
        ]
      ) {


        groups[
          reading.mac
        ] = {

          count:
            0,

          labeledCount:
            0,

          sourceLines:
            []

        };


      }


      groups[
        reading.mac
      ].count++;


      if (
        reading.labeled
      ) {


        groups[
          reading.mac
        ].labeledCount++;


      }


      if (
        reading.sourceLine
      ) {


        groups[
          reading.mac
        ]
          .sourceLines
          .push(
            reading.sourceLine
          );


      }


    }

  );


  let winnerMac =
    null;


  let winner =
    null;


  Object.keys(
    groups
  ).forEach(

    function (
      mac
    ) {


      const group =
        groups[mac];


      if (

        !winner ||

        group.count >
        winner.count ||

        (
          group.count ===
          winner.count &&

          group.labeledCount >
          winner.labeledCount
        )

      ) {


        winnerMac =
          mac;


        winner =
          group;


      }


    }

  );


  if (
    !winnerMac ||
    !winner
  ) {


    rejectMacResult(

      'No reliable MAC Address was found.'

    );


    return;

  }


  let accepted =
    false;


  let confidence =
    '';


  if (
    winner.count ===
    REMOTE_SCAN_COUNT
  ) {


    accepted =
      true;


    confidence =
      'HIGH';


  } else if (

    winner.count >=
    REMOTE_REQUIRED_MATCHES &&

    winner.labeledCount >=
    1

  ) {


    accepted =
      true;


    confidence =
      'HIGH';


  } else if (

    winner.count >=
    REMOTE_REQUIRED_MATCHES

  ) {


    accepted =
      true;


    confidence =
      'GOOD';


  }


  if (
    !accepted
  ) {


    console.warn(

      'Remote consensus rejected:',

      groups

    );


    rejectMacResult(

      'Different MAC addresses were detected. Hold the camera steady and scan again.'

    );


    return;

  }


  acceptRemoteMac(

    winnerMac,

    winner.count,

    REMOTE_SCAN_COUNT,

    confidence,

    winner.sourceLines

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

  confidence,

  sourceLines

) {


  const input =

    document.getElementById(
      'macInput'
    );


  if (
    !input
  ) {


    return;

  }


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


  console.log(

    'PaddleOCR source lines:',

    sourceLines

  );


  showMessage(

    'PaddleOCR confirmed: ' +
    mac +
    ' • ' +
    votes +
    '/' +
    total +
    ' scans',

    'success'

  );

}



/**
 * ============================================================
 * CANVAS → JPEG BLOB
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
                'Could not create image.'
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


  /**
   * Slightly different crop for screen mode.
   */

  const cropWidthRatio =

    currentScanMode ===
    'screen'

      ? 0.94

      : 0.90;


  const cropHeightRatio =

    currentScanMode ===
    'screen'

      ? 0.62

      : 0.56;


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


  const targetScale =

    sourceWidth <
    1600

      ? 1.6

      : 1.25;


  canvas.width =

    Math.floor(

      cropWidth *
      targetScale

    );


  canvas.height =

    Math.floor(

      cropHeight *
      targetScale

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


          await scanPhotoWithRemoteFirst(
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
 *
 * Remote first.
 * Local fallback only if server actually fails.
 * ============================================================
 */

async function scanPhotoWithRemoteFirst(
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


  clearMacResult();


  setOCRStatus(

    true,

    'PaddleOCR',

    'Uploading image...'

  );


  try {


    /**
     * Always attempt remote.
     */

    const online =

      await checkPaddleServer(
        false
      );


    if (
      !online
    ) {


      throw new Error(

        paddleLastError ||

        'PaddleOCR server offline'

      );


    }


    let result;


    try {


      result =

        await sendCanvasToPaddle(
          canvas
        );


    } catch (
      error
    ) {


      /**
       * Real communication failure.
       */

      throw error;


    }


    /**
     * Server responded.
     *
     * Do not fallback simply because OCR did not detect MAC.
     */

    if (

      result &&

      result.success ===
      true

    ) {


      if (

        result.mac &&

        normalizeMac(
          result.mac
        )

      ) {


        const mac =

          normalizeMac(
            result.mac
          );


        const input =

          document.getElementById(
            'macInput'
          );


        input.value =
          mac;


        macVerification = {

          mode:
            'remote-photo',

          confirmed:
            true,

          confidence:

            result.labeled

              ? 'HIGH'

              : 'GOOD',

          votes:
            'Photo',

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

          'PaddleOCR detected: ' +
          mac,

          'success'

        );


      } else {


        rejectMacResult(

          'PaddleOCR processed the image but did not find a MAC Address.'

        );


      }


      return;


    }


    rejectMacResult(

      'PaddleOCR processed the request but returned no valid result.'

    );


  } catch (
    error
  ) {


    /**
     * ONLY here:
     * actual remote failure.
     */

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

      'PaddleOCR server unavailable. Using local OCR fallback.',

      'warning'

    );


    try {


      await runLocalTesseractCanvas(
        canvas
      );


    } catch (
      fallbackError
    ) {


      console.error(
        fallbackError
      );


      rejectMacResult(

        'Both PaddleOCR and local OCR failed.'

      );


    }


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


  await tesseractWorker
    .setParameters({

      tessedit_char_whitelist:

        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-.() ',

      preserve_interword_spaces:
        '1'

    });


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


  setOCRStatus(

    true,

    'Local OCR fallback',

    'Reading image...'

  );


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


  console.log(

    'Local OCR:',

    text

  );


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
        'Local OCR',

      mac:
        mac,

      engine:
        'Tesseract'

    };


    setMacState(

      'valid',

      'Local OCR result'

    );


    const validation =

      document.getElementById(
        'macValidation'
      );


    validation.textContent =

      'Local OCR • Verify manually before saving';


    validation.style.color =
      '#84590b';


    document

      .getElementById(
        'saveBtn'
      )

      .disabled =
      false;


    setOCRStatus(
      false
    );


    showMessage(

      'Local OCR detected: ' +
      mac +
      ' • Verify before saving.',

      'warning'

    );


  } else {


    rejectMacResult(

      'Local OCR could not detect a reliable MAC Address.'

    );


  }

}



/**
 * ============================================================
 * STRICT LOCAL EXTRACTION
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


      const mac =

        normalizeMac(
          matches[0]
        );


      if (
        mac
      ) {


        return mac;


      }


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


  setMacState(

    'waiting',

    'Scanning...'

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

    input
      .value
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


  if (
    validation
  ) {


    let text =

      macVerification.engine ||
      'OCR';


    text +=

      ' • Confidence: ' +
      macVerification.confidence;


    if (
      macVerification.votes
    ) {


      text +=

        ' • Confirmed: ' +
        macVerification.votes;


    }


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
 * VALIDATE MAC UI
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

      'valid',

      'Manual MAC entry'

    );


    if (
      validation
    ) {


      validation.textContent =

        'Valid MAC format • Verify before saving';


      validation.style.color =
        '#16864b';

    }


    saveBtn.disabled =
      false;


    return true;

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
    !validateMacUI()
  ) {


    showMessage(

      'Please enter a valid MAC Address.',

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

      document
        .getElementById(
          'macInput'
        )
        .value,

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

            result
              .existing
              .location;


        }


        if (

          result.existing &&

          result.existing.device

        ) {


          message +=

            ' • Device: ' +

            result
              .existing
              .device;


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
 * GOOGLE SHEETS DASHBOARD
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


    console.warn(

      'Apps Script API URL is not configured.'

    );


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
          parameters.action !==
          'dashboard'
        ) {


          showMessage(

            'Google Sheets server timeout.',

            'error'

          );


        }


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
        parameters.action !==
        'dashboard'
      ) {


        showMessage(

          'Could not connect to Google Sheets.',

          'error'

        );


      }


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

    items

      .map(

        function (
          item
        ) {


          return `

            <div class="recentItem">

              <div class="recentTop">

                <div class="recentMac">

                  ${escapeHtml(
                    item.mac
                  )}

                </div>

                <div class="recentDevice">

                  ${escapeHtml(
                    item.device ||
                    'Device'
                  )}

                </div>

              </div>

              <div class="recentBottom">

                <span>

                  ${escapeHtml(
                    item.location ||
                    'No location'
                  )}

                </span>

                <span>

                  ${escapeHtml(
                    item.timestamp
                  )}

                </span>

              </div>

            </div>

          `;


        }

      )

      .join(
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


  if (
    titleElement
  ) {


    titleElement.textContent =

      title ||

      'Reading...';

  }


  const progressElement =

    document.getElementById(
      'ocrProgress'
    );


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
 * MAIN SYSTEM STATUS
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
 * HAPTIC FEEDBACK
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
 * HTML SECURITY
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
