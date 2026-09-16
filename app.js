/**
 * ==========================================================
 * ICHC MAC Scanner
 *
 * Version: V1.1.4
 * Balanced OCR Engine
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
  'V1.1.4';


/*
 * Three independent camera frames.
 */
const CAMERA_CAPTURE_COUNT =
  3;


/*
 * Each frame uses:
 * 1. Original image
 * 2. High contrast image
 *
 * Maximum OCR operations = 6.
 */
const OCR_VARIANTS_PER_FRAME =
  2;


const INITIAL_STABILIZE_MS =
  350;


const CAPTURE_INTERVAL_MS =
  250;


/*
 * Minimum number of valid OCR readings
 * required to build a consensus.
 */
const MIN_VALID_READINGS =
  2;


/*
 * Character agreement threshold.
 */
const CHARACTER_CONSENSUS_RATIO =
  0.67;


/*
 * OCR operation timeout.
 */
const OCR_TIMEOUT_MS =
  10000;



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
      'ICHC MAC Scanner • Balanced OCR Engine • ' +
      APP_VERSION;

  }

}



/**
 * ==========================================================
 * DELAY
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
 * MAIN SCAN
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

      'Keep the MAC address inside the green area'

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


    await processBalancedOCR(
      frames
    );


  } catch (
    error
  ) {

    console.error(
      'Scan error:',
      error
    );


    rejectScan(
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
 * CAPTURE FRAME
 *
 * V1.1.4 uses a larger area than V1.1.3.
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
      0.92
    );


  const cropHeight =
    Math.floor(
      sourceHeight *
      0.58
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


  /*
   * Moderate enlargement.
   *
   * 1.5x is faster than 2x on iPhone.
   */

  canvas.width =
    Math.round(
      cropWidth *
      1.5
    );


  canvas.height =
    Math.round(
      cropHeight *
      1.5
    );


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
 * BALANCED OCR ENGINE
 * ==========================================================
 */

async function processBalancedOCR(
  frames
) {

  const worker =
    await getOCRWorker();


  const readings =
    [];


  let operationNumber =
    0;


  const totalOperations =
    frames.length *
    OCR_VARIANTS_PER_FRAME;


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
          'Original',

        canvas:
          cloneCanvas(
            frame
          )
      },

      {
        name:
          'Contrast',

        canvas:
          createContrastCanvas(
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

      operationNumber++;


      const variant =
        variants[
          variantIndex
        ];


      setOCRStatus(

        true,

        'Reading MAC Address...',

        'OCR ' +
        operationNumber +
        ' of ' +
        totalOperations

      );


      try {

        const result =
          await recognizeWithTimeout(

            worker,

            variant.canvas

          );


        const text =
          result &&
          result.data
            ? result.data.text || ''
            : '';


        console.log(
          'OCR frame',
          frameIndex + 1,
          variant.name,
          text
        );


        const candidates =
          extractMacCandidates(
            text
          );


        candidates.forEach(

          function (
            candidate
          ) {

            readings.push({

              mac:
                candidate.mac,

              quality:
                candidate.quality,

              source:
                variant.name,

              frame:
                frameIndex + 1

            });

          }

        );


        /*
         * Early exit:
         *
         * if one exact MAC already appears
         * three times, there is no need to continue.
         */

        const earlyWinner =
          findExactWinner(
            readings,
            3
          );


        if (
          earlyWinner
        ) {

          console.log(
            'Early OCR consensus:',
            earlyWinner
          );


          acceptVerifiedMac(

            earlyWinner,

            'HIGH',

            readings.length,

            3

          );


          return;

        }


      } catch (
        error
      ) {

        console.warn(
          'OCR operation failed:',
          error
        );

      }

    }

  }


  evaluateReadings(
    readings
  );

}



/**
 * ==========================================================
 * OCR TIMEOUT
 * ==========================================================
 */

async function recognizeWithTimeout(
  worker,
  image
) {

  return Promise.race([

    worker.recognize(
      image
    ),

    new Promise(

      function (
        resolve,
        reject
      ) {

        setTimeout(

          function () {

            reject(
              new Error(
                'OCR timeout'
              )
            );

          },

          OCR_TIMEOUT_MS

        );

      }

    )

  ]);

}



/**
 * ==========================================================
 * FIND EARLY EXACT WINNER
 * ==========================================================
 */

function findExactWinner(
  readings,
  requiredCount
) {

  const counts =
    {};


  readings.forEach(

    function (
      reading
    ) {

      counts[
        reading.mac
      ] =
        (
          counts[
            reading.mac
          ] ||
          0
        ) + 1;

    }

  );


  let winner =
    null;


  Object.keys(
    counts
  ).forEach(

    function (
      mac
    ) {

      if (
        counts[
          mac
        ] >=
        requiredCount
      ) {

        winner =
          mac;

      }

    }

  );


  return winner;

}



/**
 * ==========================================================
 * FINAL OCR CONSENSUS
 * ==========================================================
 */

function evaluateReadings(
  readings
) {

  console.log(
    'MAC readings:',
    readings
  );


  if (
    readings.length <
    MIN_VALID_READINGS
  ) {

    rejectScan(
      'Not enough reliable MAC readings were found.'
    );

    return;

  }


  /*
   * First try exact full-MAC voting.
   */

  const counts =
    {};


  readings.forEach(

    function (
      reading
    ) {

      counts[
        reading.mac
      ] =
        (
          counts[
            reading.mac
          ] ||
          0
        ) + 1;

    }

  );


  let exactWinner =
    null;


  let exactWinnerCount =
    0;


  Object.keys(
    counts
  ).forEach(

    function (
      mac
    ) {

      if (
        counts[
          mac
        ] >
        exactWinnerCount
      ) {

        exactWinner =
          mac;


        exactWinnerCount =
          counts[
            mac
          ];

      }

    }

  );


  /*
   * Two identical independent OCR readings
   * are enough if no competing result has
   * the same number of votes.
   */

  if (
    exactWinner &&
    exactWinnerCount >= 2
  ) {

    const tied =
      Object.keys(
        counts
      )
      .filter(

        function (
          mac
        ) {

          return (
            mac !==
            exactWinner &&
            counts[mac] ===
            exactWinnerCount
          );

        }

      );


    if (
      tied.length ===
      0
    ) {

      acceptVerifiedMac(

        exactWinner,

        exactWinnerCount >= 3
          ? 'HIGH'
          : 'GOOD',

        readings.length,

        exactWinnerCount

      );


      return;

    }

  }


  /*
   * Character-level consensus.
   */

  const compactReadings =
    readings.map(

      function (
        reading
      ) {

        return reading.mac
          .replace(
            /:/g,
            ''
          );

      }

    );


  const output =
    [];


  let weakestRatio =
    1;


  for (

    let position = 0;

    position < 12;

    position++

  ) {

    const frequency =
      {};


    compactReadings.forEach(

      function (
        value
      ) {

        const char =
          value[
            position
          ];


        frequency[
          char
        ] =
          (
            frequency[
              char
            ] ||
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
          frequency[
            char
          ] >
          bestCount
        ) {

          bestChar =
            char;


          bestCount =
            frequency[
              char
            ];

        }

      }

    );


    const ratio =
      bestCount /
      compactReadings.length;


    weakestRatio =
      Math.min(
        weakestRatio,
        ratio
      );


    if (
      ratio <
      CHARACTER_CONSENSUS_RATIO
    ) {

      rejectScan(
        'OCR readings disagree on one or more MAC characters.'
      );

      return;

    }


    output.push(
      bestChar
    );

  }


  const finalCompact =
    output.join(
      ''
    );


  const finalMac =
    formatMac(
      finalCompact
    );


  /*
   * Character reconstruction is accepted only
   * if at least one full OCR result also matches it.
   */

  const exactSupport =
    compactReadings.filter(

      function (
        value
      ) {

        return (
          value ===
          finalCompact
        );

      }

    ).length;


  if (
    exactSupport <
    1
  ) {

    rejectScan(
      'Character consensus exists but no complete OCR reading confirms it.'
    );

    return;

  }


  acceptVerifiedMac(

    finalMac,

    weakestRatio >= 0.85
      ? 'HIGH'
      : 'GOOD',

    readings.length,

    exactSupport

  );

}



/**
 * ==========================================================
 * ACCEPT MAC
 * ==========================================================
 */

function acceptVerifiedMac(

  mac,

  confidence,

  readingCount,

  exactMatches

) {

  if (
    !isPlausibleMac(
      mac
    )
  ) {

    rejectScan(
      'The detected value failed MAC validation.'
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
      'ocr',

    confirmed:
      true,

    confidence:
      confidence,

    details:
      exactMatches +
      ' exact match(es) from ' +
      readingCount +
      ' valid OCR readings',

    mac:
      mac

  };


  updateVerifiedMacUI();


  setOCRStatus(
    false
  );


  vibrateSuccess();


  showMessage(

    'VERIFIED MAC: ' +
    mac,

    'success'

  );

}



/**
 * ==========================================================
 * REJECT OCR
 * ==========================================================
 */

function rejectScan(
  reason
) {

  resetVerification();


  const input =
    document.getElementById(
      'macInput'
    );


  input.value =
    '';


  document
    .getElementById(
      'saveBtn'
    )
    .disabled =
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
    reason;


  validation.style.color =
    '#d63b3b';


  showMessage(

    reason +
    ' Move closer to the MAC text and scan again.',

    'warning'

  );

}



/**
 * ==========================================================
 * MAC EXTRACTION
 *
 * This is the important V1.1.4 change.
 *
 * Accept:
 *
 * 48:EA:62:CB:B6:8B
 * 48-EA-62-CB-B6-8B
 * 48 EA 62 CB B6 8B
 * 48EA62CBB68B (only near MAC label)
 *
 * Also detects OCR-confused groups such as:
 *
 * 48:EA:62:CB:B6:8O
 *
 * and safely converts the last O to 0.
 * ==========================================================
 */

function extractMacCandidates(
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


  const candidates =
    [];


  lines.forEach(

    function (
      line,
      lineIndex
    ) {

      const macContext =
        isMacContextLine(
          line
        );


      /*
       * ------------------------------------------------------
       * 1. Exact colon separated MAC
       * ------------------------------------------------------
       */

      const exactColon =
        line.match(
          /(?:[0-9A-F]{2}:){5}[0-9A-F]{2}/g
        );


      if (
        exactColon
      ) {

        exactColon.forEach(

          function (
            value
          ) {

            addCandidate(

              candidates,

              value,

              100

            );

          }

        );

      }


      /*
       * ------------------------------------------------------
       * 2. Exact dash separated MAC
       * ------------------------------------------------------
       */

      const exactDash =
        line.match(
          /(?:[0-9A-F]{2}-){5}[0-9A-F]{2}/g
        );


      if (
        exactDash
      ) {

        exactDash.forEach(

          function (
            value
          ) {

            addCandidate(

              candidates,

              value,

              98

            );

          }

        );

      }


      /*
       * ------------------------------------------------------
       * 3. Space separated MAC
       * ------------------------------------------------------
       */

      const exactSpace =
        line.match(
          /(?:[0-9A-F]{2}\s+){5}[0-9A-F]{2}/g
        );


      if (
        exactSpace
      ) {

        exactSpace.forEach(

          function (
            value
          ) {

            addCandidate(

              candidates,

              value,

              95

            );

          }

        );

      }


      /*
       * ------------------------------------------------------
       * 4. Cisco dotted MAC
       * ------------------------------------------------------
       */

      const dotted =
        line.match(
          /\b[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}\b/g
        );


      if (
        dotted
      ) {

        dotted.forEach(

          function (
            value
          ) {

            addCandidate(

              candidates,

              value,

              95

            );

          }

        );

      }


      /*
       * ------------------------------------------------------
       * 5. OCR tolerant separated pattern
       *
       * Each pair may contain OCR-confused letters.
       *
       * Example:
       * 48:EA:62:CB:B6:8O
       * ------------------------------------------------------
       */

      const tolerantMatches =
        line.match(
          /(?:[0-9A-Z]{2}[:\-]){5}[0-9A-Z]{2}/g
        );


      if (
        tolerantMatches
      ) {

        tolerantMatches.forEach(

          function (
            raw
          ) {

            const corrected =
              correctSeparatedMacOCR(
                raw
              );


            if (
              corrected
            ) {

              addCandidate(

                candidates,

                corrected,

                80

              );

            }

          }

        );

      }


      /*
       * ------------------------------------------------------
       * 6. Compact form only in MAC context
       * ------------------------------------------------------
       */

      if (
        macContext
      ) {

        const compact =
          line.match(
            /\b[0-9A-F]{12}\b/g
          );


        if (
          compact
        ) {

          compact.forEach(

            function (
              value
            ) {

              addCandidate(

                candidates,

                value,

                85

              );

            }

          );

        }


        /*
         * Check next line if current line is a MAC label.
         */

        if (
          lineIndex + 1 <
          lines.length
        ) {

          const nextLine =
            lines[
              lineIndex + 1
            ];


          const nextCandidates =
            extractMacFromLabelValueLine(
              nextLine
            );


          nextCandidates.forEach(

            function (
              item
            ) {

              candidates.push(
                item
              );

            }

          );

        }

      }

    }

  );


  /*
   * Deduplicate candidates,
   * keeping highest quality.
   */

  const best =
    {};


  candidates.forEach(

    function (
      item
    ) {

      if (

        !best[
          item.mac
        ] ||

        item.quality >
        best[
          item.mac
        ].quality

      ) {

        best[
          item.mac
        ] =
          item;

      }

    }

  );


  return Object.values(
    best
  );

}



/**
 * ==========================================================
 * VALUE LINE AFTER MAC LABEL
 * ==========================================================
 */

function extractMacFromLabelValueLine(
  line
) {

  const candidates =
    [];


  const upper =
    String(
      line
    ).toUpperCase();


  const tolerant =
    upper.match(
      /(?:[0-9A-Z]{2}[:\-]){5}[0-9A-Z]{2}/g
    );


  if (
    tolerant
  ) {

    tolerant.forEach(

      function (
        raw
      ) {

        const corrected =
          correctSeparatedMacOCR(
            raw
          );


        if (
          corrected
        ) {

          candidates.push({

            mac:
              corrected,

            quality:
              90

          });

        }

      }

    );

  }


  const compact =
    upper.match(
      /\b[0-9A-F]{12}\b/g
    );


  if (
    compact
  ) {

    compact.forEach(

      function (
        value
      ) {

        const mac =
          normalizeMac(
            value
          );


        if (
          mac
        ) {

          candidates.push({

            mac:
              mac,

            quality:
              88

          });

        }

      }

    );

  }


  return candidates;

}



/**
 * ==========================================================
 * ADD CANDIDATE
 * ==========================================================
 */

function addCandidate(

  list,

  raw,

  quality

) {

  const mac =
    normalizeMac(
      raw
    );


  if (
    !mac
  ) {

    return;

  }


  if (
    !isPlausibleMac(
      mac
    )
  ) {

    return;

  }


  list.push({

    mac:
      mac,

    quality:
      quality

  });

}



/**
 * ==========================================================
 * OCR CORRECTION FOR SEPARATED MAC ONLY
 *
 * Very important:
 * corrections are NOT applied to arbitrary text.
 * ==========================================================
 */

function correctSeparatedMacOCR(
  raw
) {

  const groups =
    String(raw)
      .toUpperCase()
      .split(
        /[:-]/
      );


  if (
    groups.length !==
    6
  ) {

    return null;

  }


  const correctedGroups =
    [];


  for (
    let group
    of groups
  ) {

    if (
      group.length !==
      2
    ) {

      return null;

    }


    let corrected =
      '';


    for (
      let char
      of group
    ) {

      /*
       * Already valid hexadecimal.
       */

      if (
        /[0-9A-F]/
          .test(
            char
          )
      ) {

        corrected +=
          char;

        continue;

      }


      /*
       * Conservative OCR correction.
       */

      const map = {

        O:
          '0',

        Q:
          '0',

        I:
          '1',

        L:
          '1',

        S:
          '5',

        G:
          '6'

      };


      if (
        map[
          char
        ]
      ) {

        corrected +=
          map[
            char
          ];

      } else {

        return null;

      }

    }


    correctedGroups.push(
      corrected
    );

  }


  const candidate =
    correctedGroups.join(
      ':'
    );


  return normalizeMac(
    candidate
  );

}



/**
 * ==========================================================
 * MAC CONTEXT
 * ==========================================================
 */

function isMacContextLine(
  line
) {

  const value =
    String(line)
      .toUpperCase();


  const labels = [

    'MAC',

    'MAC ADDRESS',

    'MACADDRESS',

    'PHYSICAL ADDRESS',

    'WLAN',

    'WIRELESS',

    'WI-FI',

    'WIFI',

    'ETHERNET',

    'LAN'

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
 * MAC SANITY
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
 * IMAGE CLONE
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
    1.45;


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

              /*
               * Do not overwrite our own
               * scan progress constantly.
               */

              if (
                message.status ===
                'loading tesseract core'
              ) {

                setOCRStatus(

                  true,

                  'Loading OCR engine...',

                  'Preparing scanner'

                );

              }

            }

        }

      );


  /*
   * More permissive than V1.1.3.
   */

  await ocrWorker.setParameters({

    preserve_interword_spaces:
      '1'

  });


  return ocrWorker;

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


            const worker =
              await getOCRWorker();


            const variants = [

              canvas,

              createContrastCanvas(
                canvas
              )

            ];


            const readings =
              [];


            for (

              let i = 0;

              i <
              variants.length;

              i++

            ) {

              setOCRStatus(

                true,

                'Reading photo...',

                'OCR ' +
                (i + 1) +
                ' of ' +
                variants.length

              );


              const result =
                await recognizeWithTimeout(

                  worker,

                  variants[i]

                );


              const text =
                result &&
                result.data
                  ? result.data.text || ''
                  : '';


              const candidates =
                extractMacCandidates(
                  text
                );


              candidates.forEach(

                function (
                  candidate
                ) {

                  readings.push(
                    candidate
                  );

                }

              );

            }


            evaluateReadings(
              readings
            );


          } catch (
            error
          ) {

            rejectScan(
              'Photo OCR failed: ' +
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
 * VERIFIED UI
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

    'VERIFIED MAC'

  );


  validation.textContent =

    'OCR verification • ' +

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
 * VALIDATE UI
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
        'Valid MAC Address • Manual entry';


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

          'Server timeout. Check Apps Script deployment.',

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
