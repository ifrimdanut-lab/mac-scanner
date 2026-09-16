/**
 * ==========================================================
 * ICHC MAC Scanner
 * Version V1.2.2
 * Local PaddleOCR Engine
 * Permanent Tailscale Funnel
 *
 * NEW:
 * - Visible connection provider
 * - Visible OCR endpoint
 * ==========================================================
 */

const APP_VERSION =
  'V1.2.2';


/**
 * ==========================================================
 * GOOGLE APPS SCRIPT BACKEND
 * ==========================================================
 */

const GOOGLE_API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbZDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';


/**
 * ==========================================================
 * OCR BACKEND
 * ==========================================================
 */

const OCR_CONNECTION_NAME =
  'Tailscale';


const OCR_API_URL_RAW =
  'https://pc-home.tail51a762.ts.net';


const OCR_API_URL =
  normalizeOCRBaseURL(
    OCR_API_URL_RAW
  );


let scanMode =
  'screen';


let cameraStream =
  null;


let videoDevices =
  [];


let currentDeviceId =
  null;


let ocrBusy =
  false;


let macConfirmed =
  false;



/**
 * ==========================================================
 * STARTUP
 * ==========================================================
 */

document.addEventListener(

  'DOMContentLoaded',

  async function () {

    console.log(
      'ICHC MAC Scanner',
      APP_VERSION
    );


    console.log(
      'OCR Connection:',
      OCR_CONNECTION_NAME
    );


    console.log(
      'OCR Base URL:',
      OCR_API_URL
    );


    renderConnectionInfo();


    setScanMode(
      'screen'
    );


    resetMacState();


    loadDashboard();


    await discoverCameras();


    checkOCRServer();

  }

);



/**
 * ==========================================================
 * CONNECTION INFORMATION
 *
 * Automatically inserts:
 *
 * Connection: Tailscale
 * Endpoint: pc-home.tail51a762.ts.net
 *
 * directly below OCR server status.
 * ==========================================================
 */

function renderConnectionInfo() {

  const existing =
    document.getElementById(
      'ocrConnectionInfo'
    );


  if (
    existing
  ) {

    existing.remove();

  }


  const panel =
    document.getElementById(
      'ocrServerPanel'
    );


  if (
    !panel
  ) {

    return;

  }


  const info =
    document.createElement(
      'div'
    );


  info.id =
    'ocrConnectionInfo';


  info.style.marginTop =
    '8px';


  info.style.paddingTop =
    '8px';


  info.style.borderTop =
    '1px solid rgba(0,0,0,0.08)';


  info.style.fontSize =
    '12px';


  info.style.lineHeight =
    '1.6';


  info.style.color =
    '#526273';


  info.innerHTML =

    '<div>' +

      '<strong>' +

        'Connection:' +

      '</strong> ' +

      escapeHtml(
        OCR_CONNECTION_NAME
      ) +

    '</div>' +

    '<div>' +

      '<strong>' +

        'Endpoint:' +

      '</strong> ' +

      escapeHtml(
        getOCRHostname()
      ) +

    '</div>';


  panel.appendChild(
    info
  );

}



/**
 * ==========================================================
 * GET OCR HOSTNAME
 * ==========================================================
 */

function getOCRHostname() {

  try {

    const url =
      new URL(
        OCR_API_URL
      );


    return url.hostname;


  } catch (
    error
  ) {

    return OCR_API_URL;

  }

}



/**
 * ==========================================================
 * NORMALIZE OCR BASE URL
 * ==========================================================
 */

function normalizeOCRBaseURL(
  value
) {

  let url =
    String(
      value || ''
    )
      .trim();


  if (
    !url
  ) {

    return '';

  }


  url =
    url.split(
      '?'
    )[0];


  url =
    url.split(
      '#'
    )[0];


  url =
    url.replace(
      /\/+$/,
      ''
    );


  url =
    url.replace(
      /\/health$/i,
      ''
    );


  url =
    url.replace(
      /\/ocr$/i,
      ''
    );


  url =
    url.replace(
      /\/+$/,
      ''
    );


  return url;

}



/**
 * ==========================================================
 * BUILD OCR ENDPOINT
 * ==========================================================
 */

function getOCREndpoint(
  path
) {

  const cleanPath =
    String(
      path || ''
    )
      .replace(
        /^\/+/,
        ''
      );


  return (
    normalizeOCRBaseURL(
      OCR_API_URL
    )
    +
    '/'
    +
    cleanPath
  );

}



/**
 * ==========================================================
 * OCR SERVER HEALTH
 * ==========================================================
 */

async function checkOCRServer() {

  if (
    !OCR_API_URL ||
    OCR_API_URL.includes(
      'PASTE_YOUR'
    )
  ) {

    setOCRServerState(
      false,
      'OCR URL is not configured.'
    );

    return;

  }


  const healthURL =
    getOCREndpoint(
      'health'
    );


  const text =
    document.getElementById(
      'ocrServerText'
    );


  if (
    text
  ) {

    text.textContent =
      'Checking PaddleOCR server...';

  }


  console.log(
    'OCR health URL:',
    healthURL
  );


  const controller =
    new AbortController();


  const timeoutId =
    setTimeout(

      function () {

        controller.abort();

      },

      10000

    );


  try {

    const response =
      await fetch(

        healthURL,

        {

          method:
            'GET',

          cache:
            'no-store',

          signal:
            controller.signal,

          headers: {

            'Accept':
              'application/json'

          }

        }

      );


    clearTimeout(
      timeoutId
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
      data &&
      data.success ===
      true
    ) {

      setOCRServerState(

        true,

        'PaddleOCR online • ' +
        (
          data.version ||
          APP_VERSION
        )

      );


    } else {

      throw new Error(
        'Unexpected health response.'
      );

    }


  } catch (
    error
  ) {

    clearTimeout(
      timeoutId
    );


    console.error(
      'OCR health error:',
      error
    );


    let message =
      error.message;


    if (
      error.name ===
      'AbortError'
    ) {

      message =
        'Connection timeout';

    }


    setOCRServerState(

      false,

      'OCR server offline • ' +
      message

    );

  }

}



/**
 * ==========================================================
 * OCR SERVER STATE
 * ==========================================================
 */

function setOCRServerState(
  online,
  message
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
      'serverOffline'
    );


    panel.classList.add(

      online
        ? 'serverOnline'
        : 'serverOffline'

    );

  }


  if (
    text
  ) {

    text.textContent =
      message;

  }


  setSystemStatus(

    online
      ? 'OCR ready'
      : 'OCR offline',

    online

  );


  /*
   * Re-render connection info because changing
   * server panel classes should never remove it.
   */

  renderConnectionInfo();

}



/**
 * ==========================================================
 * SCAN MODE
 * ==========================================================
 */

function setScanMode(
  mode
) {

  scanMode =
    mode ===
    'label'
      ? 'label'
      : 'screen';


  const screenBtn =
    document.getElementById(
      'screenModeBtn'
    );


  const labelBtn =
    document.getElementById(
      'labelModeBtn'
    );


  const frame =
    document.getElementById(
      'scanFrame'
    );


  const hint =
    document.getElementById(
      'modeHint'
    );


  if (
    screenBtn
  ) {

    screenBtn.classList.remove(
      'active'
    );

  }


  if (
    labelBtn
  ) {

    labelBtn.classList.remove(
      'active'
    );

  }


  if (
    frame
  ) {

    frame.classList.remove(
      'screenFrame',
      'labelFrame'
    );

  }


  if (
    scanMode ===
    'screen'
  ) {

    if (
      screenBtn
    ) {

      screenBtn.classList.add(
        'active'
      );

    }


    if (
      frame
    ) {

      frame.classList.add(
        'screenFrame'
      );

    }


    if (
      hint
    ) {

      hint.textContent =
        'Optimized for MAC addresses displayed on screens.';

    }


  } else {

    if (
      labelBtn
    ) {

      labelBtn.classList.add(
        'active'
      );

    }


    if (
      frame
    ) {

      frame.classList.add(
        'labelFrame'
      );

    }


    if (
      hint
    ) {

      hint.textContent =
        'Use for stickers, printers, access points and device labels.';

    }

  }

}



/**
 * ==========================================================
 * CAMERA DISCOVERY
 * ==========================================================
 */

async function discoverCameras() {

  if (

    !navigator.mediaDevices ||

    !navigator.mediaDevices.enumerateDevices

  ) {

    showMessage(

      'Camera is not supported by this browser.',

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
 * ==========================================================
 * CAMERA LIST
 * ==========================================================
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
    !select ||
    !row
  ) {

    return;

  }


  select.innerHTML =
    '';


  if (
    videoDevices.length ===
    0
  ) {

    row.classList.add(
      'hidden'
    );

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


  row.classList.remove(
    'hidden'
  );

}



/**
 * ==========================================================
 * START CAMERA
 * ==========================================================
 */

async function startCamera(
  requestedDeviceId = null
) {

  const video =
    document.getElementById(
      'camera'
    );


  try {

    stopCamera();


    let videoConstraints;


    if (
      requestedDeviceId
    ) {

      videoConstraints = {

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

      };


    } else {

      videoConstraints = {

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

      };

    }


    cameraStream =
      await navigator
        .mediaDevices
        .getUserMedia({

          video:
            videoConstraints,

          audio:
            false

        });


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


    const scanButton =
      document.getElementById(
        'scanBtn'
      );


    if (
      scanButton
    ) {

      scanButton.disabled =
        false;

    }


    const switchButton =
      document.getElementById(
        'switchCameraBtn'
      );


    if (
      switchButton
    ) {

      switchButton.disabled =
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


    const track =
      cameraStream
        .getVideoTracks()[0];


    const settings =
      track
        .getSettings();


    currentDeviceId =
      settings.deviceId ||
      null;


    await discoverCameras();


    syncCameraSelector();


  } catch (
    error
  ) {

    console.error(
      'Camera error:',
      error
    );


    showMessage(

      'Camera could not be started: ' +
      error.message,

      'error'

    );

  }

}



/**
 * ==========================================================
 * STOP CAMERA
 * ==========================================================
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
 * ==========================================================
 * CHANGE CAMERA
 * ==========================================================
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


  await startCamera(
    select.value
  );

}



/**
 * ==========================================================
 * SYNC CAMERA SELECTOR
 * ==========================================================
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
 * ==========================================================
 * SWITCH CAMERA
 * ==========================================================
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


  let index =
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


  index++;


  if (
    index >=
    videoDevices.length
  ) {

    index =
      0;

  }


  await startCamera(

    videoDevices[
      index
    ].deviceId

  );

}



/**
 * ==========================================================
 * CAPTURE CAMERA FRAME
 * ==========================================================
 */

function captureCameraFrame() {

  const video =
    document.getElementById(
      'camera'
    );


  const canvas =
    document.getElementById(
      'scanCanvas'
    );


  const context =
    canvas.getContext(

      '2d',

      {
        willReadFrequently:
          true
      }

    );


  const width =
    video.videoWidth;


  const height =
    video.videoHeight;


  let cropWidth =
    width *
    0.92;


  let cropHeight;


  if (
    scanMode ===
    'screen'
  ) {

    cropHeight =
      height *
      0.32;


  } else {

    cropHeight =
      height *
      0.62;

  }


  const startX =

    (
      width -
      cropWidth
    ) / 2;


  const startY =

    (
      height -
      cropHeight
    ) / 2;


  const scale =
    1.8;


  canvas.width =
    Math.round(
      cropWidth *
      scale
    );


  canvas.height =
    Math.round(
      cropHeight *
      scale
    );


  context.imageSmoothingEnabled =
    true;


  context.imageSmoothingQuality =
    'high';


  context.drawImage(

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
 * ==========================================================
 * CAMERA SCAN
 * ==========================================================
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
    !video.videoWidth
  ) {

    showMessage(

      'Camera is not ready.',

      'warning'

    );

    return;

  }


  const canvas =
    captureCameraFrame();


  await sendCanvasToOCR(
    canvas
  );

}



/**
 * ==========================================================
 * UPLOADED PHOTO
 * ==========================================================
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
      eventData
    ) {

      const image =
        new Image();


      image.onload =

        async function () {

          const canvas =
            document.getElementById(
              'scanCanvas'
            );


          const context =
            canvas.getContext(

              '2d',

              {
                willReadFrequently:
                  true
              }

            );


          let width =
            image.width;


          let height =
            image.height;


          const maxDimension =
            2400;


          if (

            Math.max(
              width,
              height
            ) >
            maxDimension

          ) {

            const ratio =

              maxDimension /

              Math.max(
                width,
                height
              );


            width =
              Math.round(
                width *
                ratio
              );


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


          context.drawImage(

            image,

            0,
            0,

            width,
            height

          );


          await sendCanvasToOCR(
            canvas
          );

        };


      image.src =
        eventData.target.result;

    };


  reader.readAsDataURL(
    file
  );

}



/**
 * ==========================================================
 * SEND IMAGE TO PADDLEOCR
 * ==========================================================
 */

async function sendCanvasToOCR(
  canvas
) {

  if (
    !OCR_API_URL
  ) {

    showMessage(

      'OCR API URL is not configured.',

      'error'

    );

    return;

  }


  ocrBusy =
    true;


  const button =
    document.getElementById(
      'scanBtn'
    );


  if (
    button
  ) {

    button.disabled =
      true;

  }


  resetOCRResult();


  setOCRStatus(

    true,

    'Sending image to PaddleOCR...',

    'Connecting through ' +
    OCR_CONNECTION_NAME

  );


  const ocrURL =
    getOCREndpoint(
      'ocr'
    );


  console.log(
    'OCR request URL:',
    ocrURL
  );


  try {

    const blob =
      await canvasToBlob(
        canvas
      );


    const form =
      new FormData();


    form.append(

      'image',

      blob,

      'mac-scan.jpg'

    );


    setOCRStatus(

      true,

      'PaddleOCR is reading...',

      'Detecting text and MAC candidates'

    );


    const response =
      await fetch(

        ocrURL,

        {

          method:
            'POST',

          body:
            form,

          cache:
            'no-store'

        }

      );


    let result;


    try {

      result =
        await response.json();


    } catch (
      jsonError
    ) {

      throw new Error(

        'OCR server returned an invalid response.'

      );

    }


    if (
      !response.ok
    ) {

      throw new Error(

        result.message ||

        (
          'HTTP ' +
          response.status
        )

      );

    }


    if (
      !result.success
    ) {

      throw new Error(

        result.message ||
        'OCR request failed.'

      );

    }


    setOCRServerState(

      true,

      'PaddleOCR online • ' +
      (
        result.version ||
        'ready'
      )

    );


    handleOCRResult(
      result
    );


  } catch (
    error
  ) {

    console.error(
      'OCR request error:',
      error
    );


    setOCRServerState(

      false,

      'OCR connection failed • ' +
      error.message

    );


    showMessage(

      'PaddleOCR error: ' +
      error.message,

      'error'

    );


    setMacState(

      'invalid',

      'OCR ERROR'

    );


  } finally {

    ocrBusy =
      false;


    if (
      button
    ) {

      button.disabled =
        false;

    }


    setOCRStatus(
      false
    );

  }

}



/**
 * ==========================================================
 * CANVAS TO BLOB
 * ==========================================================
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

        0.95

      );

    }

  );

}



/**
 * ==========================================================
 * OCR RESULT
 * ==========================================================
 */

function handleOCRResult(
  result
) {

  if (

    !result.found ||

    !result.candidates ||

    result.candidates.length ===
    0

  ) {

    setMacState(

      'invalid',

      'MAC NOT FOUND'

    );


    const validation =
      document.getElementById(
        'macValidation'
      );


    if (
      validation
    ) {

      validation.textContent =
        'PaddleOCR read the image, but no MAC pattern was detected.';


      validation.style.color =
        '#d63b3b';

    }


    showMessage(

      'No MAC detected. Try a closer image or use PHOTO / IMAGE.',

      'warning'

    );


    return;

  }


  renderCandidates(
    result.candidates
  );


  selectCandidate(
    result.candidates[0].mac
  );


  const seconds =
    result.processingSeconds !==
    undefined
      ? result.processingSeconds
      : '?';


  showMessage(

    result.candidates.length +
    ' MAC candidate(s) detected in ' +
    seconds +
    ' s.',

    'success'

  );

}



/**
 * ==========================================================
 * CANDIDATES
 * ==========================================================
 */

function renderCandidates(
  candidates
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


      button.className =
        'candidateBtn';


      let details =

        (
          candidate.votes ||
          1
        ) +

        ' OCR reading(s)';


      if (
        candidate.corrected
      ) {

        details +=
          ' • OCR correction used';

      }


      button.innerHTML =

        escapeHtml(
          candidate.mac
        )

        +

        '<small>' +

        escapeHtml(
          details
        )

        +

        '</small>';


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


  section.classList.remove(
    'hidden'
  );

}



/**
 * ==========================================================
 * SELECT CANDIDATE
 * ==========================================================
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


  const input =
    document.getElementById(
      'macInput'
    );


  if (
    input
  ) {

    input.value =
      normalized;

  }


  macConfirmed =
    false;


  setMacState(

    'candidate',

    'OCR CANDIDATE'

  );


  const validation =
    document.getElementById(
      'macValidation'
    );


  if (
    validation
  ) {

    validation.textContent =
      'Compare this MAC with the device, then press CONFIRM MAC ADDRESS.';


    validation.style.color =
      '#84590b';

  }


  const confirmButton =
    document.getElementById(
      'confirmBtn'
    );


  if (
    confirmButton
  ) {

    confirmButton
      .classList
      .remove(
        'hidden'
      );

  }


  const saveButton =
    document.getElementById(
      'saveBtn'
    );


  if (
    saveButton
  ) {

    saveButton.disabled =
      true;

  }

}



/**
 * ==========================================================
 * MANUAL INPUT
 * ==========================================================
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


  let clean =
    input.value
      .toUpperCase()
      .replace(
        /[^0-9A-F]/g,
        ''
      )
      .substring(
        0,
        12
      );


  const groups =
    [];


  for (

    let i = 0;

    i < clean.length;

    i += 2

  ) {

    groups.push(

      clean.substring(
        i,
        i + 2
      )

    );

  }


  input.value =
    groups.join(
      ':'
    );


  macConfirmed =
    false;


  const mac =
    normalizeMac(
      input.value
    );


  const validation =
    document.getElementById(
      'macValidation'
    );


  if (
    mac
  ) {

    input.value =
      mac;


    setMacState(

      'candidate',

      'VERIFY MAC'

    );


    const confirmButton =
      document.getElementById(
        'confirmBtn'
      );


    if (
      confirmButton
    ) {

      confirmButton
        .classList
        .remove(
          'hidden'
        );

    }


    const saveButton =
      document.getElementById(
        'saveBtn'
      );


    if (
      saveButton
    ) {

      saveButton.disabled =
        true;

    }


    if (
      validation
    ) {

      validation.textContent =
        'Valid format. Confirm the value before saving.';


      validation.style.color =
        '#84590b';

    }


  } else {

    const confirmButton =
      document.getElementById(
        'confirmBtn'
      );


    if (
      confirmButton
    ) {

      confirmButton
        .classList
        .add(
          'hidden'
        );

    }


    const saveButton =
      document.getElementById(
        'saveBtn'
      );


    if (
      saveButton
    ) {

      saveButton.disabled =
        true;

    }


    if (
      input.value
    ) {

      setMacState(

        'invalid',

        'INVALID MAC'

      );


      if (
        validation
      ) {

        validation.textContent =
          'Incomplete or invalid MAC Address.';


        validation.style.color =
          '#d63b3b';

      }


    } else {

      setMacState(

        'waiting',

        'Waiting for scan'

      );


      if (
        validation
      ) {

        validation.textContent =
          '';

      }

    }

  }

}



/**
 * ==========================================================
 * CONFIRM MAC
 * ==========================================================
 */

function confirmMac() {

  const input =
    document.getElementById(
      'macInput'
    );


  if (
    !input
  ) {

    return;

  }


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


  input.value =
    mac;


  macConfirmed =
    true;


  setMacState(

    'valid',

    'CONFIRMED'

  );


  const validation =
    document.getElementById(
      'macValidation'
    );


  if (
    validation
  ) {

    validation.textContent =
      'MAC verified and ready to save.';


    validation.style.color =
      '#16864b';

  }


  const confirmButton =
    document.getElementById(
      'confirmBtn'
    );


  if (
    confirmButton
  ) {

    confirmButton
      .classList
      .add(
        'hidden'
      );

  }


  const saveButton =
    document.getElementById(
      'saveBtn'
    );


  if (
    saveButton
  ) {

    saveButton.disabled =
      false;

  }


  showMessage(

    'MAC confirmed: ' +
    mac,

    'success'

  );

}



/**
 * ==========================================================
 * NORMALIZE MAC
 * ==========================================================
 */

function normalizeMac(
  value
) {

  const clean =
    String(
      value ||
      ''
    )
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
 * ==========================================================
 * RESET OCR RESULT
 * ==========================================================
 */

function resetOCRResult() {

  macConfirmed =
    false;


  const candidateSection =
    document.getElementById(
      'candidateSection'
    );


  if (
    candidateSection
  ) {

    candidateSection
      .classList
      .add(
        'hidden'
      );

  }


  const candidateList =
    document.getElementById(
      'candidateList'
    );


  if (
    candidateList
  ) {

    candidateList.innerHTML =
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

}



/**
 * ==========================================================
 * RESET MAC STATE
 * ==========================================================
 */

function resetMacState() {

  resetOCRResult();


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


  setMacState(

    'waiting',

    'Waiting for scan'

  );

}



/**
 * ==========================================================
 * SAVE TO GOOGLE SHEET
 * ==========================================================
 */

function saveAndNext() {

  if (
    !macConfirmed
  ) {

    showMessage(

      'Confirm the MAC Address first.',

      'warning'

    );

    return;

  }


  const input =
    document.getElementById(
      'macInput'
    );


  if (
    !input
  ) {

    return;

  }


  const mac =
    normalizeMac(
      input.value
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


  if (
    button
  ) {

    button.disabled =
      true;


    button.textContent =
      'SAVING...';

  }


  const deviceElement =
    document.getElementById(
      'deviceType'
    );


  const locationElement =
    document.getElementById(
      'location'
    );


  const noteElement =
    document.getElementById(
      'note'
    );


  apiRequest(

    {

      api:
        'v11',

      action:
        'saveMac',

      mac:
        mac,

      device:
        deviceElement
          ? deviceElement.value
          : '',

      location:
        locationElement
          ? locationElement.value
          : '',

      note:
        noteElement
          ? noteElement.value
          : ''

    },

    function (
      result
    ) {

      if (
        button
      ) {

        button.textContent =
          'SAVE & SCAN NEXT';

      }


      if (
        result.success
      ) {

        const count =
          document.getElementById(
            'deviceCount'
          );


        if (
          count
        ) {

          count.textContent =
            result.count;

        }


        if (
          noteElement
        ) {

          noteElement.value =
            '';

        }


        resetMacState();


        showMessage(

          'Saved: ' +
          result.mac,

          'success'

        );


        loadDashboard();


        window.scrollTo({

          top:
            0,

          behavior:
            'smooth'

        });


      } else {

        if (
          button
        ) {

          button.disabled =
            false;

        }


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

      if (
        button
      ) {

        button.textContent =
          'SAVE & SCAN NEXT';


        button.disabled =
          false;

      }


      showMessage(

        'Could not connect to Google Apps Script.',

        'error'

      );

    }

  );

}



/**
 * ==========================================================
 * GOOGLE DASHBOARD
 * ==========================================================
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


      const count =
        document.getElementById(
          'deviceCount'
        );


      if (
        count
      ) {

        count.textContent =
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
 * ==========================================================
 * GOOGLE JSONP API
 * ==========================================================
 */

function apiRequest(

  parameters,

  onSuccess,

  onError

) {

  if (
    !GOOGLE_API_URL ||
    GOOGLE_API_URL.includes(
      'PASTE_YOUR'
    )
  ) {

    showMessage(

      'Google API URL is not configured.',

      'error'

    );

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

      script
        .parentNode
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


  script.src =

    GOOGLE_API_URL +

    '?' +

    new URLSearchParams(
      parameters
    ).toString();


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
 * ==========================================================
 * RECENT SCANS
 * ==========================================================
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
      .join('');

}



/**
 * ==========================================================
 * OCR STATUS
 * ==========================================================
 */

function setOCRStatus(

  show,

  title = '',

  progress = ''

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
      title;

  }


  if (
    progressElement
  ) {

    progressElement.textContent =
      progress;

  }

}



/**
 * ==========================================================
 * MAC UI STATE
 * ==========================================================
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
 * ==========================================================
 * SYSTEM STATUS
 * ==========================================================
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
 * ==========================================================
 * MESSAGE
 * ==========================================================
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
 * ==========================================================
 * SECURITY
 * ==========================================================
 */

function escapeHtml(
  value
) {

  return String(
    value ??
    ''
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



/**
 * ==========================================================
 * CLEANUP
 * ==========================================================
 */

window.addEventListener(

  'beforeunload',

  function () {

    stopCamera();

  }

);
