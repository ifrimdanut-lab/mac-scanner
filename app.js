/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.3
 * Strict Character Consensus
 *
 * External Camera Engine
 * ==========================================================
 */


/**
 * ==========================================================
 * CONFIGURATION
 * ==========================================================
 */

const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbzDAauThmGXzKtRIYZMbgutyJI3XO_r5uRLuLhqTG8putr6wpGcfE38_dmYmdEi9XY/exec';


const APP_VERSION =
  'V1.1.3';


const CAMERA_CAPTURE_COUNT =
  4;


const CAPTURE_INTERVAL_MS =
  300;


const INITIAL_STABILIZE_MS =
  500;


/**
 * Every captured frame is OCR'd using:
 * 1. Original
 * 2. High contrast
 * 3. Threshold
 *
 * Max theoretical readings:
 * 4 x 3 = 12
 */

const MIN_VALID_READINGS =
  4;


/**
 * Character-level consensus:
 *
 * Example:
 * 8 of 10 valid readings must agree
 * on each individual hex position.
 */

const CHARACTER_CONSENSUS_RATIO =
  0.78;


/**
 * At least this many exact full MAC
 * occurrences strengthen confidence.
 */

const MIN_EXACT_FULL_MATCHES =
  2;



/**
 * ==========================================================
 * GLOBAL STATE
 * ==========================================================
 */

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


let macVerification = {

  mode:
    'none',

  confirmed:
    false,

  confidence:
    '',

  details:
    '',

  mac:
    ''

};



/**
 * ==========================================================
 * STARTUP
 * ==========================================================
 */

document.addEventListener(

  'DOMContentLoaded',

  async function () {


    updateVersionUI();


    handleMacInput();


    loadDashboard();


    await discoverCameras();


  }

);



/**
 * ==========================================================
 * VERSION UI
 * ==========================================================
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

      'ICHC MAC Scanner • Strict Character Consensus • ' +

      APP_VERSION;

  }

}



/**
 * ==========================================================
 * HELPER DELAY
 * ==========================================================
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


  switch (
    error.name
  ) {


    case 'NotAllowedError':

      message =

        'Camera permission was denied. Allow camera access in your browser settings.';

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
 * RESET VERIFICATION
 * ==========================================================
 */

function resetVerification() {


  macVerification = {

    mode:
      'none',

    confirmed:
      false,

    confidence:
      '',

    details:
      '',

    mac:
      ''

  };

}



/**
 * ==========================================================
 * MAIN CAMERA SCAN
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


  resetVerification();


  ocrBusy =
    true;


  const scanBtn =

    document.getElementById(
      'scanBtn'
    );


  scanBtn.disabled =
    true;


  try {


    setOCRStatus(

      true,

      'Stabilizing camera...',

      'Keep the MAC label inside the scan area'

    );


    await sleep(
      INITIAL_STABILIZE_MS
    );


    const frames =
      [];


    for (

      let i = 0;

      i <
      CAMERA_CAPTURE_COUNT;

      i++

    ) {


      setOCRStatus(

        true,

        'Capturing...',

        'Frame ' +
        (i + 1) +
        ' of ' +
        CAMERA_CAPTURE_COUNT

      );


      frames.push(

        captureVideoFrame(
          video
        )

      );


      if (

        i <
        CAMERA_CAPTURE_COUNT - 1

      ) {


        await sleep(
          CAPTURE_INTERVAL_MS
        );


      }


    }


    await processStrictConsensus(
      frames
    );


  } catch (
    error
  ) {


    console.error(

      'Strict consensus error:',

      error

    );


    rejectStrictScan(

      'Scan failed: ' +
      error.message

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
 * CAPTURE CAMERA FRAME
 *
 * Crop tighter than previous versions.
 * ==========================================================
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


  const cropWidth =

    Math.floor(

      sourceWidth *
      0.86

    );


  const cropHeight =

    Math.floor(

      sourceHeight *
      0.42

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


  /**
   * Upscale 2x before OCR.
   */

  canvas.width =
    cropWidth * 2;


  canvas.height =
    cropHeight * 2;


  ctx.imageSmoothingEnabled =
    true;


  ctx.imageSmoothingQuality =
    'high';


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
 * ==========================================================
 * STRICT CONSENSUS PROCESS
 * ==========================================================
 */

async function processStrictConsensus(
  frames
) {


  const worker =
    await getOCRWorker();


  const allCandidates =
    [];


  for (

    let frameIndex = 0;

    frameIndex <
    frames.length;

    frameIndex++

  ) {


    const frame =
      frames[
        frameIndex
      ];


    const variants = [

      {
        name:
          'original',

        canvas:
          cloneCanvas(
            frame
          )
      },

      {
        name:
          'contrast',

        canvas:
          createContrastCanvas(
            frame
          )
      },

      {
        name:
          'threshold',

        canvas:
          createThresholdCanvas(
            frame
          )
      }

    ];


    for (

      let variantIndex = 0;

      variantIndex <
      variants.length;

      variantIndex++

    ) {


      const variant =
        variants[
          variantIndex
        ];


      setOCRStatus(

        true,

        'Strict OCR analysis...',

        'Frame ' +
        (frameIndex + 1) +
        '/' +
        frames.length +
        ' • ' +
        variant.name

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

        'OCR frame ' +
        (frameIndex + 1) +
        ' ' +
        variant.name +
        ':',

        text

      );


      const candidates =

        extractStrictMacCandidates(
          text
        );


      candidates.forEach(

        function (
          candidate
        ) {


          allCandidates.push({

            mac:
              candidate.mac,

            score:
              candidate.score,

            labeled:
              candidate.labeled,

            frame:
              frameIndex + 1,

            variant:
              variant.name

          });


        }

      );


    }


  }


  console.log(

    'ALL STRICT CANDIDATES:',

    allCandidates

  );


  evaluateCharacterConsensus(
    allCandidates
  );

}



/**
 * ==========================================================
 * STRICT CHARACTER CONSENSUS
 * ==========================================================
 */

function evaluateCharacterConsensus(
  candidates
) {


  if (

    !candidates ||

    candidates.length <
    MIN_VALID_READINGS

  ) {


    rejectStrictScan(

      'Not enough reliable OCR readings.'

    );


    return;

  }


  const compactReadings =

    candidates

      .map(

        function (
          candidate
        ) {


          return candidate.mac
            .replace(
              /:/g,
              ''
            );


        }

      )

      .filter(

        function (
          mac
        ) {


          return (
            /^[0-9A-F]{12}$/
              .test(
                mac
              )
          );


        }

      );


  if (

    compactReadings.length <
    MIN_VALID_READINGS

  ) {


    rejectStrictScan(

      'Not enough valid MAC readings.'

    );


    return;

  }


  const finalChars =
    [];


  const positionConfidence =
    [];


  for (

    let pos = 0;

    pos < 12;

    pos++

  ) {


    const frequency =
      {};


    compactReadings.forEach(

      function (
        reading
      ) {


        const char =
          reading[pos];


        frequency[char] =

          (
            frequency[char] ||
            0
          ) + 1;


      }

    );


    let bestChar =
      null;


    let bestCount =
      0;


    Object.keys(
      frequency
    ).forEach(

      function (
        char
      ) {


        if (

          frequency[char] >
          bestCount

        ) {


          bestChar =
            char;


          bestCount =
            frequency[char];


        }


      }

    );


    const ratio =

      bestCount /
      compactReadings.length;


    positionConfidence.push(
      ratio
    );


    if (

      ratio <
      CHARACTER_CONSENSUS_RATIO

    ) {


      console.warn(

        'Character consensus failed at position',

        pos,

        frequency

      );


      rejectStrictScan(

        'One or more MAC characters are ambiguous.'

      );


      return;

    }


    finalChars.push(
      bestChar
    );


  }


  const finalCompact =

    finalChars.join(
      ''
    );


  const finalMac =

    formatMac(
      finalCompact
    );


  /**
   * ========================================================
   * FULL-MAC SUPPORT CHECK
   * ========================================================
   */

  let exactFullMatches =
    0;


  compactReadings.forEach(

    function (
      reading
    ) {


      if (
        reading ===
        finalCompact
      ) {


        exactFullMatches++;


      }


    }

  );


  if (

    exactFullMatches <
    MIN_EXACT_FULL_MATCHES

  ) {


    rejectStrictScan(

      'Character consensus exists, but the full MAC is not repeated enough.'

    );


    return;

  }


  /**
   * ========================================================
   * MAC PREFIX / STRUCTURE SANITY CHECK
   * ========================================================
   */

  if (
    !isPlausibleMac(
      finalMac
    )
  ) {


    rejectStrictScan(

      'The detected value does not pass MAC sanity checks.'

    );


    return;

  }


  const weakestPosition =

    Math.min(
      ...positionConfidence
    );


  let confidence =
    'GOOD';


  if (

    weakestPosition >= 0.90 &&

    exactFullMatches >= 4

  ) {


    confidence =
      'HIGH';


  }


  acceptStrictMac(

    finalMac,

    confidence,

    compactReadings.length,

    exactFullMatches,

    weakestPosition

  );

}



/**
 * ==========================================================
 * MAC SANITY CHECK
 * ==========================================================
 */

function isPlausibleMac(
  mac
) {


  const compact =

    String(mac)

      .replace(
        /:/g,
        ''
      )

      .toUpperCase();


  if (
    !/^[0-9A-F]{12}$/
      .test(
        compact
      )
  ) {


    return false;


  }


  /**
   * Reject impossible / placeholder values.
   */

  const blocked = [

    '000000000000',

    'FFFFFFFFFFFF',

    '111111111111'

  ];


  if (
    blocked.includes(
      compact
    )
  ) {


    return false;


  }


  return true;

}



/**
 * ==========================================================
 * ACCEPT STRICT MAC
 * ==========================================================
 */

function acceptStrictMac(

  mac,

  confidence,

  totalReadings,

  exactMatches,

  weakestRatio

) {


  const input =

    document.getElementById(
      'macInput'
    );


  input.value =
    mac;


  macVerification = {

    mode:
      'strict',

    confirmed:
      true,

    confidence:
      confidence,

    details:

      exactMatches +
      ' exact matches • ' +

      totalReadings +
      ' valid readings • weakest char ' +

      Math.round(
        weakestRatio *
        100
      ) +
      '%',

    mac:
      mac

  };


  updateVerifiedMacUI();


  setOCRStatus(
    false
  );


  vibrateSuccess();


  showMessage(

    'STRICT VERIFIED: ' +
    mac,

    'success'

  );

}



/**
 * ==========================================================
 * REJECT STRICT SCAN
 * ==========================================================
 */

function rejectStrictScan(
  reason
) {


  resetVerification();


  const input =

    document.getElementById(
      'macInput'
    );


  input.value =
    '';


  const saveBtn =

    document.getElementById(
      'saveBtn'
    );


  saveBtn.disabled =
    true;


  setOCRStatus(
    false
  );


  setMacState(

    'invalid',

    'OCR UNVERIFIED'

  );


  const validation =

    document.getElementById(
      'macValidation'
    );


  validation.textContent =

    'Result rejected — ' +
    reason;


  validation.style.color =
    '#d63b3b';


  showMessage(

    reason +
    ' Move closer, keep the label flat and scan again.',

    'warning'

  );

}



/**
 * ==========================================================
 * STRICT MAC EXTRACTION
 *
 * No generic sliding-window fallback.
 * No automatic O→0 / G→6 / S→5 correction.
 * ==========================================================
 */

function extractStrictMacCandidates(
  text
) {


  if (
    !text
  ) {


    return [];


  }


  const upper =

    String(text)

      .toUpperCase()

      .replace(
        /\r/g,
        '\n'
      );


  const lines =

    upper.split(
      '\n'
    );


  const results =
    [];


  /**
   * ========================================================
   * PRIORITY 1:
   * MAC-LABELED LINES
   * ========================================================
   */

  for (

    let i = 0;

    i < lines.length;

    i++

  ) {


    const line =
      lines[i];


    if (
      isMacContextLine(
        line
      )
    ) {


      results.push(

        ...extractExactMacPatterns(

          line,

          true

        )

      );


      /**
       * Also inspect next line because some interfaces show:
       *
       * Physical address (MAC):
       * 48:EA:62:CB:B6:8B
       */

      if (

        i + 1 <
        lines.length

      ) {


        results.push(

          ...extractExactMacPatterns(

            lines[
              i + 1
            ],

            true

          )

        );


      }


    }


  }


  /**
   * ========================================================
   * PRIORITY 2:
   * Explicitly separated MAC anywhere.
   *
   * Safer than compact 12-char scanning.
   * ========================================================
   */

  lines.forEach(

    function (
      line
    ) {


      results.push(

        ...extractExactMacPatterns(

          line,

          false

        )

      );


    }

  );


  /**
   * Deduplicate within a single OCR result.
   */

  const bestByMac =
    {};


  results.forEach(

    function (
      item
    ) {


      if (

        !bestByMac[item.mac] ||

        item.score >
        bestByMac[item.mac].score

      ) {


        bestByMac[item.mac] =
          item;


      }


    }

  );


  return Object.values(
    bestByMac
  );

}



/**
 * ==========================================================
 * MAC CONTEXT LABELS
 * ==========================================================
 */

function isMacContextLine(
  line
) {


  const value =

    String(line)
      .toUpperCase();


  const labels = [

    'PHYSICAL ADDRESS',

    'PHYSICAL ADDRESS (MAC)',

    'MAC ADDRESS',

    'MACADDRESS',

    'MAC:',

    'MAC ',

    'WLAN MAC',

    'WIRELESS MAC',

    'WI-FI ADDRESS',

    'WIFI ADDRESS',

    'ETHERNET MAC',

    'LAN MAC',

    'NETWORK ADDRESS'

  ];


  return labels.some(

    function (
      label
    ) {


      return value.includes(
        label
      );


    }

  );

}



/**
 * ==========================================================
 * EXACT MAC PATTERNS
 * ==========================================================
 */

function extractExactMacPatterns(

  line,

  labeled

) {


  const results =
    [];


  const value =

    String(line)
      .toUpperCase();


  /**
   * 48:EA:62:CB:B6:8B
   */

  const colonMatches =

    value.match(
      /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g
    );


  if (
    colonMatches
  ) {


    colonMatches.forEach(

      function (
        match
      ) {


        results.push({

          mac:
            normalizeMac(
              match
            ),

          score:
            labeled
              ? 130
              : 90,

          labeled:
            labeled

        });


      }

    );


  }


  /**
   * 48-EA-62-CB-B6-8B
   */

  const dashMatches =

    value.match(
      /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g
    );


  if (
    dashMatches
  ) {


    dashMatches.forEach(

      function (
        match
      ) {


        results.push({

          mac:
            normalizeMac(
              match
            ),

          score:
            labeled
              ? 125
              : 85,

          labeled:
            labeled

        });


      }

    );


  }


  /**
   * AABB.CCDD.EEFF
   */

  const dotMatches =

    value.match(
      /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g
    );


  if (
    dotMatches
  ) {


    dotMatches.forEach(

      function (
        match
      ) {


        results.push({

          mac:
            normalizeMac(
              match
            ),

          score:
            labeled
              ? 120
              : 80,

          labeled:
            labeled

        });


      }

    );


  }


  /**
   * Compact 12-char form is accepted ONLY
   * on a MAC-labeled line.
   */

  if (
    labeled
  ) {


    const compactMatches =

      value.match(
        /\b[0-9A-F]{12}\b/g
      );


    if (
      compactMatches
    ) {


      compactMatches.forEach(

        function (
          match
        ) {


          results.push({

            mac:
              normalizeMac(
                match
              ),

            score:
              100,

            labeled:
              true

          });


        }

      );


    }


  }


  return results.filter(

    function (
      item
    ) {


      return !!item.mac;


    }

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
 * HIGH CONTRAST
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
    1.55;


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

    await Tesseract
      .createWorker(

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


  /**
   * Important:
   * no aggressive OCR substitutions.
   */

  await ocrWorker.setParameters({

    tessedit_char_whitelist:

      '0123456789ABCDEFabcdef:-.() PHYSICALMACADDRESSWLANWIFIETHERNETNETWORK',

    preserve_interword_spaces:

      '1'

  });


  return ocrWorker;

}



/**
 * ==========================================================
 * PHOTO / IMAGE
 *
 * Uses same strict character consensus across
 * three processing variants.
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
      e
    ) {


      const img =
        new Image();


      img.onload =

        async function () {


          if (
            ocrBusy
          ) {


            return;


          }


          ocrBusy =
            true;


          resetVerification();


          try {


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


            const worker =
              await getOCRWorker();


            const variants = [

              cloneCanvas(
                canvas
              ),

              createContrastCanvas(
                canvas
              ),

              createThresholdCanvas(
                canvas
              )

            ];


            const candidates =
              [];


            for (

              let i = 0;

              i < variants.length;

              i++

            ) {


              setOCRStatus(

                true,

                'Strict photo analysis...',

                'Pass ' +
                (i + 1) +
                ' of ' +
                variants.length

              );


              const result =

                await worker.recognize(
                  variants[i]
                );


              const text =

                result &&
                result.data

                  ? result.data.text || ''

                  : '';


              candidates.push(

                ...extractStrictMacCandidates(
                  text
                )

              );


            }


            evaluateCharacterConsensus(
              candidates
            );


          } catch (
            error
          ) {


            rejectStrictScan(

              'Photo OCR error: ' +
              error.message

            );


          } finally {


            ocrBusy =
              false;


          }


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
  compact
) {


  return compact

    .match(
      /.{2}/g
    )

    .join(
      ':'
    );

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

    details:
      '',

    mac:
      normalizeMac(
        input.value
      ) || ''

  };


  validateMacUI();

}



/**
 * ==========================================================
 * VERIFIED MAC UI
 * ==========================================================
 */

function updateVerifiedMacUI() {


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
    !mac
  ) {


    saveBtn.disabled =
      true;


    return;


  }


  input.value =
    mac;


  setMacState(

    'valid',

    'STRICT VERIFIED'

  );


  validation.textContent =

    'Strict verification • ' +

    macVerification.confidence +

    ' • ' +

    macVerification.details;


  validation.style.color =
    '#16864b';


  saveBtn.disabled =
    false;

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


    if (
      macVerification.confirmed
    ) {


      updateVerifiedMacUI();


      return true;


    }


    if (
      macVerification.mode ===
      'manual'
    ) {


      setMacState(

        'valid',

        'VALID FORMAT'

      );


      validation.textContent =

        'Valid format • Manual entry';


      validation.style.color =
        '#16864b';


      saveBtn.disabled =
        false;


      return true;


    }


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

      'INVALID FORMAT'

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

      'Please enter or verify a valid MAC Address.',

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

      .join(
        ''
      );

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

    7000

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
