/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * V1.1.1
 * Fast MAC Recognition
 *
 * External Camera Engine
 * ==========================================================
 */


/**
 * ==========================================================
 * CONFIGURATION
 *
 * IMPORTANT:
 * Replace the value below with your Apps Script /exec URL.
 * ==========================================================
 */

const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbzDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';



/**
 * ==========================================================
 * GLOBAL STATE
 * ==========================================================
 */

let cameraStream = null;

let videoDevices = [];

let currentDeviceId = null;

let currentCameraIndex = 0;

let ocrWorker = null;

let ocrBusy = false;



/**
 * ==========================================================
 * STARTUP
 * ==========================================================
 */

document.addEventListener(
  'DOMContentLoaded',
  async function () {

    handleMacInput();

    loadDashboard();

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
      'This browser does not support camera access.',
      'error'
    );

    return;

  }


  try {

    const devices =
      await navigator.mediaDevices.enumerateDevices();


    videoDevices =
      devices.filter(
        function (device) {

          return (
            device.kind === 'videoinput'
          );

        }
      );


    populateCameraList();


  } catch (error) {

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


  select.innerHTML = '';


  if (
    videoDevices.length === 0
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


    setSystemStatus(
      'Camera ready',
      true
    );


  } catch (error) {

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
      function (track) {

        track.stop();

      }
    );


  cameraStream =
    null;

}



/**
 * ==========================================================
 * CAMERA ERROR HANDLER
 * ==========================================================
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
        'Camera permission was denied. Please allow camera access in your browser settings.';

      break;


    case 'NotFoundError':

      message =
        'No camera was detected on this device.';

      break;


    case 'NotReadableError':

      message =
        'The camera may already be used by another application. Close other camera applications and try again.';

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
 * SYNC CAMERA SELECT
 * ==========================================================
 */

function syncCameraSelector() {

  const select =
    document.getElementById(
      'cameraSelect'
    );


  if (
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
    videoDevices.length < 2
  ) {

    showMessage(
      'Only one camera is available.',
      'warning'
    );

    return;

  }


  const currentIndex =
    videoDevices.findIndex(
      function (device) {

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
 * ==========================================================
 * SCAN CAMERA
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
    !video.videoWidth ||
    !video.videoHeight
  ) {

    showMessage(
      'Camera is not ready.',
      'warning'
    );

    return;

  }


  const canvas =
    document.getElementById(
      'captureCanvas'
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


  /*
   * V1.1.1:
   * use a slightly taller capture area
   * because many labels contain MAC on a second line.
   */

  const cropWidth =
    Math.floor(
      sourceWidth *
      0.94
    );


  const cropHeight =
    Math.floor(
      sourceHeight *
      0.66
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


  canvas.width =
    cropWidth;


  canvas.height =
    cropHeight;


  ctx.drawImage(

    video,

    startX,
    startY,

    cropWidth,
    cropHeight,

    0,
    0,

    cropWidth,
    cropHeight

  );


  await runSmartOCR(
    canvas
  );

}



/**
 * ==========================================================
 * PHOTO / IMAGE
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
    function (e) {

      const img =
        new Image();


      img.onload =
        async function () {

          const canvas =
            document.getElementById(
              'captureCanvas'
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
            2200;


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


          await runSmartOCR(
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
 * ==========================================================
 * CLONE CANVAS
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


  const ctx =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  ctx.drawImage(
    source,
    0,
    0
  );


  return canvas;

}



/**
 * ==========================================================
 * CONTRAST VERSION
 * ==========================================================
 */

function createContrastCanvas(
  source
) {

  const canvas =
    cloneCanvas(
      source
    );


  const ctx =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  const imageData =
    ctx.getImageData(

      0,
      0,

      canvas.width,
      canvas.height

    );


  const data =
    imageData.data;


  const contrast =
    1.65;


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const gray =

      data[i] *
      0.299

      +

      data[i + 1] *
      0.587

      +

      data[i + 2] *
      0.114;


    let value =

      (
        gray -
        128
      )

      *

      contrast

      +

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


  ctx.putImageData(

    imageData,

    0,
    0

  );


  return canvas;

}



/**
 * ==========================================================
 * THRESHOLD VERSION
 * ==========================================================
 */

function createThresholdCanvas(
  source
) {

  const canvas =
    cloneCanvas(
      source
    );


  const ctx =
    canvas.getContext(
      '2d',
      {
        willReadFrequently:
          true
      }
    );


  const imageData =
    ctx.getImageData(

      0,
      0,

      canvas.width,
      canvas.height

    );


  const data =
    imageData.data;


  /*
   * Threshold tuned for printed labels.
   */

  const threshold =
    155;


  for (
    let i = 0;
    i < data.length;
    i += 4
  ) {

    const gray =

      data[i] *
      0.299

      +

      data[i + 1] *
      0.587

      +

      data[i + 2] *
      0.114;


    const value =
      gray >= threshold
        ? 255
        : 0;


    data[i] =
      value;


    data[i + 1] =
      value;


    data[i + 2] =
      value;

  }


  ctx.putImageData(

    imageData,

    0,
    0

  );


  return canvas;

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

    'First scan may take a few seconds.'

  );


  ocrWorker =
    await Tesseract.createWorker(

      'eng',

      1,

      {

        logger:
          function (message) {

            if (
              message.status &&
              message.progress !==
                undefined
            ) {

              const percentage =
                Math.round(
                  message.progress *
                  100
                );


              setOCRStatus(

                true,

                'Reading label...',

                message.status +
                ' ' +
                percentage +
                '%'

              );

            }

          }

      }

    );


  /*
   * Optimisation for MAC addresses.
   *
   * We intentionally keep MAC label letters too,
   * because some devices print:
   *
   * MAC:
   * WLAN MAC:
   * Ethernet MAC:
   */

  await ocrWorker.setParameters({

    tessedit_char_whitelist:
      '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:-. ',

    preserve_interword_spaces:
      '1'

  });


  return ocrWorker;

}



/**
 * ==========================================================
 * SMART MULTI-PASS OCR
 * ==========================================================
 */

async function runSmartOCR(
  originalCanvas
) {

  if (
    ocrBusy
  ) {

    return;

  }


  ocrBusy =
    true;


  const scanBtn =
    document.getElementById(
      'scanBtn'
    );


  scanBtn.disabled =
    true;


  setOCRStatus(

    true,

    'Analysing label...',

    'OCR pass 1 of 3'

  );


  try {

    const worker =
      await getOCRWorker();


    /*
     * Three image variants.
     */

    const variants = [

      {
        name:
          'Original',

        canvas:
          cloneCanvas(
            originalCanvas
          )
      },

      {
        name:
          'High contrast',

        canvas:
          createContrastCanvas(
            originalCanvas
          )
      },

      {
        name:
          'Black & white',

        canvas:
          createThresholdCanvas(
            originalCanvas
          )
      }

    ];


    let detectedMac =
      null;


    let allOCRText =
      '';


    for (
      let i = 0;
      i < variants.length;
      i++
    ) {

      const variant =
        variants[i];


      setOCRStatus(

        true,

        'Reading ' +
        variant.name +
        '...',

        'OCR pass ' +
        (i + 1) +
        ' of ' +
        variants.length

      );


      const result =
        await worker.recognize(
          variant.canvas
        );


      const text =
        result &&
        result.data
          ? result.data.text || ''
          : '';


      console.log(

        'OCR ' +
        variant.name +
        ':',

        text

      );


      allOCRText +=

        '\n--- ' +
        variant.name +
        ' ---\n' +

        text;


      detectedMac =
        extractMacAddress(
          text
        );


      if (
        detectedMac
      ) {

        break;

      }

    }


    /*
     * Last attempt:
     * combine all OCR results.
     */

    if (
      !detectedMac
    ) {

      detectedMac =
        extractMacAddress(
          allOCRText
        );

    }


    if (
      detectedMac
    ) {

      document
        .getElementById(
          'macInput'
        )
        .value =
        detectedMac;


      validateMacUI();


      setOCRStatus(
        false
      );


      vibrateSuccess();


      showMessage(

        'MAC detected: ' +
        detectedMac,

        'success'

      );


    } else {

      setOCRStatus(
        false
      );


      setMacState(

        'invalid',

        'MAC not detected'

      );


      showMessage(

        'MAC not detected. Move closer so the MAC address fills most of the green scan area and try again.',

        'warning'

      );

    }


  } catch (error) {

    console.error(
      'OCR error:',
      error
    );


    setOCRStatus(
      false
    );


    showMessage(

      'OCR error: ' +
      error.message,

      'error'

    );


  } finally {

    ocrBusy =
      false;


    if (
      cameraStream
    ) {

      scanBtn.disabled =
        false;

    }

  }

}



/**
 * ==========================================================
 * MAC EXTRACTION
 * ==========================================================
 */

function extractMacAddress(
  text
) {

  if (
    !text
  ) {

    return null;

  }


  let upper =
    String(text)
      .toUpperCase()
      .replace(
        /\r/g,
        '\n'
      );


  /*
   * ========================================================
   * PASS 1
   *
   * Standard MAC formats
   * ========================================================
   */

  const strictPatterns = [

    /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g,

    /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g,

    /\b[0-9A-F]{12}\b/g,

    /(?:[0-9A-F]{2}\s+){5}[0-9A-F]{2}/g,

    /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g

  ];


  for (
    const pattern
    of strictPatterns
  ) {

    const matches =
      upper.match(
        pattern
      );


    if (
      matches
    ) {

      for (
        const match
        of matches
      ) {

        const mac =
          normalizeMac(
            match
          );


        if (
          mac
        ) {

          return mac;

        }

      }

    }

  }


  /*
   * ========================================================
   * PASS 2
   *
   * Analyse line by line.
   * ========================================================
   */

  const lines =
    upper.split(
      '\n'
    );


  const keywords = [

    'MAC',

    'MAC ADDRESS',

    'MACADDRESS',

    'WLAN',

    'WIRELESS',

    'WI-FI',

    'WIFI',

    'ETHERNET',

    'LAN'

  ];


  /*
   * Prioritize lines mentioning MAC/WLAN.
   */

  const orderedLines = [

    ...lines.filter(
      function (line) {

        return keywords.some(
          function (keyword) {

            return line.includes(
              keyword
            );

          }
        );

      }
    ),

    ...lines.filter(
      function (line) {

        return !keywords.some(
          function (keyword) {

            return line.includes(
              keyword
            );

          }
        );

      }
    )

  ];


  for (
    const originalLine
    of orderedLines
  ) {

    const mac =
      extractMacFromLooseLine(
        originalLine
      );


    if (
      mac
    ) {

      return mac;

    }

  }


  return null;

}



/**
 * ==========================================================
 * LOOSE OCR MAC EXTRACTION
 * ==========================================================
 */

function extractMacFromLooseLine(
  line
) {

  if (
    !line
  ) {

    return null;

  }


  /*
   * First retain separators,
   * but remove unusual punctuation.
   */

  let cleaned =
    String(line)
      .toUpperCase()
      .replace(
        /[^0-9A-Z:\-\.\s]/g,
        ' '
      );


  /*
   * Split into reasonable candidate strings.
   */

  const pieces =
    cleaned.split(
      /\s{2,}|[,;=]+/
    );


  for (
    let piece
    of pieces
  ) {

    /*
     * Try original piece first.
     */

    let mac =
      normalizeMacCandidate(
        piece
      );


    if (
      mac
    ) {

      return mac;

    }


    /*
     * OCR correction version.
     */

    const corrected =
      applyOCRCorrections(
        piece
      );


    mac =
      normalizeMacCandidate(
        corrected
      );


    if (
      mac
    ) {

      return mac;

    }

  }


  /*
   * Last fallback:
   * sliding candidate detection.
   */

  const correctedLine =
    applyOCRCorrections(
      cleaned
    );


  const compact =
    correctedLine
      .replace(
        /[^0-9A-F]/g,
        ''
      );


  if (
    compact.length >= 12
  ) {

    for (
      let i = 0;
      i <= compact.length - 12;
      i++
    ) {

      const candidate =
        compact.substring(
          i,
          i + 12
        );


      if (
        /^[0-9A-F]{12}$/
          .test(
            candidate
          )
      ) {

        return formatMac(
          candidate
        );

      }

    }

  }


  return null;

}



/**
 * ==========================================================
 * OCR CORRECTIONS
 * ==========================================================
 */

function applyOCRCorrections(
  value
) {

  return String(value)

    .toUpperCase()

    /*
     * Frequent OCR confusion.
     */

    .replace(
      /O/g,
      '0'
    )

    .replace(
      /Q/g,
      '0'
    )

    .replace(
      /I/g,
      '1'
    )

    .replace(
      /L/g,
      '1'
    )

    .replace(
      /S/g,
      '5'
    )

    .replace(
      /G/g,
      '6'
    )

    /*
     * These corrections are intentionally
     * conservative because B/D are valid hex.
     */

    .replace(
      /\|/g,
      '1'
    );

}



/**
 * ==========================================================
 * NORMALIZE CANDIDATE
 * ==========================================================
 */

function normalizeMacCandidate(
  value
) {

  if (
    !value
  ) {

    return null;

  }


  /*
   * Conventional MAC with separators.
   */

  const standard =
    String(value).match(
      /(?:[0-9A-F]{2}[:-]){5}[0-9A-F]{2}/
    );


  if (
    standard
  ) {

    return normalizeMac(
      standard[0]
    );

  }


  /*
   * Cisco form:
   * AABB.CCDD.EEFF
   */

  const dotted =
    String(value).match(
      /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/
    );


  if (
    dotted
  ) {

    return normalizeMac(
      dotted[0]
    );

  }


  /*
   * Remove separators.
   */

  const compact =
    String(value)
      .replace(
        /[^0-9A-F]/g,
        ''
      );


  if (
    compact.length === 12
  ) {

    return formatMac(
      compact
    );

  }


  return null;

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


  return formatMac(
    clean
  );

}



/**
 * ==========================================================
 * FORMAT MAC
 * ==========================================================
 */

function formatMac(
  clean
) {

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
 * MANUAL MAC INPUT
 * ==========================================================
 */

function handleMacInput() {

  const input =
    document.getElementById(
      'macInput'
    );


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


  validateMacUI();

}



/**
 * ==========================================================
 * VALIDATION
 * ==========================================================
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


  const mac =
    normalizeMac(
      input.value
    );


  if (
    mac
  ) {

    input.value =
      mac;


    validation.textContent =
      'Valid MAC Address';


    validation.style.color =
      '#16864b';


    setMacState(

      'valid',

      'Valid MAC detected'

    );


    saveBtn.disabled =
      false;


    return true;

  }


  if (
    !input.value
  ) {

    validation.textContent =
      '';


    setMacState(

      'waiting',

      'Waiting for scan'

    );


  } else {

    validation.textContent =
      'Incomplete or invalid MAC Address';


    validation.style.color =
      '#d63b3b';


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
 * ==========================================================
 * SAVE
 * ==========================================================
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

    function (result) {

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


        if (
          result.existing &&
          result.existing.device
        ) {

          message +=

            ' • Device: ' +
            result.existing.device;

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

    function (data) {

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
 * API REQUEST
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

          'Server timeout. Check the Apps Script deployment.',

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
    function (data) {

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
    !items ||
    items.length === 0
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
        function (item) {

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
    type === 'success'
  ) {

    box.classList.add(
      'messageSuccess'
    );


  } else if (
    type === 'warning'
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
 * HAPTIC FEEDBACK
 * ==========================================================
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
