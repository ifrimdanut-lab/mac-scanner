/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.1
 * Fast MAC Recognition
 * ==========================================================
 */


/**
 * ==========================================================
 * CONFIG
 * ==========================================================
 */

const API_URL =
  'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';


const APP_VERSION =
  'V1.1.1';


let cameraStream =
  null;


let videoDevices =
  [];


let currentDeviceId =
  null;


let currentCameraIndex =
  0;


let ocrWorker =
  null;


let ocrBusy =
  false;



/**
 * ==========================================================
 * STARTUP
 * ==========================================================
 */

document.addEventListener(

  'DOMContentLoaded',

  async function () {

    loadDashboard();

    handleMacInput();

    await discoverCameras();

  }

);



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

        function (device) {

          return (
            device.kind ===
            'videoinput'
          );

        }

      );


    populateCameraList();


  } catch (error) {

    console.error(
      error
    );

  }

}



/**
 * ==========================================================
 * CAMERA SELECT
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


    document
      .getElementById(
        'cameraPlaceholder'
      )
      .classList
      .add(
        'hidden'
      );


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
      track.getSettings();


    currentDeviceId =
      settings.deviceId ||
      null;


    await discoverCameras();


    syncCameraSelector();


    setSystemStatus(
      'Camera ready',
      true
    );


  } catch (error) {

    console.error(
      error
    );


    handleCameraError(
      error
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
 * CAMERA ERROR
 * ==========================================================
 */

function handleCameraError(
  error
) {

  let message =
    'Camera could not be started.';


  if (
    error.name ===
    'NotAllowedError'
  ) {

    message =
      'Camera permission was denied.';

  }


  if (
    error.name ===
    'NotFoundError'
  ) {

    message =
      'No camera was detected.';

  }


  if (
    error.name ===
    'NotReadableError'
  ) {

    message =
      'Camera is being used by another application.';

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


  currentDeviceId =
    select.value;


  await startCamera(
    currentDeviceId
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


  await startCamera(

    videoDevices[
      currentCameraIndex
    ].deviceId

  );

}



/**
 * ==========================================================
 * SCAN MAC
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
    !video.videoWidth ||
    !video.videoHeight
  ) {

    showMessage(
      'Camera is not ready.',
      'warning'
    );

    return;

  }


  ocrBusy =
    true;


  const button =
    document.getElementById(
      'scanBtn'
    );


  button.disabled =
    true;


  try {

    setOCRStatus(

      true,

      'Capturing image...',

      'Keep the MAC Address inside the frame'

    );


    const canvas =
      captureCameraFrame(
        video
      );


    await runFastOCR(
      canvas
    );


  } catch (error) {

    console.error(
      error
    );


    showMessage(

      'OCR error: ' +
      error.message,

      'error'

    );


  } finally {

    ocrBusy =
      false;


    button.disabled =
      false;


    setOCRStatus(
      false
    );

  }

}



/**
 * ==========================================================
 * CAMERA CAPTURE
 * ==========================================================
 */

function captureCameraFrame(
  video
) {

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


  const cropWidth =
    Math.floor(
      width *
      0.90
    );


  const cropHeight =
    Math.floor(
      height *
      0.52
    );


  const startX =
    Math.floor(
      (
        width -
        cropWidth
      ) / 2
    );


  const startY =
    Math.floor(
      (
        height -
        cropHeight
      ) / 2
    );


  canvas.width =
    cropWidth *
    2;


  canvas.height =
    cropHeight *
    2;


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
 * FAST OCR
 * ==========================================================
 */

async function runFastOCR(
  sourceCanvas
) {

  const worker =
    await getOCRWorker();


  const variants = [

    {
      name:
        'Original',

      canvas:
        cloneCanvas(
          sourceCanvas
        )
    },

    {
      name:
        'High Contrast',

      canvas:
        createHighContrastCanvas(
          sourceCanvas
        )
    },

    {
      name:
        'Threshold',

      canvas:
        createThresholdCanvas(
          sourceCanvas
        )
    }

  ];


  let bestCandidate =
    null;


  for (
    let i = 0;
    i < variants.length;
    i++
  ) {

    setOCRStatus(

      true,

      'Reading MAC Address...',

      variants[i].name +
      ' • ' +
      (i + 1) +
      '/' +
      variants.length

    );


    const result =
      await worker.recognize(
        variants[i].canvas
      );


    const text =
      result &&
      result.data
        ? result.data.text || ''
        : '';


    console.log(
      'OCR ' +
      variants[i].name +
      ':',
      text
    );


    const candidate =
      findBestMacCandidate(
        text
      );


    if (
      candidate
    ) {

      bestCandidate =
        candidate;


      /*
       * V1.1.1 deliberately exits early.
       *
       * If a valid MAC pattern is found,
       * show it immediately.
       */

      break;

    }

  }


  if (
    bestCandidate
  ) {

    setDetectedMac(
      bestCandidate
    );


    return;

  }


  setMacState(
    'invalid',
    'MAC NOT FOUND'
  );


  document
    .getElementById(
      'macValidation'
    )
    .textContent =
    'Could not detect a MAC Address. Move closer and try again.';


  document
    .getElementById(
      'saveBtn'
    )
    .disabled =
    true;


  showMessage(

    'MAC Address not detected. Try moving closer to the text.',

    'warning'

  );

}



/**
 * ==========================================================
 * OCR WORKER
 * ==========================================================
 */

async function getOCRWorker() {

  if (
    ocrWorker
  ) {

    return ocrWorker;

  }


  setOCRStatus(

    true,

    'Loading OCR engine...',

    'First scan may take a few seconds'

  );


  ocrWorker =
    await Tesseract
      .createWorker(
        'eng'
      );


  await ocrWorker.setParameters({

    preserve_interword_spaces:
      '1',

    tessedit_pageseg_mode:
      '6'

  });


  return ocrWorker;

}



/**
 * ==========================================================
 * FIND MAC CANDIDATE
 * ==========================================================
 */

function findBestMacCandidate(
  text
) {

  if (
    !text
  ) {

    return null;

  }


  const source =
    String(text)
      .toUpperCase();


  console.log(
    'OCR source:',
    source
  );


  /**
   * Standard MAC:
   *
   * AA:BB:CC:DD:EE:FF
   */

  let match =
    source.match(
      /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/
    );


  if (
    match
  ) {

    return normalizeMac(
      match[0]
    );

  }


  /**
   * Dash:
   *
   * AA-BB-CC-DD-EE-FF
   */

  match =
    source.match(
      /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/
    );


  if (
    match
  ) {

    return normalizeMac(
      match[0]
    );

  }


  /**
   * Spaces:
   *
   * AA BB CC DD EE FF
   */

  match =
    source.match(
      /(?:[0-9A-F]{2}\s+){5}[0-9A-F]{2}/
    );


  if (
    match
  ) {

    return normalizeMac(
      match[0]
    );

  }


  /**
   * Cisco:
   *
   * AABB.CCDD.EEFF
   */

  match =
    source.match(
      /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/
    );


  if (
    match
  ) {

    return normalizeMac(
      match[0]
    );

  }


  /**
   * Compact:
   *
   * AABBCCDDEEFF
   */

  match =
    source.match(
      /\b[0-9A-F]{12}\b/
    );


  if (
    match
  ) {

    return normalizeMac(
      match[0]
    );

  }


  /**
   * OCR-cleaned search.
   *
   * Remove obvious whitespace and punctuation
   * between hexadecimal characters.
   */

  const cleaned =
    source.replace(
      /[^0-9A-F]/g,
      ''
    );


  /**
   * V1.1.1 allowed sliding search.
   *
   * This made it more permissive than later versions.
   */

  if (
    cleaned.length >=
    12
  ) {

    for (
      let i = 0;
      i <= cleaned.length - 12;
      i++
    ) {

      const part =
        cleaned.substring(
          i,
          i + 12
        );


      if (
        /^[0-9A-F]{12}$/
          .test(
            part
          )
      ) {

        return normalizeMac(
          part
        );

      }

    }

  }


  return null;

}



/**
 * ==========================================================
 * DETECTED MAC
 * ==========================================================
 */

function setDetectedMac(
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


  setMacState(
    'valid',
    'MAC DETECTED'
  );


  document
    .getElementById(
      'macValidation'
    )
    .textContent =
    'Valid MAC Address detected by OCR.';


  document
    .getElementById(
      'macValidation'
    )
    .style.color =
    '#16864b';


  document
    .getElementById(
      'saveBtn'
    )
    .disabled =
    false;


  showMessage(

    'MAC detected: ' +
    normalized,

    'success'

  );


  vibrateSuccess();

}



/**
 * ==========================================================
 * PHOTO OCR
 * ==========================================================
 */

function scanUploadedPhoto(
  event
) {

  const file =
    event.target.files[0];


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

      const image =
        new Image();


      image.onload =
        async function () {

          if (
            ocrBusy
          ) {

            return;

          }


          ocrBusy =
            true;


          try {

            const canvas =
              document.createElement(
                'canvas'
              );


            let width =
              image.width;


            let height =
              image.height;


            const maxWidth =
              2000;


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


            const context =
              canvas.getContext(
                '2d',
                {
                  willReadFrequently:
                    true
                }
              );


            context.drawImage(

              image,

              0,
              0,

              width,
              height

            );


            await runFastOCR(
              canvas
            );


          } catch (error) {

            showMessage(

              'OCR error: ' +
              error.message,

              'error'

            );


          } finally {

            ocrBusy =
              false;


            setOCRStatus(
              false
            );

          }

        };


      image.src =
        e.target.result;

    };


  reader.readAsDataURL(
    file
  );

}



/**
 * ==========================================================
 * IMAGE VARIANTS
 * ==========================================================
 */

function cloneCanvas(
  source
) {

  const canvas =
    document.createElement(
      'canvas'
    );


  canvas.width =
    source.width;


  canvas.height =
    source.height;


  const context =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  context.drawImage(
    source,
    0,
    0
  );


  return canvas;

}



/**
 * ==========================================================
 * HIGH CONTRAST
 * ==========================================================
 */

function createHighContrastCanvas(
  source
) {

  const canvas =
    cloneCanvas(
      source
    );


  const context =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  const image =
    context.getImageData(

      0,
      0,

      canvas.width,
      canvas.height

    );


  const data =
    image.data;


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const gray =

      (
        data[i] *
        0.299
      )

      +

      (
        data[i + 1] *
        0.587
      )

      +

      (
        data[i + 2] *
        0.114
      );


    let value =
      (
        gray -
        128
      ) *
      1.6 +
      128;


    value =
      Math.max(
        0,
        Math.min(
          255,
          value
        )
      );


    data[i] =
      value;


    data[i + 1] =
      value;


    data[i + 2] =
      value;

  }


  context.putImageData(
    image,
    0,
    0
  );


  return canvas;

}



/**
 * ==========================================================
 * THRESHOLD
 * ==========================================================
 */

function createThresholdCanvas(
  source
) {

  const canvas =
    cloneCanvas(
      source
    );


  const context =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  const image =
    context.getImageData(

      0,
      0,

      canvas.width,
      canvas.height

    );


  const data =
    image.data;


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const gray =

      (
        data[i] *
        0.299
      )

      +

      (
        data[i + 1] *
        0.587
      )

      +

      (
        data[i + 2] *
        0.114
      );


    const value =
      gray >
      145
        ? 255
        : 0;


    data[i] =
      value;


    data[i + 1] =
      value;


    data[i + 2] =
      value;

  }


  context.putImageData(
    image,
    0,
    0
  );


  return canvas;

}



/**
 * ==========================================================
 * MAC INPUT
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
      );


  clean =
    clean.substring(
      0,
      12
    );


  const pieces =
    [];


  for (
    let i = 0;
    i < clean.length;
    i += 2
  ) {

    pieces.push(
      clean.substring(
        i,
        i + 2
      )
    );

  }


  input.value =
    pieces.join(
      ':'
    );


  validateMac();

}



/**
 * ==========================================================
 * VALIDATE MAC
 * ==========================================================
 */

function validateMac() {

  const input =
    document.getElementById(
      'macInput'
    );


  const save =
    document.getElementById(
      'saveBtn'
    );


  const validation =
    document.getElementById(
      'macValidation'
    );


  const mac =
    normalizeMac(
      input.value
    );


  if (
    mac
  ) {

    input.value =
      mac;


    setMacState(
      'valid',
      'VALID MAC'
    );


    validation.textContent =
      'Valid MAC Address.';


    validation.style.color =
      '#16864b';


    save.disabled =
      false;


    return true;

  }


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


  save.disabled =
    true;


  return false;

}



/**
 * ==========================================================
 * NORMALIZE MAC
 * ==========================================================
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
    .join(':');

}



/**
 * ==========================================================
 * SAVE
 * ==========================================================
 */

function saveAndNext() {

  if (
    !validateMac()
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


        validateMac();


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


      } else if (
        result.type ===
        'duplicate'
      ) {

        button.disabled =
          false;


        showMessage(

          'Duplicate MAC: ' +
          result.mac,

          'warning'

        );


      } else {

        button.disabled =
          false;


        showMessage(

          result.message ||
          'Save failed.',

          'error'

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
 * ==========================================================
 * DASHBOARD
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
 * JSONP API
 * ==========================================================
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

    showMessage(

      'API URL has not been configured in app.js.',

      'error'

    );


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


        showMessage(

          'Server timeout.',

          'error'

        );


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


      showMessage(

        'Could not connect to Apps Script.',

        'error'

      );


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
 * RECENT
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

  title,

  progress

) {

  const box =
    document.getElementById(
      'ocrStatus'
    );


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
 * ==========================================================
 * MAC STATE
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


  status.innerHTML =

    '<span class="statusDot"></span>' +

    escapeHtml(
      text
    );


  const dot =
    status.querySelector(
      '.statusDot'
    );


  dot.style.background =

    ready
      ? '#4cea92'
      : '#ff7474';

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
 * ==========================================================
 * HAPTIC
 * ==========================================================
 */

function vibrateSuccess() {

  if (
    navigator.vibrate
  ) {

    navigator.vibrate([
      70,
      40,
      70
    ]);

  }

}



/**
 * ==========================================================
 * SECURITY
 * ==========================================================
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


  return String(value)

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
