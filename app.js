/**
 * ============================================================
 * ICHC MAC Scanner
 *
 * V1.1.3
 * PaddleOCR Remote Engine
 *
 * Primary OCR:
 *   iPhone / Browser
 *        ↓
 *   ngrok HTTPS
 *        ↓
 *   Local Flask Server
 *        ↓
 *   PaddleOCR
 *
 * Fallback OCR:
 *   Tesseract.js in browser
 *
 * Google Sheets:
 *   Apps Script API
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
 * Paste here the SAME Apps Script /exec URL
 * you already used in the previous working version.
 */
const API_URL =
  'https://script.google.com/a/macros/ichc.ro/s/AKfycbxNhJ2t4fZIu1K_lv2C5dUC1os0wFQN5J0CwIE85iFthjC-0wguwcLhIXIXsSHFKSAo6g/exec';


/**
 * PaddleOCR server through ngrok.
 */
const PADDLE_SERVER_URL =
  'https://reporter-visibly-number.ngrok-free.dev';


const PADDLE_HEALTH_URL =
  PADDLE_SERVER_URL + '/health';


const PADDLE_OCR_URL =
  PADDLE_SERVER_URL + '/ocr-mac';


const APP_VERSION =
  'V1.1.3';


/**
 * Remote OCR consensus.
 *
 * Three separate camera frames are sent to PaddleOCR.
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
 * Network timeout.
 */
const OCR_SERVER_TIMEOUT_MS =
  20000;



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


/**
 * Verification state
 */
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


    handleMacInput();


    loadDashboard();


    await discoverCameras();


    checkPaddleServer();


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

      'ICHC MAC Scanner • PaddleOCR Remote Engine • ' +

      APP_VERSION;

  }

}



/**
 * ============================================================
 * UTILITY DELAY
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
 * CHECK PADDLEOCR SERVER
 * ============================================================
 */

async function checkPaddleServer() {


  try {


    const controller =
      new AbortController();


    const timeout =
      setTimeout(

        function () {

          controller.abort();

        },

        6000

      );


    const response =
      await fetch(

        PADDLE_HEALTH_URL,

        {

          method:
            'GET',

          cache:
            'no-store',

          signal:
            controller.signal

        }

      );


    clearTimeout(
      timeout
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


    paddleServerOnline =
      !!(
        data &&
        data.success
      );


    if (
      paddleServerOnline
    ) {

      setSystemStatus(

        'PaddleOCR ready',

        true

      );

    }


  } catch (
    error
  ) {


    paddleServerOnline =
      false;


    console.warn(

      'PaddleOCR server offline:',

      error

    );


    setSystemStatus(

      'Local OCR mode',

      true

    );

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
 * POPULATE CAMERA LIST
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



    if (
      paddleServerOnline
    ) {

      setSystemStatus(

        'PaddleOCR ready',

        true

      );

    } else {

      setSystemStatus(

        'Camera ready',

        true

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



  scanBtn.disabled =
    true;



  try {


    /**
     * Primary path:
     * PaddleOCR remote server.
     */

    if (
      paddleServerOnline
    ) {


      await runRemotePaddleConsensus(
        video
      );


    } else {


      /**
       * Server appears offline.
       * Try again once before using fallback.
       */

      await checkPaddleServer();



      if (
        paddleServerOnline
      ) {


        await runRemotePaddleConsensus(
          video
        );


      } else {


        await runLocalTesseractFallback(
          video
        );


      }


    }


  } catch (
    error
  ) {


    console.error(

      'Scan error:',

      error

    );



    showMessage(

      'Remote OCR unavailable. Trying local OCR.',

      'warning'

    );



    try {


      await runLocalTesseractFallback(
        video
      );


    } catch (
      fallbackError
    ) {


      console.error(

        'Fallback OCR failed:',

        fallbackError

      );



      rejectMacResult(

        'OCR failed. Please try again.'

      );


    }


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
 * ============================================================
 * REMOTE PADDLE CONSENSUS
 * ============================================================
 */

async function runRemotePaddleConsensus(
  video
) {


  setOCRStatus(

    true,

    'PaddleOCR',

    'Hold the phone steady...'

  );



  await sleep(
    REMOTE_INITIAL_DELAY_MS
  );



  const readings =
    [];



  let networkFailures =
    0;



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



      console.log(

        'PaddleOCR result ' +
        (i + 1) +
        ':',

        result

      );



      if (

        result &&

        result.success &&

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


    } catch (
      error
    ) {


      networkFailures++;



      console.warn(

        'Remote OCR request failed:',

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
   * If all server calls failed,
   * this is a connectivity failure.
   *
   * Then local OCR fallback is allowed.
   */

  if (

    networkFailures ===
    REMOTE_SCAN_COUNT

  ) {


    paddleServerOnline =
      false;



    throw new Error(
      'PaddleOCR server unreachable.'
    );


  }



  evaluateRemoteConsensus(
    readings
  );

}



/**
 * ============================================================
 * REMOTE CONSENSUS DECISION
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



  /**
   * V1.1.3 safety rules:
   *
   * Accept when:
   *
   * 1. Same MAC appears in 3/3 scans
   *
   * OR
   *
   * 2. Same MAC appears in at least 2 scans
   *    AND at least one OCR result was associated
   *    with a MAC/Physical Address label.
   *
   * OR
   *
   * 3. Same MAC appears in 2/3 scans.
   *
   * Rule 3 is still allowed because PaddleOCR
   * is substantially more reliable than browser OCR.
   */

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

      'Paddle consensus rejected:',

      groups

    );



    rejectMacResult(

      'Different MAC addresses were detected. Hold the phone steady and scan again.'

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
 * SEND IMAGE TO PADDLEOCR
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



  const controller =
    new AbortController();



  const timeout =

    setTimeout(

      function () {

        controller.abort();

      },

      OCR_SERVER_TIMEOUT_MS

    );



  try {


    const response =

      await fetch(

        PADDLE_OCR_URL,

        {

          method:
            'POST',

          body:
            formData,

          signal:
            controller.signal,

          cache:
            'no-store'

        }

      );



    if (
      !response.ok
    ) {


      throw new Error(

        'PaddleOCR HTTP ' +
        response.status

      );


    }



    const data =

      await response.json();



    return data;


  } finally {


    clearTimeout(
      timeout
    );


  }

}



/**
 * ============================================================
 * CANVAS TO JPEG BLOB
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

        0.92

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
   * Crop around scanner frame.
   *
   * Keep enough vertical area for:
   *
   * Physical Address (MAC):
   * AA:BB:CC:DD:EE:FF
   */

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



  /**
   * PaddleOCR benefits from larger text.
   *
   * Upscale smaller captures.
   */

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



          await scanPhotoWithPaddle(
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
 * PHOTO THROUGH PADDLEOCR
 * ============================================================
 */

async function scanPhotoWithPaddle(
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

    'Uploading photo...'

  );



  try {


    if (
      !paddleServerOnline
    ) {


      await checkPaddleServer();


    }



    if (
      paddleServerOnline
    ) {


      const result =

        await sendCanvasToPaddle(
          canvas
        );



      console.log(

        'Paddle photo result:',

        result

      );



      if (

        result &&

        result.success &&

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

          'PaddleOCR could not detect a MAC Address in this photo.'

        );


      }


    } else {


      await runLocalTesseractCanvas(
        canvas
      );


    }


  } catch (
    error
  ) {


    console.error(
      error
    );



    showMessage(

      'PaddleOCR unavailable. Trying local OCR.',

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
 * LOCAL FALLBACK FROM CAMERA
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

    'Local OCR text:',

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

      'Local OCR result • Please verify manually';



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

      'No reliable MAC Address was detected.'

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
 * REJECT MAC RESULT
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


  input.value =
    '';



  document

    .getElementById(
      'saveBtn'
    )

    .disabled =
    true;



  const validation =

    document.getElementById(
      'macValidation'
    );


  validation.textContent =

    'No verified MAC Address';



  validation.style.color =
    '#d63b3b';



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



  document

    .getElementById(
      'saveBtn'
    )

    .disabled =
    false;

}



/**
 * ============================================================
 * VALIDATION
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



    validation.textContent =

      'Valid MAC format • Verify before saving';



    validation.style.color =
      '#16864b';



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
 * APPS SCRIPT JSONP API
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
      'Apps Script API URL not configured.'
    );


    if (
      parameters.action !==
      'dashboard'
    ) {


      showMessage(

        'Google Sheets API URL is not configured in app.js.',

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
 * OCR STATUS UI
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
