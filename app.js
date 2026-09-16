/**
 * ==========================================================
 * ICHC MAC Scanner
 * Version V1.2.0.1
 * Local PaddleOCR Engine
 * ==========================================================
 */

const APP_VERSION =
  'V1.2.0.1';


/**
 * ==========================================================
 * GOOGLE APPS SCRIPT BACKEND
 *
 * IMPORTANT:
 * Keep your real Apps Script /exec URL here.
 * ==========================================================
 */

const GOOGLE_API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbZDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';


/**
 * ==========================================================
 * LOCAL OCR BACKEND
 *
 * V1.2.0.1 automatically cleans:
 *
 * /health
 * /ocr
 * trailing /
 *
 * if accidentally added.
 * ==========================================================
 */

const OCR_API_URL_RAW =
  'https://math-max-mlb-poems.trycloudflare.com';


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
 * NORMALIZE OCR BASE URL
 *
 * Examples:
 *
 * https://abc.trycloudflare.com/
 * ->
 * https://abc.trycloudflare.com
 *
 * https://abc.trycloudflare.com/health
 * ->
 * https://abc.trycloudflare.com
 *
 * https://abc.trycloudflare.com/ocr
 * ->
 * https://abc.trycloudflare.com
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


  /*
   * Remove query string and hash.
   */

  url =
    url.split(
      '?'
    )[0];


  url =
    url.split(
      '#'
    )[0];


  /*
   * Remove trailing slash(es).
   */

  url =
    url.replace(
      /\/+$/,
      ''
    );


  /*
   * Remove accidental endpoint.
   */

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


  /*
   * Clean again in case endpoint removal
   * leaves trailing slash.
   */

  url =
    url.replace(
      /\/+$/,
      ''
    );


  return url;

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
    OCR_API_URL +
    '/health';


  const text =
    document.getElementById(
      'ocrServerText'
    );


  text.textContent =
    'Checking PaddleOCR server...';


  console.log(
    'OCR health URL:',
    healthURL
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

          headers: {

            'Accept':
              'application/json'

          }

        }

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

    console.error(
      'OCR health error:',
      error
    );


    setOCRServerState(

      false,

      'OCR server offline • ' +
      error.message

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


    document
      .getElementById(
        'scanBtn'
      )
      .disabled =
      false;


    document
      .getElementById(
        'switchCameraBtn'
      )
      .disabled =
      false;


    document
      .getElementById(
        'startCameraBtn'
      )
      .textContent =
      'RESTART CAMERA';


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

    'Connecting to local OCR server'

  );


  const ocrURL =
    OCR_API_URL +
    '/ocr';


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

      'PaddleOCR online'

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


    validation.textContent =
      'PaddleOCR read the image, but no MAC pattern was detected.';


    validation.style.color =
      '#d63b3b';


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


  document
    .getElementById(
      'macInput'
    )
    .value =
    normalized;


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


  validation.textContent =
    'Compare this MAC with the device, then press CONFIRM MAC ADDRESS.';


  validation.style.color =
    '#84590b';


  document
    .getElementById(
      'confirmBtn'
    )
    .classList
    .remove(
      'hidden'
    );


  document
    .getElementById(
      'saveBtn'
    )
    .disabled =
    true;

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


    document
      .getElementById(
        'confirmBtn'
      )
      .classList
      .remove(
        'hidden'
      );


    document
      .getElementById(
        'saveBtn'
      )
      .disabled =
      true;


    validation.textContent =
      'Valid format. Confirm the value before saving.';


    validation.style.color =
      '#84590b';


  } else {

    document
      .getElementById(
        'confirmBtn'
      )
      .classList
      .add(
        'hidden'
      );


    document
      .getElementById(
        'saveBtn'
      )
      .disabled =
      true;


    if (
      input.value
    ) {

      setMacState(

        'invalid',

        'INVALID MAC'

      );


      validation.textContent =
        'Incomplete or invalid MAC Address.';


      validation.style.color =
        '#d63b3b';


    } else {

      setMacState(

        'waiting',

        'Waiting for scan'

      );


      validation.textContent =
        '';

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


  validation.textContent =
    'MAC verified and ready to save.';


  validation.style.color =
    '#16864b';


  document
    .getElementById(
      'confirmBtn'
    )
    .classList
    .add(
      'hidden'
    );


  document
    .getElementById(
      'saveBtn'
    )
    .disabled =
    false;


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
            'note'
          )
          .value =
          '';


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
